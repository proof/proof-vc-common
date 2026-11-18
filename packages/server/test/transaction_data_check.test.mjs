import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { ProofVCError, transactionData } from "../dist/index.js";
import { encodeTransactionData } from "../dist/transaction_data.js";
import {
  assertTransactionData,
  transactionDataHash,
} from "../dist/transaction_data_check.js";

// An independent implementation of OID4VP 1.0 App. B.3.3.1-2.2.2.1: the hash covers the string
// received in the `transaction_data` request parameter, with no base64url decode first.
const sha256 = (encoded) =>
  createHash("sha256").update(encoded, "utf8").digest("base64url");

const ITEMIZED = {
  currency: "USD",
  title: "Drive Shaft",
  description: "The Roadhouse (18+), May 6 2026",
  items: [
    { quantity: 2, unit_cost: 40, label: "General Admission" },
    { quantity: 2, unit_cost: 11.4, label: "Fees" },
  ],
};

const SESSION = { ip_address: "203.0.113.7", device_id: "d-42" };

const kbWith = (hashes, alg) => ({
  iat: 1790603873,
  aud: "caqnb6rwn",
  nonce: "3f947e15-fcf0-4cd7-9030-61fde6632322",
  sd_hash: "aMqRgntcvH8xDNF3FsrMKrexeaQmbE_bHvSW6DEsLSY",
  ...(hashes !== undefined && { transaction_data_hashes: hashes }),
  ...(alg !== undefined && { transaction_data_hashes_alg: alg }),
});

function rejects(kbPayload, sent, substring) {
  try {
    assertTransactionData(kbPayload, sent);
  } catch (error) {
    assert.ok(
      error instanceof ProofVCError,
      `expected a ProofVCError, got ${error?.constructor?.name}: ${error?.message}`,
    );
    assert.equal(error.code, "verification_failed");
    assert.ok(
      error.message.includes(substring),
      `expected an error containing "${substring}", got "${error.message}"`,
    );
    return;
  }
  assert.fail(`expected a rejection containing "${substring}"`);
}

test("transactionDataHash matches the spec, and defaults to sha-256", () => {
  const encoded = encodeTransactionData(transactionData.sessionData(SESSION));

  assert.equal(transactionDataHash(encoded), sha256(encoded));
  assert.equal(transactionDataHash(encoded, "sha-256"), sha256(encoded));
  assert.equal(transactionDataHash(encoded).includes("="), false);
});

test("the round trip passes: the object sent, the same object checked", () => {
  const mandate = transactionData.paymentItemized(ITEMIZED);
  const encoded = encodeTransactionData(mandate);

  assertTransactionData(kbWith([sha256(encoded)]), mandate);
});

test("the same terms pass with a different key order", () => {
  const sent = transactionData.paymentItemized(ITEMIZED);
  const encoded = encodeTransactionData(sent);
  const rebuilt = transactionData.paymentItemized({
    description: ITEMIZED.description,
    items: ITEMIZED.items,
    title: ITEMIZED.title,
    currency: ITEMIZED.currency,
  });

  assertTransactionData(kbWith([sha256(encoded)]), rebuilt);
});

test("the same terms pass with a nested object rebuilt in a different key order", () => {
  const wire = {
    recipient: {
      institution_name: "Crestline Financial",
      routing_number: "055000123",
      account_number: "7293",
    },
    source: {
      individual_name: "Sterling & Union",
      account_number: "4821",
      routing_number: "091000456",
    },
    amount: 5000,
    currency: "USD",
  };
  const encoded = encodeTransactionData(transactionData.wireInstructions(wire));
  const rebuilt = transactionData.wireInstructions({
    currency: wire.currency,
    amount: wire.amount,
    source: {
      routing_number: wire.source.routing_number,
      account_number: wire.source.account_number,
      individual_name: wire.source.individual_name,
    },
    recipient: {
      account_number: wire.recipient.account_number,
      institution_name: wire.recipient.institution_name,
      routing_number: wire.recipient.routing_number,
    },
  });

  assertTransactionData(kbWith([sha256(encoded)]), rebuilt);
});

test("the stored encoded string passes", () => {
  const encoded = encodeTransactionData(transactionData.sessionData(SESSION));

  assertTransactionData(kbWith([sha256(encoded)]), encoded);
});

test("two entries pass when both hashes are present", () => {
  const first = transactionData.paymentItemized(ITEMIZED);
  const second = transactionData.sessionData(SESSION);
  const hashes = [first, second]
    .map(encodeTransactionData)
    .map((encoded) => sha256(encoded));

  assertTransactionData(kbWith(hashes), [first, second]);
  assertTransactionData(kbWith(hashes), [second, first]);
});

test("the key binding JWT decides the algorithm, not the entry's candidate list", () => {
  const sent = {
    ...transactionData.sessionData(SESSION),
    transaction_data_hashes_alg: ["sha-512", "sha-256"],
  };
  const encoded = encodeTransactionData(sent);

  assertTransactionData(kbWith([sha256(encoded)], "sha-256"), sent);
  assertTransactionData(kbWith([sha256(encoded)]), sent);
});

test("a hash of a different string fails", () => {
  const mandate = transactionData.paymentItemized(ITEMIZED);
  const other = encodeTransactionData(transactionData.sessionData(SESSION));

  rejects(kbWith([sha256(other)]), mandate, "the user signed other terms");
});

test("a changed amount fails", () => {
  const encoded = encodeTransactionData(
    transactionData.paymentMandate({
      payment_instrument: { type: "card", id: "pi-1" },
      payee: { name: "Acme Corp LLC" },
      prompt_summary: "Pay Acme Corp LLC",
      amount: 5000,
      currency: "USD",
    }),
  );
  const tampered = transactionData.paymentMandate({
    payment_instrument: { type: "card", id: "pi-1" },
    payee: { name: "Acme Corp LLC" },
    prompt_summary: "Pay Acme Corp LLC",
    amount: 9000,
    currency: "USD",
  });

  rejects(kbWith([sha256(encoded)]), tampered, "the user signed other terms");
});

test("a changed scalar fails", () => {
  const encoded = encodeTransactionData(
    transactionData.paymentItemized(ITEMIZED),
  );
  const tampered = transactionData.paymentItemized({
    ...ITEMIZED,
    currency: "EUR",
  });

  rejects(kbWith([sha256(encoded)]), tampered, "the user signed other terms");
});

test("a reordered array element fails, because array order is content", () => {
  const encoded = encodeTransactionData(
    transactionData.paymentItemized(ITEMIZED),
  );
  const reordered = transactionData.paymentItemized({
    ...ITEMIZED,
    items: [...ITEMIZED.items].reverse(),
  });

  rejects(kbWith([sha256(encoded)]), reordered, "the user signed other terms");
});

test("one entry of two missing from the array fails", () => {
  const first = transactionData.paymentItemized(ITEMIZED);
  const second = transactionData.sessionData(SESSION);

  rejects(
    kbWith([sha256(encodeTransactionData(first))]),
    [first, second],
    "the user signed other terms",
  );
});

test("a surplus hash the caller did not send fails", () => {
  const sent = transactionData.paymentItemized(ITEMIZED);
  const extra = encodeTransactionData(transactionData.sessionData(SESSION));

  rejects(
    kbWith([sha256(encodeTransactionData(sent)), sha256(extra)]),
    sent,
    "the user signed more terms",
  );
});

test("a key binding JWT without transaction_data_hashes fails", () => {
  const mandate = transactionData.paymentItemized(ITEMIZED);

  rejects(kbWith(), mandate, "`transaction_data_hashes`");
  rejects({}, mandate, "`transaction_data_hashes`");
});

test("an empty transaction_data_hashes fails", () => {
  rejects(
    kbWith([]),
    transactionData.sessionData(SESSION),
    "must be a non-empty array of strings",
  );
});

test("sha-512 in the key binding JWT is rejected by the allowlist", () => {
  const encoded = encodeTransactionData(transactionData.sessionData(SESSION));
  const sha512 = createHash("sha512").update(encoded).digest("base64url");

  rejects(
    kbWith([sha512], "sha-512"),
    encoded,
    'is "sha-512", which this SDK does not support',
  );
  assert.throws(
    () => transactionDataHash(encoded, "sha-512"),
    (error) =>
      error instanceof ProofVCError && error.code === "verification_failed",
  );
});

test("an array transaction_data_hashes_alg is rejected: the response side is a string", () => {
  const encoded = encodeTransactionData(transactionData.sessionData(SESSION));

  rejects(
    kbWith([sha256(encoded)], ["sha-256"]),
    encoded,
    "must be a string in the key binding JWT, not an array",
  );
});

test("no transaction data supplied fails", () => {
  const encoded = encodeTransactionData(transactionData.sessionData(SESSION));

  rejects(kbWith([sha256(encoded)]), [], "no transaction data was supplied");
});
