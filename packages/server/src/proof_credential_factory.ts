import type { SDJwt } from "@sd-jwt/core";
import {
  type ProofCredential,
  ProofCredentialV1,
  DefaultProofCredential,
} from "./proof_credentials.ts";
import { hasher } from "@owf/crypto";
import { PROOF_CREDENTIAL_V1_VCT } from "@proof.com/proof-vc-common";
import { warnOnce } from "@proof.com/proof-vc-common/internal";

export const getProofCredential = async (
  sdjwt: SDJwt,
): Promise<ProofCredential> => {
  const claims = (await sdjwt.getClaims(hasher)) as Record<string, unknown>;
  const vct = claims["vct"];

  if (vct === PROOF_CREDENTIAL_V1_VCT) {
    const ages =
      claims["age_equal_or_over"] !== undefined
        ? (claims["age_equal_or_over"] as Record<string, boolean>)
        : undefined;
    const national =
      claims["is_national"] !== undefined
        ? (claims["is_national"] as Record<string, boolean>)
        : undefined;

    return new ProofCredentialV1({
      sdjwt,
      claims,
      ...(claims["given_name"] !== undefined && {
        given_name: claims["given_name"] as string,
      }),
      ...(claims["family_name"] !== undefined && {
        family_name: claims["family_name"] as string,
      }),
      ...(claims["birth_date"] !== undefined && {
        birth_date: claims["birth_date"] as string,
      }),
      ...(ages?.["18"] !== undefined && {
        is_over_18: ages?.["18"] as boolean,
      }),
      ...(ages?.["21"] !== undefined && {
        is_over_21: ages?.["21"] as boolean,
      }),
      ...(ages?.["65"] !== undefined && {
        is_over_65: ages?.["65"] as boolean,
      }),
      ...(national?.["us"] !== undefined && {
        is_national_us: national?.["us"] as boolean,
      }),
    });
  }

  warnOnce(
    "PROOF_VC_UNKNOWN_CREDENTIAL_TYPE",
    `credential vct "${String(vct)}" is not known to this version of the Proof VC SDK and was returned as a DefaultProofCredential; upgrade to a newer version`,
  );
  return new DefaultProofCredential({
    sdjwt,
    claims,
    ...(typeof vct === "string" && { vct }),
  });
};
