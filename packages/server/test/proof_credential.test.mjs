import { test } from "node:test";
import assert from "node:assert/strict";

import { PROOF_CREDENTIAL_V1_VCT } from "../dist/index.js";
import { getProofCredential } from "../dist/proof_credential_factory.js";

const sdjwtWith = (claims) => ({ getClaims: async () => claims });

test("maps is_national.us onto isNationalUS", async () => {
  const credential = await getProofCredential(
    sdjwtWith({
      vct: PROOF_CREDENTIAL_V1_VCT,
      age_equal_or_over: { 18: true },
      is_national: { us: true },
    }),
  );

  assert.equal(credential.isNationalUS, true);
  assert.equal(credential.isOver18, true);
  assert.equal(credential.givenName, undefined);
  assert.equal(credential.familyName, undefined);
});

test("leaves isNationalUS undefined when is_national is absent", async () => {
  const credential = await getProofCredential(
    sdjwtWith({
      vct: PROOF_CREDENTIAL_V1_VCT,
      given_name: "Frodo",
      age_equal_or_over: { 18: true },
    }),
  );

  assert.equal(credential.isNationalUS, undefined);
  assert.equal(credential.givenName, "Frodo");
});
