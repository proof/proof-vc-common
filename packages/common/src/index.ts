export type {
  Environment,
  ResponseMode,
  ResponseType,
  Scope,
  KnownScope,
  CredentialID,
  CredentialType,
  Format,
} from "./types.ts";

export type { ProofVCErrorCode } from "./errors.ts";
export { ProofVCError } from "./errors.ts";

export {
  DEFAULT_CREDENTIAL_ID,
  NATIONALITY_US_CREDENTIAL_ID,
  PROOF_CREDENTIAL_V1_VCT,
  KNOWN_SCOPES,
} from "./constants.ts";

export type {
  DCQLQuery,
  DCQLCredentialQuery,
  DCQLCredentialQueryMeta,
  DCQLClaimsQuery,
  DCQLClaimPathSegment,
} from "./dcql.ts";
export { DCQL_QUERY_BASIC } from "./dcql.ts";

export type {
  ClientConfig,
  AuthorizationRequestParams,
  AuthorizationResponse,
  AuthorizationSuccessResponse,
  AuthorizationErrorResponse,
  VCClient,
} from "./client.ts";
export {
  createClient,
  buildAuthorizationUrl,
  parseAuthorizationResponse,
} from "./client.ts";
export { agentsTrustListUrl } from "./internal.ts";
