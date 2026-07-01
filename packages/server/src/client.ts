import {
  OID4VP_URI,
  RESPONSE_TYPE,
  resolveBaseUrl,
  buildAuthorizationSearchParams,
  authorizeUrlFromSearchParams,
  type ClientConfig,
  type AuthorizationRequestParams,
} from "@proof.com/proof-vc-common/internal";
import type { DCQLQuery } from "@proof.com/proof-vc-common";
import {
  encodeTransactionData,
  type TransactionData,
} from "./transaction_data.ts";

export type ServerClientConfig = ClientConfig & {
  clientSecret?: string;
  usePushedAuthorizationRequest?: boolean;
};

export type ServerAuthorizationRequestParams = AuthorizationRequestParams & {
  transactionData?: TransactionData | string;
};

export type DCAPIAuthorizationRequestParams = {
  dcqlQuery: DCQLQuery;
  nonce: string;
  transactionData?: TransactionData | string;
};

export type AuthorizationRequest = {
  response_type: typeof RESPONSE_TYPE;
  response_mode: "dc_api";
  nonce: string;
  dcql_query: DCQLQuery;
  transaction_data?: string[];
};

export interface ServerVCClient {
  authorizationUrl(params: ServerAuthorizationRequestParams): Promise<string>;
  dcApiRequest(params: DCAPIAuthorizationRequestParams): AuthorizationRequest;
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
    if (config.clientSecret !== undefined) {
      search.set("client_secret", config.clientSecret);
    }
    const encoded = encodeTxData(params.transactionData);
    if (encoded !== undefined) {
      search.set("transaction_data", encoded);
    }
    return search;
  }

  async function pushAuthorizationRequest(
    search: URLSearchParams,
  ): Promise<string> {
    if (config.clientSecret === undefined) {
      throw new Error(
        "pushed authorization requests require `clientSecret` in the client config",
      );
    }
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
      const search = buildParams(params);
      return config.usePushedAuthorizationRequest === true
        ? pushAuthorizationRequest(search)
        : authorizeUrlFromSearchParams(config.environment, search);
    },
    dcApiRequest({
      dcqlQuery,
      nonce,
      transactionData,
    }: DCAPIAuthorizationRequestParams): AuthorizationRequest {
      const encoded = encodeTxData(transactionData);
      return {
        response_type: RESPONSE_TYPE,
        response_mode: "dc_api",
        nonce,
        dcql_query: dcqlQuery,
        ...(encoded !== undefined && { transaction_data: [encoded] }),
      };
    },
  };
}
