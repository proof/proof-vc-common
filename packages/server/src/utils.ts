import {
  type CredentialID,
  DEFAULT_CREDENTIAL_ID,
} from "@proof.com/proof-vc-common";

const CREDENTIAL_IDS: CredentialID[] = [DEFAULT_CREDENTIAL_ID];

export const credentialIdAsType = (s: string): CredentialID => {
  for (const credentialId of CREDENTIAL_IDS) {
    if (s === credentialId) {
      return credentialId;
    }
  }
  throw new Error(`invalid CredentialID: ${s}`);
};
