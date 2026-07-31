import {
  OID4VP_URI,
  RESPONSE_TYPE,
  resolveBaseUrl,
  buildAuthorizationSearchParams,
  authorizeUrlFromSearchParams,
  assertScopeOrDcql,
  type ClientConfig,
  type AuthorizationRequestParams,
} from "@proof.com/proof-vc-common/internal";
import type { DCQLQuery, Scope } from "@proof.com/proof-vc-common";
import type { JWK } from "jose";
import {
  encodeTransactionData,
  type TransactionData,
} from "./transaction_data.ts";
import { signRequestObject, requestObjectClaims } from "./secured_request.ts";

export type PrivateKeyFactory = () => JWK | Promise<JWK>;

export type ServerClientConfig = ClientConfig & {
  clientSecret?: string;
  usePushedAuthorizationRequest?: boolean;
  useSecuredAuthorizationRequest?: boolean;
  privateKeyFactory?: PrivateKeyFactory;
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
  response_uri: string;
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
  authorizationUrl(params: ServerAuthorizationRequestParams): Promise<string>;
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

export function createClient(config: ServerClientConfig): ServerVCClient {
  function buildParams(
    params: ServerAuthorizationRequestParams,
  ): URLSearchParams {
    const search = buildAuthorizationSearchParams(config, params);
    const encoded = encodeTxData(params.transactionData);
    if (encoded !== undefined) {
      search.set("transaction_data", encoded);
    }
    return search;
  }

  function signedRequest(
    params: ServerAuthorizationRequestParams,
  ): Promise<string> {
    return signRequestObject(config, requestObjectClaims(buildParams(params)));
  }

  async function pushAuthorizationRequest(
    search: URLSearchParams,
  ): Promise<string> {
    if (config.clientSecret === undefined) {
      throw new Error(
        "pushed authorization requests require `clientSecret` in the client config",
      );
    }
    search.set("client_secret", config.clientSecret);
    const parURL = new URL(
      `${OID4VP_URI}/par`,
      resolveBaseUrl(config.environment),
    ).toString();
    const response = await fetch(parURL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: search.toString(),
    });
    const data = (await response.json()) as Record<string, string | undefined>;

    if (!response.ok) {
      throw new Error(`${data["error"]}: ${data["error_description"]}`);
    }
    const requestUri = data["request_uri"];
    if (typeof requestUri !== "string") {
      throw new Error(
        "pushed authorization request response missing `request_uri`",
      );
    }

    const authorizeURL = new URL(
      `${OID4VP_URI}/authorize`,
      resolveBaseUrl(config.environment),
    );
    authorizeURL.search = new URLSearchParams({
      client_id: config.clientId,
      request_uri: requestUri,
    }).toString();
    return authorizeURL.toString();
  }

  return {
    async authorizationUrl(
      params: ServerAuthorizationRequestParams,
    ): Promise<string> {
      const search =
        config.useSecuredAuthorizationRequest === true
          ? new URLSearchParams({
              client_id: config.clientId,
              request: await signedRequest(params),
            })
          : buildParams(params);
      return config.usePushedAuthorizationRequest === true
        ? pushAuthorizationRequest(search)
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
      if (expectedOrigins.length === 0) {
        throw new Error("`expectedOrigins` must be a non-empty array");
      }
      assertScopeOrDcql({ scope, dcqlQuery });
      const encoded = encodeTxData(transactionData);
      const request: DCAPIAuthorizationRequest = {
        client_id: config.clientId,
        response_type: RESPONSE_TYPE,
        response_mode: "dc_api",
        response_uri: config.callbackUri,
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
        throw new Error(
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
