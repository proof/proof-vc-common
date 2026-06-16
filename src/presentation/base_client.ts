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

export type BrowserInitParams = {
  environment: Environment;
  clientId: string;
  callbackUri: string;
  responseMode?: ResponseMode;
};

export type AuthorizationRequestParams = {
  scope: Scope;
  nonce: string;
  state?: string;
  loginHint?: string;
  transactionData?: TransactionData | string;
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
    nonce,
    state,
    loginHint,
    transactionData,
  }: AuthorizationRequestParams): URLSearchParams {
    const encodedTransactionData =
      typeof transactionData === "object"
        ? encodeTransactionData(transactionData)
        : transactionData;
    return new URLSearchParams({
      ...this.defaultAuthorizationRequestParameters(),
      scope,
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
