import type { Format } from "./types.ts";
import { DEFAULT_CREDENTIAL_ID, PROOF_CREDENTIAL_V1_VCT } from "./constants.ts";

export type DCQLCredentialQueryMeta = {
  vct_values: string[];
};

export type DCQLCredentialQuery = {
  id: string;
  format: Format;
  meta: DCQLCredentialQueryMeta;
};

export type DCQLQuery = {
  credentials: DCQLCredentialQuery[];
};

export const DCQL_QUERY_BASIC: DCQLQuery = {
  credentials: [
    {
      id: DEFAULT_CREDENTIAL_ID,
      format: "dc+sd-jwt",
      meta: { vct_values: [PROOF_CREDENTIAL_V1_VCT] },
    },
  ],
};
