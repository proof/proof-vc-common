import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_CREDENTIAL_ID,
  TX_DATA_TYPE,
  encodeTransactionData,
  transactionData,
} from "../dist/index.js";

const decode = (encoded) =>
  JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));

const MPP_CHALLENGE = {
  challenge_id: "x7Tg2pLqR9mKvNwY3hBcZa",
  realm: "api.example.com",
  method: "tempo",
  intent: "charge",
  amount: "12.50",
  currency: "USD",
  recipient: "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE21",
};

test("mppPaymentChallenge encodes the type, payload and default credential id", () => {
  const payload = {
    ...MPP_CHALLENGE,
    expires: "2026-10-26T12:00:00Z",
  };

  assert.deepEqual(
    decode(encodeTransactionData(transactionData.mppPaymentChallenge(payload))),
    {
      type: "urn:proof:params:vc:transaction-data:mpp-payment-challenge:v1",
      credential_ids: [DEFAULT_CREDENTIAL_ID],
      payload,
    },
  );
  assert.equal(
    TX_DATA_TYPE.MPP_PAYMENT_CHALLENGE,
    "urn:proof:params:vc:transaction-data:mpp-payment-challenge:v1",
  );
});

test("mppPaymentChallenge omits an undefined expires", () => {
  const data = transactionData.mppPaymentChallenge({
    ...MPP_CHALLENGE,
    expires: undefined,
  });

  assert.deepEqual(data.payload, MPP_CHALLENGE);
  assert.deepEqual(decode(encodeTransactionData(data)).payload, MPP_CHALLENGE);
});

const ITEMIZED = {
  currency: "USD",
  title: "Drive Shaft",
  items: [
    { quantity: 2, unit_cost: 40, label: "General Admission" },
    { quantity: 2, unit_cost: 11.4, label: "Fees" },
  ],
};

const MANDATES = [
  transactionData.paymentItemized(ITEMIZED),
  transactionData.sessionData({ ip_address: "203.0.113.7", device_id: "d-42" }),
  transactionData.paymentMandate({
    payment_instrument: { type: "card", id: "pi-1" },
    payee: { name: "Acme Corp LLC" },
    prompt_summary: "Pay Acme Corp LLC",
    amount: 5000,
    currency: "USD",
  }),
  transactionData.wireInstructions({
    recipient: {
      institution_name: "Crestline Financial",
      routing_number: "055000123",
      account_number: "7293",
    },
    source: {
      individual_name: "Sterling & Union",
      routing_number: "091000456",
      account_number: "4821",
    },
    amount: 5000,
    currency: "USD",
  }),
  transactionData.mppPaymentChallenge(MPP_CHALLENGE),
];

test("encode, decode and encode again gives the same string for each factory", () => {
  for (const mandate of MANDATES) {
    const encoded = encodeTransactionData(mandate);

    assert.equal(encodeTransactionData(decode(encoded)), encoded);
    assert.deepEqual(decode(encoded), mandate);
  }
});

test("the same terms in a different key order encode to the same string", () => {
  const sent = transactionData.paymentItemized(ITEMIZED);
  const rebuilt = transactionData.paymentItemized({
    items: ITEMIZED.items,
    title: ITEMIZED.title,
    currency: ITEMIZED.currency,
  });

  assert.equal(encodeTransactionData(rebuilt), encodeTransactionData(sent));
  assert.equal(
    encodeTransactionData({
      payload: sent.payload,
      credential_ids: sent.credential_ids,
      type: sent.type,
    }),
    encodeTransactionData(sent),
  );
});

test("array order is content and survives the encoding", () => {
  const reversed = transactionData.paymentItemized({
    ...ITEMIZED,
    items: [...ITEMIZED.items].reverse(),
  });

  assert.notEqual(
    encodeTransactionData(reversed),
    encodeTransactionData(transactionData.paymentItemized(ITEMIZED)),
  );
  assert.deepEqual(
    decode(encodeTransactionData(reversed)).payload.items,
    [...ITEMIZED.items].reverse(),
  );
});
