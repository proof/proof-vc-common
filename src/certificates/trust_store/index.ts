import { X509Certificate } from "node:crypto";
import type { Environment } from "../../types.ts";
import { PROOF_ROOT_CA_R1_PEM } from "./proof_root_ca_r1.ts";
import { PROOF_ROOT_CA_R1_DEVELOPMENT_PEM } from "./proof_root_ca_r1_development.ts";

const PRODUCTION_ROOT = new X509Certificate(PROOF_ROOT_CA_R1_PEM);
const DEVELOPMENT_ROOT = new X509Certificate(PROOF_ROOT_CA_R1_DEVELOPMENT_PEM);

export function getTrustRoot(env: Environment): X509Certificate {
  switch (env) {
    case "production":
      return PRODUCTION_ROOT;
    case "localhost":
    case "next":
    case "staging":
    case "sandbox":
      return DEVELOPMENT_ROOT;
  }
}
