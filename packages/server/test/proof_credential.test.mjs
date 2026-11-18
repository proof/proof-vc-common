import { test } from "node:test";
import assert from "node:assert/strict";

import { createHash } from "node:crypto";

import {
  PROOF_CREDENTIAL_V1_VCT,
  ProofVCError,
  TX_DATA_TYPE,
  encodeTransactionData,
  transactionData,
} from "../dist/index.js";
import { getProofCredential } from "../dist/proof_credential_factory.js";

const sha256 = (encoded) =>
  createHash("sha256").update(encoded, "utf8").digest("base64url");

const MANDATE = transactionData.sessionData({ ip_address: "203.0.113.7" });

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

test("getTransactionData reads the KB-JWT claim of the transaction data type", async () => {
  const challenge = { challenge_id: "x7Tg2pLqR9mKvNwY3hBcZa", amount: "12.50" };
  const credential = await getProofCredential({
    getClaims: async () => ({ vct: PROOF_CREDENTIAL_V1_VCT }),
    kbJwt: { payload: { nonce: "n-1", mpp_payment_challenge_v1: challenge } },
  });

  assert.deepEqual(
    credential.getTransactionData(TX_DATA_TYPE.MPP_PAYMENT_CHALLENGE),
    challenge,
  );
  assert.equal(
    credential.getTransactionData(TX_DATA_TYPE.PAYMENT_ITEMIZED),
    undefined,
  );
});

test("getTransactionData returns undefined without a KB-JWT", async () => {
  const credential = await getProofCredential(
    sdjwtWith({ vct: PROOF_CREDENTIAL_V1_VCT }),
  );

  assert.equal(
    credential.getTransactionData(TX_DATA_TYPE.MPP_PAYMENT_CHALLENGE),
    undefined,
  );
});

test("checkTransactionData passes when the KB-JWT carries the hash of the mandate sent", async () => {
  const credential = await getProofCredential({
    getClaims: async () => ({ vct: PROOF_CREDENTIAL_V1_VCT }),
    kbJwt: {
      payload: {
        nonce: "n-1",
        transaction_data_hashes: [sha256(encodeTransactionData(MANDATE))],
        transaction_data_hashes_alg: "sha-256",
      },
    },
  });

  credential.checkTransactionData(MANDATE);
  assert.throws(
    () =>
      credential.checkTransactionData(
        transactionData.sessionData({ ip_address: "198.51.100.9" }),
      ),
    (error) =>
      error instanceof ProofVCError && error.code === "verification_failed",
  );
});

test("checkTransactionData throws without a KB-JWT", async () => {
  const credential = await getProofCredential(
    sdjwtWith({ vct: PROOF_CREDENTIAL_V1_VCT }),
  );

  assert.throws(
    () => credential.checkTransactionData(MANDATE),
    (error) =>
      error instanceof ProofVCError &&
      error.code === "verification_failed" &&
      error.message.includes("`transaction_data_hashes`"),
  );
});

test("isBoundToTransactionData reports the presence of the hashes claim", async () => {
  const bound = await getProofCredential({
    getClaims: async () => ({ vct: PROOF_CREDENTIAL_V1_VCT }),
    kbJwt: {
      payload: {
        nonce: "n-1",
        transaction_data_hashes: [sha256(encodeTransactionData(MANDATE))],
      },
    },
  });
  const unbound = await getProofCredential({
    getClaims: async () => ({ vct: PROOF_CREDENTIAL_V1_VCT }),
    kbJwt: { payload: { nonce: "n-1" } },
  });
  const noKbJwt = await getProofCredential(
    sdjwtWith({ vct: PROOF_CREDENTIAL_V1_VCT }),
  );

  assert.equal(bound.isBoundToTransactionData(), true);
  assert.equal(unbound.isBoundToTransactionData(), false);
  assert.equal(noKbJwt.isBoundToTransactionData(), false);
});
