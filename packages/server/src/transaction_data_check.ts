import { hasher } from "@owf/crypto";
import { base64url } from "@owf/identity-common";
import { ProofVCError } from "@proof.com/proof-vc-common";

import {
  encodeTransactionData,
  type TransactionData,
} from "./transaction_data.ts";

export type TransactionDataInput =
  TransactionData | string | readonly (TransactionData | string)[];

export const HASHES_CLAIM = "transaction_data_hashes";
const HASHES_ALG_CLAIM = "transaction_data_hashes_alg";
const DEFAULT_HASH_ALG = "sha-256";

function fail(message: string): never {
  throw new ProofVCError("verification_failed", message);
}

export function transactionDataHash(
  encoded: string,
  alg: string = DEFAULT_HASH_ALG,
): string {
  if (alg !== DEFAULT_HASH_ALG) {
    fail(
      `\`${HASHES_ALG_CLAIM}\` is "${alg}", which this SDK does not support; expected "${DEFAULT_HASH_ALG}"`,
    );
  }
  return base64url.encode(hasher(encoded, alg));
}

function isStringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

export function assertTransactionData(
  kbPayload: Record<string, unknown>,
  sent: TransactionDataInput,
): void {
  const claimed = kbPayload[HASHES_CLAIM];
  if (!isStringArray(claimed) || claimed.length === 0) {
    fail(
      `\`${HASHES_CLAIM}\` must be a non-empty array of strings; this presentation is bound to no transaction data`,
    );
  }

  const alg = kbPayload[HASHES_ALG_CLAIM] ?? DEFAULT_HASH_ALG;
  if (typeof alg !== "string") {
    fail(
      `\`${HASHES_ALG_CLAIM}\` must be a string in the key binding JWT, not ${Array.isArray(alg) ? "an array" : typeof alg}`,
    );
  }

  const entries: readonly (TransactionData | string)[] = Array.isArray(sent)
    ? sent
    : [sent];
  if (
    entries.length === 0 ||
    entries.some((entry) => entry === undefined || entry === null)
  ) {
    fail("no transaction data was supplied to check");
  }
  const computed = entries.map((entry) =>
    transactionDataHash(
      typeof entry === "string" ? entry : encodeTransactionData(entry),
      alg,
    ),
  );

  const unbound = computed.filter((hash) => !claimed.includes(hash));
  if (unbound.length > 0) {
    fail(
      `the user signed other terms: ${unbound.length} of the ${computed.length} transaction data entries supplied are absent from \`${HASHES_CLAIM}\``,
    );
  }

  const surplus = claimed.filter((hash) => !computed.includes(hash));
  if (surplus.length > 0) {
    fail(
      `the user signed more terms: ${surplus.length} of the ${claimed.length} hashes in \`${HASHES_CLAIM}\` match no transaction data supplied`,
    );
  }
}
