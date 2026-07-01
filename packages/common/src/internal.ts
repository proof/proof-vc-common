import type {
  Environment,
  ResponseMode,
  ResponseType,
  Scope,
} from "./types.ts";
import type { DCQLQuery } from "./dcql.ts";

export const OID4VP_URI = "/verifiable-credentials/v1/presentation";
export const RESPONSE_TYPE: ResponseType = "vp_token";
const DEFAULT_RESPONSE_MODE: ResponseMode = "fragment";

export type ClientConfig = {
  environment: Environment;
  clientId: string;
  callbackUri: string;
  responseMode?: ResponseMode;
};

type BaseAuthorizationRequestParams = {
  nonce: string;
  state?: string;
  loginHint?: string;
};

export type AuthorizationRequestParams = BaseAuthorizationRequestParams &
  (
    | { scope: Scope; dcqlQuery?: never }
    | { dcqlQuery: DCQLQuery; scope?: never }
  );

export function resolveBaseUrl(environment: Environment): string {
  switch (environment) {
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

export function buildAuthorizationSearchParams(
  config: ClientConfig,
  params: AuthorizationRequestParams,
): URLSearchParams {
  const { scope, dcqlQuery, nonce, state, loginHint } = params;
  if ((scope === undefined) === (dcqlQuery === undefined)) {
    throw new Error(
      "authorization request requires exactly one of `scope` or `dcqlQuery`",
    );
  }
  const responseMode = config.responseMode ?? DEFAULT_RESPONSE_MODE;
  return new URLSearchParams({
    client_id: config.clientId,
    response_mode: responseMode,
    response_type: RESPONSE_TYPE,
    ...(responseMode === "fragment" && { redirect_uri: config.callbackUri }),
    ...(responseMode === "direct_post" && { response_uri: config.callbackUri }),
    ...(scope !== undefined && { scope }),
    ...(dcqlQuery !== undefined && { dcql_query: JSON.stringify(dcqlQuery) }),
    nonce,
    ...(state !== undefined && { state }),
    ...(loginHint !== undefined && { login_hint: loginHint }),
  });
}

export function authorizeUrlFromSearchParams(
  environment: Environment,
  search: URLSearchParams,
): string {
  const url = new URL(`${OID4VP_URI}/authorize`, resolveBaseUrl(environment));
  url.search = search.toString();
  return url.toString();
}
