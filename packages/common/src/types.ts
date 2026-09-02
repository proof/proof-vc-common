export type Environment =
  "localhost" | "next" | "staging" | "sandbox" | "production";
export type ResponseMode = "fragment" | "direct_post";
export type ResponseType = "vp_token";
export type Scope =
  | "urn:proof:params:scope:verifiable-credentials:basic"
  | "urn:proof:params:scope:verifiable-credentials:nationality:us";
export type CredentialID = "proof_id_default" | "proof_id_nationality_us";
export type CredentialType = "ProofCredentialV1";
export type Format = "dc+sd-jwt";
