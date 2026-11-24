import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_CREDENTIAL_ID,
  TX_DATA_TYPE,
  transactionData,
} from "../dist/index.js";
import { encodeTransactionData } from "../dist/transaction_data.js";

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

const EXACT_AMOUNTS = [
  "500.100",
  "5000",
  "0.00001",
  "12345678901234567890.5",
  "-25.00",
];

const WIRE = {
  recipient: {
    institution_name: "Crestline Financial",
    routing_number: "055000123",
    account_number: "7293",
  },
  source: {
    individual_name: "Acme Corp LLC",
    routing_number: "091000456",
    account_number: "4821",
  },
  currency: "USD",
};

const MANDATE = {
  payment_instrument: { type: "card", id: "pm_1" },
  payee: { name: "Acme Corp LLC" },
  prompt_summary: "Pay Acme Corp LLC",
  currency: "USD",
};

test("wireInstructions keeps the amount text", () => {
  for (const amount of EXACT_AMOUNTS) {
    const data = transactionData.wireInstructions({ ...WIRE, amount });

    assert.equal(decode(encodeTransactionData(data)).payload.amount, amount);
  }
});

test("paymentMandate keeps the amount text", () => {
  for (const amount of EXACT_AMOUNTS) {
    const data = transactionData.paymentMandate({ ...MANDATE, amount });

    assert.equal(decode(encodeTransactionData(data)).payload.amount, amount);
  }
});

test("paymentItemized keeps the unit_cost text and the integer quantity", () => {
  const data = transactionData.paymentItemized({
    currency: "USD",
    items: EXACT_AMOUNTS.map((unit_cost, index) => ({
      quantity: index + 1,
      unit_cost,
      label: `Item ${index + 1}`,
    })),
  });

  assert.deepEqual(
    decode(encodeTransactionData(data)).payload.items,
    EXACT_AMOUNTS.map((unit_cost, index) => ({
      quantity: index + 1,
      unit_cost,
      label: `Item ${index + 1}`,
    })),
  );
});

test("an amount that a JSON number would round is encoded as sent", () => {
  const amount = "12345678901234567890.5";
  const encoded = encodeTransactionData(
    transactionData.wireInstructions({ ...WIRE, amount }),
  );

  assert.match(
    Buffer.from(encoded, "base64url").toString("utf8"),
    /"12345678901234567890\.5"/,
  );
  assert.notEqual(String(Number(amount)), amount);
});
