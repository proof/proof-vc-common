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

test("exposes birth_date as the ISO string it was issued with", async () => {
  const credential = await getProofCredential(
    sdjwtWith({ vct: PROOF_CREDENTIAL_V1_VCT, birth_date: "1990-05-06" }),
  );

  assert.equal(credential.birthDate, "1990-05-06");
  assert.equal("dateOfBirth" in credential, false);
});

test("JSON serialization exposes the public accessors and never the SD-JWT", async () => {
  const sdjwt = {
    getClaims: async () => ({
      vct: PROOF_CREDENTIAL_V1_VCT,
      given_name: "Frodo",
      birth_date: "1990-05-06",
      age_equal_or_over: { 18: true },
    }),
    kbJwt: { payload: { nonce: "n-1" } },
  };
  const credential = await getProofCredential(sdjwt);

  assert.deepEqual(JSON.parse(JSON.stringify(credential)), {
    credentialType: "ProofCredentialV1",
    format: "dc+sd-jwt",
    nonce: "n-1",
    givenName: "Frodo",
    birthDate: "1990-05-06",
    isOver18: true,
  });
  assert.equal(JSON.stringify(credential).includes("kbJwt"), false);
});

test("an unknown vct serializes its type, vct and claims", async () => {
  const claims = { vct: "https://example.com/other", foo: "bar" };
  const credential = await getProofCredential(sdjwtWith(claims));

  assert.deepEqual(JSON.parse(JSON.stringify(credential)), {
    credentialType: "Default",
    format: "dc+sd-jwt",
    vct: "https://example.com/other",
    claims,
  });
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
