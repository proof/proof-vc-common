import type { CredentialID } from "./types.ts";

const CREDENTIAL_IDS: CredentialID[] = ["proof_id_default"];

export const credentialIdAsType = (s: string): CredentialID => {
  for (const credentialId of CREDENTIAL_IDS) {
    if (s === credentialId) {
      return credentialId;
    }
  }
  throw `invalid CredentialID: ${s}`;
};
