import type { SDJwt } from "@sd-jwt/core";
import type {
  CredentialID,
  CredentialType,
  Format,
} from "@proof.com/proof-vc-common";

export type TrustRoot = "development" | "production";

export interface ProofCredential {
  credentialType(): CredentialType;
  format(): Format;
  getClaims(): Record<string, unknown>;
  getSDJWT(): SDJwt;
  getNonce(): string | undefined;
}

export type VPToken = Record<CredentialID, ProofCredential[]>;
