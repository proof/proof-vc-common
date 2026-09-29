import {
  buildAuthorizationSearchParams,
  authorizeUrlFromSearchParams,
  assertBaseClientConfig,
  assertNonEmptyString,
  type ClientConfig,
  type AuthorizationRequestParams,
} from "./internal.ts";

export type { ClientConfig, AuthorizationRequestParams } from "./internal.ts";

export type AuthorizationSuccessResponse = {
  type: "success";
  vpToken: string;
  state?: string;
};

export type AuthorizationErrorResponse = {
  type: "error";
  error: string;
  errorDescription?: string;
  errorUri?: string;
  state?: string;
};

export type AuthorizationResponse =
  AuthorizationSuccessResponse | AuthorizationErrorResponse;

export interface VCClient {
  authorizationUrl(params: AuthorizationRequestParams): string;
}

export function createClient(config: ClientConfig): VCClient {
  assertBaseClientConfig(config);
  assertNonEmptyString(config.callbackUri, "callbackUri");
  return {
    authorizationUrl(params: AuthorizationRequestParams): string {
      const search = buildAuthorizationSearchParams(config, params);
      return authorizeUrlFromSearchParams(config.environment, search);
    },
  };
}

export function buildAuthorizationUrl(
  input: ClientConfig & AuthorizationRequestParams,
): string {
  const { environment, clientId, callbackUri, responseMode, ...params } = input;
  const config: ClientConfig = {
    environment,
    clientId,
    callbackUri,
    ...(responseMode !== undefined && { responseMode }),
  };
  return createClient(config).authorizationUrl(
    params as AuthorizationRequestParams,
  );
}

export function parseAuthorizationResponse(
  input?: string,
): AuthorizationResponse | null {
  let raw = input;
  if (raw === undefined) {
    if (typeof window === "undefined") {
      return null;
    }
    raw =
      window.location.hash.length > 1
        ? window.location.hash
        : window.location.search;
  }
  const search = new URLSearchParams(raw.replace(/^[#?]/, ""));
  const state = search.get("state");
  const vpToken = search.get("vp_token");
  if (vpToken !== null) {
    return { type: "success", vpToken, ...(state !== null && { state }) };
  }
  const error = search.get("error");
  if (error !== null) {
    const errorDescription = search.get("error_description");
    const errorUri = search.get("error_uri");
    return {
      type: "error",
      error,
      ...(errorDescription !== null && { errorDescription }),
      ...(errorUri !== null && { errorUri }),
      ...(state !== null && { state }),
    };
  }
  return null;
}
