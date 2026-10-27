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
