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

export type VCPresentationClientParams = {
  environment: Environment;
  client_id: string;
  client_secret?: string;
  use_pushed_authorization_request?: boolean;
  response_mode?: ResponseMode;
  callback_uri: string;
};

export type AuthorizationRequestParams = {
  scope: Scope;
  nonce: string;
  state?: string;
  login_hint?: string;
  transaction_data?: TransactionData | string;
};

export class VCPresentationClient {
  protected readonly environment: Environment;
  protected readonly client_id: string;
  protected readonly client_secret?: string;
  protected readonly use_pushed_authorization_request: boolean = false;
  protected readonly response_mode: ResponseMode = "fragment";
  protected readonly response_type: ResponseType = "vp_token";
  protected readonly callback_uri: string;
  protected readonly oid4vp_uri = "/verifiable-credentials/v1/presentation";

  constructor({
    environment,
    client_id,
    client_secret,
    use_pushed_authorization_request,
    response_mode,
    callback_uri,
  }: VCPresentationClientParams) {
    this.environment = environment;
    this.client_id = client_id;
    this.callback_uri = callback_uri;

    if (client_secret !== undefined) {
      this.client_secret = client_secret;
    }
    if (use_pushed_authorization_request !== undefined) {
      this.use_pushed_authorization_request = use_pushed_authorization_request;
    }
    if (response_mode !== undefined) {
      this.response_mode = response_mode;
    }
  }

  public async getAuthorizationRequestURL(
    params: AuthorizationRequestParams,
  ): Promise<string> {
    const url = this.buildAuthorizationRequestURL(params);

    if (this.use_pushed_authorization_request) {
      const response = await fetch(url, { method: "post" });
      const data = await response.json();

      if (!response.ok) {
        throw `${data["error"]}: ${data["error_description"]}`;
      } else {
        return data["request_uri"];
      }
    } else {
      return url;
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
    }
  }

  private buildAuthorizationRequestURL({
    scope,
    nonce,
    state,
    login_hint,
    transaction_data,
  }: AuthorizationRequestParams): string {
    const baseURL = this.baseURL();
    const endpoint = this.use_pushed_authorization_request
      ? "/par"
      : "/authorize";
    const encodedTransactionData =
      typeof transaction_data === "object"
        ? encodeTransactionData(transaction_data)
        : transaction_data;
    const params = new URLSearchParams({
      ...this.defaultAuthorizationRequestParameters(),
      scope,
      nonce,
      ...(state !== undefined && { state }),
      ...(login_hint !== undefined && { login_hint }),
      ...(encodedTransactionData !== undefined && {
        transaction_data: encodedTransactionData,
      }),
    });

    return new URL(
      `${this.oid4vp_uri}${endpoint}?${params}`,
      baseURL,
    ).toString();
  }

  private defaultAuthorizationRequestParameters() {
    return {
      client_id: this.client_id,
      ...(this.client_secret !== undefined && {
        client_secret: this.client_secret,
      }),
      response_mode: this.response_mode,
      response_type: this.response_type,
      ...(this.response_mode === "fragment" && {
        redirect_uri: this.callback_uri,
      }),
      ...(this.response_mode === "direct_post" && {
        response_uri: this.callback_uri,
      }),
    };
  }
}
