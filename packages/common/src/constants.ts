import type { CredentialID, KnownScope } from "./types.ts";

const KNOWN_SCOPE_SET = {
  "urn:proof:params:scope:verifiable-credentials:basic": true,
  "urn:proof:params:scope:verifiable-credentials:nationality:us": true,
} satisfies Record<KnownScope, true>;

export const KNOWN_SCOPES = Object.keys(KNOWN_SCOPE_SET) as KnownScope[];

export const DEFAULT_CREDENTIAL_ID: CredentialID = "proof_id_default";

export const NATIONALITY_US_CREDENTIAL_ID: CredentialID =
  "proof_id_nationality_us";

export const PROOF_CREDENTIAL_V1_VCT =
  "https://credentials.notarize.com/ProofCredentialV1";
