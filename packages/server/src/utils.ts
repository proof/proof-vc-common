import type { CredentialID } from "@proof.com/proof-vc-common";

const CREDENTIAL_ID_SET = {
  proof_id_default: true,
  proof_id_nationality_us: true,
} satisfies Record<CredentialID, true>;

export const CREDENTIAL_IDS = Object.keys(CREDENTIAL_ID_SET) as CredentialID[];

export const credentialIdAsType = (s: string): CredentialID => {
  for (const credentialId of CREDENTIAL_IDS) {
    if (s === credentialId) {
      return credentialId;
    }
  }
  throw new Error(`invalid CredentialID: ${s}`);
};
