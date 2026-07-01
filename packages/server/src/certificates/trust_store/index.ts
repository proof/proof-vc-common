import { X509Certificate } from "node:crypto";
import type { TrustRoot } from "../../types.ts";
import { PROOF_ROOT_CA_R1_PEM } from "./proof_root_ca_r1.ts";
import { PROOF_ROOT_CA_R1_DEVELOPMENT_PEM } from "./proof_root_ca_r1_development.ts";

const PRODUCTION_ROOT = new X509Certificate(PROOF_ROOT_CA_R1_PEM);
const DEVELOPMENT_ROOT = new X509Certificate(PROOF_ROOT_CA_R1_DEVELOPMENT_PEM);

export function getTrustRoot(trustRoot: TrustRoot): X509Certificate {
  switch (trustRoot) {
    case "production":
      return PRODUCTION_ROOT;
    case "development":
      return DEVELOPMENT_ROOT;
  }
}
