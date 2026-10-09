import {
  OID4VP_URI,
  RESPONSE_TYPE,
  resolveBaseUrl,
  buildAuthorizationSearchParams,
  authorizeUrlFromSearchParams,
  assertScopeOrDcql,
  assertBaseClientConfig,
  assertNonEmptyString,
  assertPositiveInteger,
  type ClientConfig,
  type AuthorizationRequestParams,
} from "@proof.com/proof-vc-common/internal";
import {
  ProofVCError,
  type DCQLQuery,
  type Scope,
} from "@proof.com/proof-vc-common";
import {
  encodeTransactionData,
  type TransactionData,
} from "./transaction_data.ts";
import { signRequestObject, requestObjectClaims } from "./secured_request.ts";
import { fetchJson, type HttpConfig, type RequestOptions } from "./http.ts";
import type { PrivateKey } from "./client_assertion.ts";

export type { RequestOptions } from "./http.ts";

export type PrivateKeyFactory = () => PrivateKey | Promise<PrivateKey>;

export type ServerClientConfig = Omit<ClientConfig, "callbackUri"> &
  HttpConfig & {
    callbackUri?: string;
    clientSecret?: string;
    usePushedAuthorizationRequest?: boolean;
    useSecuredAuthorizationRequest?: boolean;
    privateKeyFactory?: PrivateKeyFactory;
    requestObjectLifetime?: number;
  };

export type ServerAuthorizationRequestParams = AuthorizationRequestParams & {
  transactionData?: TransactionData | string;
};

export type DCAPIAuthorizationRequestParams =
  ServerAuthorizationRequestParams & {
    expectedOrigins: [string, ...string[]];
  };

export type DCAPIAuthorizationRequest = {
  client_id: string;
  response_type: typeof RESPONSE_TYPE;
  response_mode: "dc_api";
  nonce: string;
  expected_origins: [string, ...string[]];
  scope?: Scope;
  dcql_query?: DCQLQuery;
  state?: string;
  login_hint?: string;
  transaction_data?: string[];
};

export type JarByReferenceParams = {
  requestUri: string;
};

export interface ServerVCClient {
  authorizationUrl(
    params: ServerAuthorizationRequestParams,
    options?: RequestOptions,
  ): Promise<string>;
  signedAuthorizationRequest(
    params: ServerAuthorizationRequestParams,
  ): Promise<string>;
  signedDcApiRequest(params: DCAPIAuthorizationRequestParams): Promise<string>;
  jarByReferenceAuthorizationUrl(params: JarByReferenceParams): string;
}

function encodeTxData(
  transactionData: TransactionData | string | undefined,
): string | undefined {
  return typeof transactionData === "object"
    ? encodeTransactionData(transactionData)
    : transactionData;
}

function assertServerClientConfig(config: ServerClientConfig): void {
  assertBaseClientConfig(config);
  if (config.usePushedAuthorizationRequest === true) {
    assertNonEmptyString(config.clientSecret, "clientSecret");
  }
  if (
    config.useSecuredAuthorizationRequest === true &&
    typeof config.privateKeyFactory !== "function"
  ) {
    throw new ProofVCError(
      "invalid_config",
      "`useSecuredAuthorizationRequest` requires a `privateKeyFactory` function",
    );
  }
  if (config.timeout !== undefined) {
    assertPositiveInteger(config.timeout, "timeout");
  }
  if (config.requestObjectLifetime !== undefined) {
    assertPositiveInteger(
      config.requestObjectLifetime,
      "requestObjectLifetime",
    );
  }
}

export function createClient(config: ServerClientConfig): ServerVCClient {
  assertServerClientConfig(config);

  function requireCallbackUri(requirement: string): string {
    if (config.callbackUri === undefined) {
      throw new ProofVCError("invalid_config", requirement);
    }
    return config.callbackUri;
  }

  function buildParams(
    params: ServerAuthorizationRequestParams,
  ): URLSearchParams {
    const callbackUri = requireCallbackUri(
      "`authorizationUrl` and `signedAuthorizationRequest` require `callbackUri` in the client config",
    );
    const search = buildAuthorizationSearchParams(
      { ...config, callbackUri },
      params,
    );
    const encoded = encodeTxData(params.transactionData);
    if (encoded !== undefined) {
      search.set("transaction_data", encoded);
    }
    return search;
  }

  async function signedRequest(
    params: ServerAuthorizationRequestParams,
  ): Promise<string> {
    return signRequestObject(config, requestObjectClaims(buildParams(params)));
  }

  async function pushAuthorizationRequest(
    search: URLSearchParams,
    options?: RequestOptions,
  ): Promise<string> {
    if (config.clientSecret === undefined) {
      throw new ProofVCError(
        "invalid_config",
        "pushed authorization requests require `clientSecret` in the client config",
      );
    }
    search.set("client_secret", config.clientSecret);
    const { data } = await fetchJson({
      url: new URL(
        `${OID4VP_URI}/par`,
        resolveBaseUrl(config.environment),
      ).toString(),
      description: "pushed authorization request",
      init: {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: search.toString(),
      },
      config,
      options,
    });
    const requestUri = data["request_uri"];
    if (typeof requestUri !== "string") {
      throw new ProofVCError(
        "authorization_server_error",
        "pushed authorization request response missing `request_uri`",
      );
    }

    return authorizeUrlFromSearchParams(
      config.environment,
      new URLSearchParams({
        client_id: config.clientId,
        request_uri: requestUri,
      }),
    );
  }

  return {
    async authorizationUrl(
      params: ServerAuthorizationRequestParams,
      options?: RequestOptions,
    ): Promise<string> {
      const search =
        config.useSecuredAuthorizationRequest === true
          ? new URLSearchParams({
              client_id: config.clientId,
              request: await signedRequest(params),
            })
          : buildParams(params);
      return config.usePushedAuthorizationRequest === true
        ? pushAuthorizationRequest(search, options)
        : authorizeUrlFromSearchParams(config.environment, search);
    },

    signedAuthorizationRequest(
      params: ServerAuthorizationRequestParams,
    ): Promise<string> {
      return signedRequest(params);
    },

    async signedDcApiRequest({
      scope,
      dcqlQuery,
      nonce,
      state,
      loginHint,
      expectedOrigins,
      transactionData,
    }: DCAPIAuthorizationRequestParams): Promise<string> {
      if (
        !Array.isArray(expectedOrigins) ||
        expectedOrigins.length === 0 ||
        !expectedOrigins.every((origin) => typeof origin === "string")
      ) {
        throw new ProofVCError(
          "invalid_config",
          "`expectedOrigins` must be a non-empty array of origin strings",
        );
      }
      assertScopeOrDcql({ scope, dcqlQuery });
      const encoded = encodeTxData(transactionData);
      const request: DCAPIAuthorizationRequest = {
        client_id: config.clientId,
        response_type: RESPONSE_TYPE,
        response_mode: "dc_api",
        nonce,
        expected_origins: expectedOrigins,
        ...(scope !== undefined && { scope }),
        ...(dcqlQuery !== undefined && { dcql_query: dcqlQuery }),
        ...(state !== undefined && { state }),
        ...(loginHint !== undefined && { login_hint: loginHint }),
        ...(encoded !== undefined && { transaction_data: [encoded] }),
      };
      return signRequestObject(config, { ...request });
    },

    jarByReferenceAuthorizationUrl({
      requestUri,
    }: JarByReferenceParams): string {
      if (config.usePushedAuthorizationRequest === true) {
        throw new ProofVCError(
          "invalid_config",
          "JAR by reference cannot be combined with pushed authorization requests",
        );
      }

      return authorizeUrlFromSearchParams(
        config.environment,
        new URLSearchParams({
          client_id: config.clientId,
          request_uri: requestUri,
        }),
      );
    },
  };
}
