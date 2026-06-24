import type { CredentialID } from "./types.ts";
import { DEFAULT_CREDENTIAL_ID } from "./constants.ts";

const CREDENTIAL_IDS: CredentialID[] = [DEFAULT_CREDENTIAL_ID];

export const credentialIdAsType = (s: string): CredentialID => {
  for (const credentialId of CREDENTIAL_IDS) {
    if (s === credentialId) {
      return credentialId;
    }
  }
  throw `invalid CredentialID: ${s}`;
};
