import type { SDJwt } from "@sd-jwt/core";

export type Environment =
  | "localhost"
  | "next"
  | "staging"
  | "sandbox"
  | "production";
export type TrustRoot = "development" | "production";
export type ResponseMode = "fragment" | "direct_post";
export type ResponseType = "vp_token";
export type Scope = "urn:proof:params:scope:verifiable-credentials:basic";
export type CredentialID = "proof_id_default";
export type CredentialType = "ProofCredentialV1";
export type Format = "dc+sd-jwt";

export interface ProofCredential {
  credentialType(): CredentialType;
  format(): Format;
  getClaims(): Record<string, unknown>;
  getSDJWT(): SDJwt;
}

export type VPToken = Record<CredentialID, ProofCredential[]>;
