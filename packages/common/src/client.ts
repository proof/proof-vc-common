import {
  buildAuthorizationSearchParams,
  authorizeUrlFromSearchParams,
  type ClientConfig,
  type AuthorizationRequestParams,
} from "./internal.ts";

export type { ClientConfig, AuthorizationRequestParams } from "./internal.ts";

export type AuthorizationResponse = {
  vpToken: string;
  state?: string;
};

export interface VCClient {
  authorizationUrl(params: AuthorizationRequestParams): string;
}

export function createClient(config: ClientConfig): VCClient {
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
  const vpToken = search.get("vp_token");
  if (vpToken === null) {
    return null;
  }
  const state = search.get("state");
  return { vpToken, ...(state !== null && { state }) };
}
