import { DEFAULT_CREDENTIAL_ID } from "./constants.ts";

export const TX_DATA_TYPE = {
  WIRE_INSTRUCTIONS:
    "urn:proof:params:vc:transaction-data:wire-instructions:v1",
  PAYMENT_MANDATE: "urn:proof:params:vc:transaction-data:payment-mandate:v1",
  PAYMENT_ITEMIZED: "urn:proof:params:vc:transaction-data:payment-itemized:v1",
  SESSION_DATA: "urn:proof:params:vc:transaction-data:session-data",
} as const;

const CREDENTIAL_IDS = [DEFAULT_CREDENTIAL_ID] as const;

export type WireInstructionsPayload = {
  recipient: {
    institution_name: string;
    routing_number: string;
    account_number: string;
    individual_name?: string;
    website?: string;
  };
  source: {
    individual_name: string;
    account_number: string;
    routing_number: string;
    institution_name?: string;
  };
  amount: number;
  currency: string;
  memo?: string;
};

export type PaymentMandatePayload = {
  payment_instrument: {
    type: string;
    id: string;
    description?: string;
  };
  payee: {
    name: string;
    id?: string;
    website?: string;
  };
  prompt_summary: string;
  amount: number;
  currency: string;
};

export type PaymentItemizedItem = {
  quantity: number;
  unit_cost: number;
  label: string;
};

export type PaymentItemizedPayload = {
  currency: string;
  items: PaymentItemizedItem[];
  title?: string;
  description?: string;
};

export type SessionDataPayload = {
  ip_address: string;
  device_id?: string;
};

type Envelope<T extends string, P> = {
  type: T;
  credential_ids: readonly string[];
  payload: P;
};

export type WireInstructionsTransactionData = Envelope<
  typeof TX_DATA_TYPE.WIRE_INSTRUCTIONS,
  WireInstructionsPayload
>;
export type PaymentMandateTransactionData = Envelope<
  typeof TX_DATA_TYPE.PAYMENT_MANDATE,
  PaymentMandatePayload
>;
export type PaymentItemizedTransactionData = Envelope<
  typeof TX_DATA_TYPE.PAYMENT_ITEMIZED,
  PaymentItemizedPayload
>;
export type SessionDataTransactionData = Envelope<
  typeof TX_DATA_TYPE.SESSION_DATA,
  SessionDataPayload
>;

export type TransactionData =
  | WireInstructionsTransactionData
  | PaymentMandateTransactionData
  | PaymentItemizedTransactionData
  | SessionDataTransactionData;

export const transactionData = {
  wireInstructions(
    payload: WireInstructionsPayload,
  ): WireInstructionsTransactionData {
    return {
      type: TX_DATA_TYPE.WIRE_INSTRUCTIONS,
      credential_ids: CREDENTIAL_IDS,
      payload,
    };
  },
  paymentMandate(
    payload: PaymentMandatePayload,
  ): PaymentMandateTransactionData {
    return {
      type: TX_DATA_TYPE.PAYMENT_MANDATE,
      credential_ids: CREDENTIAL_IDS,
      payload,
    };
  },
  paymentItemized(
    payload: PaymentItemizedPayload,
  ): PaymentItemizedTransactionData {
    return {
      type: TX_DATA_TYPE.PAYMENT_ITEMIZED,
      credential_ids: CREDENTIAL_IDS,
      payload,
    };
  },
  sessionData(payload: SessionDataPayload): SessionDataTransactionData {
    return {
      type: TX_DATA_TYPE.SESSION_DATA,
      credential_ids: CREDENTIAL_IDS,
      payload,
    };
  },
} as const;

function base64UrlEncode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function encodeTransactionData(data: TransactionData): string {
  return base64UrlEncode(JSON.stringify(data));
}
