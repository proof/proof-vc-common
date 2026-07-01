export type {
  Environment,
  ResponseMode,
  ResponseType,
  Scope,
  CredentialID,
  CredentialType,
  Format,
} from "./types.ts";

export { DEFAULT_CREDENTIAL_ID, PROOF_CREDENTIAL_V1_VCT } from "./constants.ts";

export type {
  DCQLQuery,
  DCQLCredentialQuery,
  DCQLCredentialQueryMeta,
} from "./dcql.ts";
export { DCQL_QUERY_BASIC } from "./dcql.ts";

export type {
  ClientConfig,
  AuthorizationRequestParams,
  AuthorizationResponse,
  VCClient,
} from "./client.ts";
export {
  createClient,
  buildAuthorizationUrl,
  parseAuthorizationResponse,
} from "./client.ts";
