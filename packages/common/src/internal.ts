import type {
  Environment,
  ResponseMode,
  ResponseType,
  Scope,
} from "./types.ts";
import type { DCQLQuery } from "./dcql.ts";
import { ProofVCError } from "./errors.ts";
import { KNOWN_SCOPES } from "./constants.ts";
import { warnOnce } from "./warnings.ts";

export { warnOnce } from "./warnings.ts";

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

export const BASE_URLS = {
  localhost: "https://api.local.dev-notarize.com",
  next: "https://api.next.proof.com",
  staging: "https://api.staging.proof.com",
  sandbox: "https://api.fairfax.proof.com",
  production: "https://api.proof.com",
} satisfies Record<Environment, string>;

const RESPONSE_MODES = {
  fragment: true,
  direct_post: true,
} satisfies Record<ResponseMode, true>;

export function resolveBaseUrl(environment: Environment): string {
  return BASE_URLS[environment];
}

export function credentialIssuer(environment: Environment): string {
  return resolveBaseUrl(environment);
}

export function authorizationServerIssuer(environment: Environment): string {
  return new URL(OID4VP_URI, resolveBaseUrl(environment)).toString();
}

export function agentsTrustListUrl(environment: Environment): string {
  assertOneOf(environment, BASE_URLS, "environment");
  return new URL(
    "/.well-known/agents-trust-list",
    resolveBaseUrl(environment),
  ).toString();
}

export function assertNonEmptyString(
  value: unknown,
  name: string,
): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ProofVCError(
      "invalid_config",
      `\`${name}\` must be a non-empty string`,
    );
  }
}

export function assertOneOf<T extends string>(
  value: unknown,
  allowed: Record<T, unknown>,
  name: string,
): asserts value is T {
  if (typeof value !== "string" || !Object.hasOwn(allowed, value)) {
    throw new ProofVCError(
      "invalid_config",
      `\`${name}\` must be one of ${Object.keys(allowed)
        .map((k) => `"${k}"`)
        .join(", ")}`,
    );
  }
}

export function assertBaseClientConfig(
  config: Omit<ClientConfig, "callbackUri"> & { callbackUri?: string },
): void {
  assertOneOf(config.environment, BASE_URLS, "environment");
  assertNonEmptyString(config.clientId, "clientId");
  if (config.responseMode !== undefined) {
    assertOneOf(config.responseMode, RESPONSE_MODES, "responseMode");
  }
  if (config.callbackUri !== undefined) {
    assertNonEmptyString(config.callbackUri, "callbackUri");
  }
}

export function assertScopeOrDcql(params: {
  scope: Scope | undefined;
  dcqlQuery: DCQLQuery | undefined;
}): void {
  if ((params.scope === undefined) === (params.dcqlQuery === undefined)) {
    throw new ProofVCError(
      "invalid_config",
      "authorization request requires exactly one of `scope` or `dcqlQuery`",
    );
  }
  if (
    params.scope !== undefined &&
    !(KNOWN_SCOPES as string[]).includes(params.scope)
  ) {
    warnOnce(
      "PROOF_VC_UNKNOWN_SCOPE",
      `scope "${params.scope}" is not known to this version of the Proof VC SDK; upgrade to a newer version`,
    );
  }
}

export function buildAuthorizationSearchParams(
  config: ClientConfig,
  params: AuthorizationRequestParams,
): URLSearchParams {
  const { scope, dcqlQuery, nonce, state, loginHint } = params;
  assertNonEmptyString(nonce, "nonce");
  assertScopeOrDcql({ scope, dcqlQuery });
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
