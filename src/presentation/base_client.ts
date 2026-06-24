import type {
  Environment,
  ResponseMode,
  ResponseType,
  Scope,
} from "../types.ts";
import {
  encodeTransactionData,
  type TransactionData,
} from "../transaction_data.ts";
import type { DCQLQuery } from "../dcql.ts";

export type BrowserInitParams = {
  environment: Environment;
  clientId: string;
  callbackUri: string;
  responseMode?: ResponseMode;
};

type BaseAuthorizationRequestParams = {
  nonce: string;
  state?: string;
  loginHint?: string;
  transactionData?: TransactionData | string;
};

export type AuthorizationRequestParams = BaseAuthorizationRequestParams &
  (
    | { scope: Scope; dcqlQuery?: never }
    | { dcqlQuery: DCQLQuery; scope?: never }
  );

export type DCAPIAuthorizationRequestParams = {
  dcqlQuery: DCQLQuery;
  nonce: string;
  transactionData?: TransactionData | string;
};

export type AuthorizationRequest = {
  response_type: ResponseType;
  response_mode: "dc_api";
  nonce: string;
  dcql_query: DCQLQuery;
  transaction_data?: string[];
};

export class VCPresentationClient {
  protected readonly environment?: Environment;
  protected readonly clientId?: string;
  protected readonly responseMode: ResponseMode = "fragment";
  protected readonly responseType: ResponseType = "vp_token";
  protected readonly callbackUri?: string;
  protected readonly oid4vpUri = "/verifiable-credentials/v1/presentation";

  constructor(params: {
    environment?: Environment;
    clientId?: string;
    responseMode?: ResponseMode;
    callbackUri?: string;
  }) {
    if (params.environment !== undefined) {
      this.environment = params.environment;
    }
    if (params.clientId !== undefined) {
      this.clientId = params.clientId;
    }
    if (params.callbackUri !== undefined) {
      this.callbackUri = params.callbackUri;
    }
    if (params.responseMode !== undefined) {
      this.responseMode = params.responseMode;
    }
  }

  public async getAuthorizationRequestURL(
    params: AuthorizationRequestParams,
  ): Promise<string> {
    this.requireRequestConfig();
    return this.buildAuthorizeURL(params);
  }

  // Builds an unsigned DC API request (`response_mode: "dc_api"`). DC API
  // requests will eventually be signed (`response_mode: "dc_api.jwt"`).
  public getDCAPIAuthorizationRequest({
    dcqlQuery,
    nonce,
    transactionData,
  }: DCAPIAuthorizationRequestParams): AuthorizationRequest {
    const encodedTransactionData =
      typeof transactionData === "object"
        ? encodeTransactionData(transactionData)
        : transactionData;
    return {
      response_type: this.responseType,
      response_mode: "dc_api",
      nonce,
      dcql_query: dcqlQuery,
      ...(encodedTransactionData !== undefined && {
        transaction_data: [encodedTransactionData],
      }),
    };
  }

  protected requireRequestConfig(): void {
    if (this.environment === undefined) {
      throw "getAuthorizationRequestURL requires `environment` in init()";
    }
    if (this.clientId === undefined) {
      throw "getAuthorizationRequestURL requires `clientId` in init()";
    }
    if (this.callbackUri === undefined) {
      throw "getAuthorizationRequestURL requires `callbackUri` in init()";
    }
  }

  protected baseURL(): string {
    switch (this.environment) {
      case "localhost":
        return "https://api.local.dev-notarize.com";
      case "next":
        return "https://api.next.proof.com";
      case "staging":
        return "https://api.staging.proof.com";
      case "sandbox":
        return "https://api.fairfax.proof.com";
      case "production":
        return "https://api.proof.com";
      default:
        throw "getAuthorizationRequestURL requires `environment` in init()";
    }
  }

  protected buildAuthorizeURL(params: AuthorizationRequestParams): string {
    const url = new URL(`${this.oid4vpUri}/authorize`, this.baseURL());
    url.search = this.buildParameters(params).toString();
    return url.toString();
  }

  protected buildParameters({
    scope,
    dcqlQuery,
    nonce,
    state,
    loginHint,
    transactionData,
  }: AuthorizationRequestParams): URLSearchParams {
    if ((scope === undefined) === (dcqlQuery === undefined)) {
      throw "authorization request requires exactly one of `scope` or `dcqlQuery`";
    }
    const encodedTransactionData =
      typeof transactionData === "object"
        ? encodeTransactionData(transactionData)
        : transactionData;
    return new URLSearchParams({
      ...this.defaultAuthorizationRequestParameters(),
      ...(scope !== undefined && { scope }),
      ...(dcqlQuery !== undefined && { dcql_query: JSON.stringify(dcqlQuery) }),
      nonce,
      ...(state !== undefined && { state }),
      ...(loginHint !== undefined && { login_hint: loginHint }),
      ...(encodedTransactionData !== undefined && {
        transaction_data: encodedTransactionData,
      }),
    });
  }

  protected defaultAuthorizationRequestParameters(): Record<string, string> {
    return {
      client_id: this.clientId!,
      response_mode: this.responseMode,
      response_type: this.responseType,
      ...(this.responseMode === "fragment" && {
        redirect_uri: this.callbackUri!,
      }),
      ...(this.responseMode === "direct_post" && {
        response_uri: this.callbackUri!,
      }),
    };
  }
}
