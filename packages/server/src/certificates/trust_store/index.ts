import { X509Certificate } from "node:crypto";
import type { TrustRoot } from "../../types.ts";
import { PROOF_ROOT_CA_R1_PEM } from "./proof_root_ca_r1.ts";
import { PROOF_ROOT_CA_R1_DEVELOPMENT_PEM } from "./proof_root_ca_r1_development.ts";

export const TRUST_ROOTS = {
  production: new X509Certificate(PROOF_ROOT_CA_R1_PEM),
  development: new X509Certificate(PROOF_ROOT_CA_R1_DEVELOPMENT_PEM),
} satisfies Record<TrustRoot, X509Certificate>;

export function getTrustRoot(trustRoot: TrustRoot): X509Certificate {
  return TRUST_ROOTS[trustRoot];
}
