import type { Format } from "./types.ts";
import { DEFAULT_CREDENTIAL_ID, PROOF_CREDENTIAL_V1_VCT } from "./constants.ts";

export type DCQLCredentialQueryMeta = {
  vct_values: readonly string[];
};

export type DCQLClaimPathSegment = string | number | null;

export type DCQLClaimsQuery = {
  id?: string;
  path: readonly DCQLClaimPathSegment[];
  values?: readonly (string | number | boolean)[];
};

export type DCQLCredentialQuery = {
  id: string;
  format: Format;
  meta: DCQLCredentialQueryMeta;
  claims?: readonly DCQLClaimsQuery[];
  claim_sets?: readonly (readonly string[])[];
};

export type DCQLQuery = {
  credentials: readonly DCQLCredentialQuery[];
};

export const DCQL_QUERY_BASIC: DCQLQuery = Object.freeze({
  credentials: Object.freeze([
    Object.freeze({
      id: DEFAULT_CREDENTIAL_ID,
      format: "dc+sd-jwt" as const,
      meta: Object.freeze({
        vct_values: Object.freeze([PROOF_CREDENTIAL_V1_VCT]),
      }),
    }),
  ]),
});
