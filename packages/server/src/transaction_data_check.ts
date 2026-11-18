import { hasher } from "@owf/crypto";
import { base64url } from "@owf/identity-common";
import { ProofVCError } from "@proof.com/proof-vc-common";

import { encodeTransactionData } from "./transaction_data.ts";
import type { TransactionData } from "./transaction_data.ts";

/**
 * What the Verifier sent in the `transaction_data` request parameter: a mandate from a
 * `transactionData` factory, the string that `encodeTransactionData` returned, or several of
 * either.
 */
export type TransactionDataInput =
  TransactionData | string | readonly (TransactionData | string)[];

const HASHES_CLAIM = "transaction_data_hashes";
const HASHES_ALG_CLAIM = "transaction_data_hashes_alg";

// OID4VP 1.0 App. B.3.3.1: `sha-256` is the default and every implementation must support it.
// Proof hashes with `sha-256` only. `hasher` computes `sha-512` without complaint, so the
// allowlist is written here rather than inherited.
const DEFAULT_HASH_ALG = "sha-256";
const SUPPORTED_HASH_ALGS: readonly string[] = [DEFAULT_HASH_ALG];

function fail(message: string): never {
  throw new ProofVCError("verification_failed", message);
}

function assertSupportedHashAlg(alg: string): void {
  if (!SUPPORTED_HASH_ALGS.includes(alg)) {
    fail(
      `\`${HASHES_ALG_CLAIM}\` is "${alg}", which this SDK does not support; expected "${DEFAULT_HASH_ALG}"`,
    );
  }
}

/** Hashes an encoded transaction data entry as OID4VP 1.0 App. B.3.3.1 defines it. */
export function transactionDataHash(
  encoded: string,
  alg: string = DEFAULT_HASH_ALG,
): string {
  assertSupportedHashAlg(alg);
  return base64url.encode(hasher(encoded, alg));
}

function isStringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isEntryList(
  sent: TransactionDataInput,
): sent is readonly (TransactionData | string)[] {
  return Array.isArray(sent);
}

function entriesOf(
  sent: TransactionDataInput,
): readonly (TransactionData | string)[] {
  const entries = isEntryList(sent) ? sent : [sent];
  if (entries.length === 0) {
    fail("no transaction data was supplied to check");
  }
  return entries;
}

// OID4VP 1.0 App. B.3.3.1-2.2.2.2: in the Key Binding JWT this claim is a String, the one
// algorithm the wallet used. The array form belongs to the request.
function hashAlgOf(kbPayload: Record<string, unknown>): string {
  const alg = kbPayload[HASHES_ALG_CLAIM];
  if (alg === undefined) {
    return DEFAULT_HASH_ALG;
  }
  if (typeof alg !== "string") {
    fail(
      `\`${HASHES_ALG_CLAIM}\` must be a string in the key binding JWT, not ${Array.isArray(alg) ? "an array" : typeof alg}`,
    );
  }
  assertSupportedHashAlg(alg);
  return alg;
}

function hashesOf(kbPayload: Record<string, unknown>): readonly string[] {
  const hashes = kbPayload[HASHES_CLAIM];
  if (hashes === undefined) {
    fail(
      `the key binding JWT has no \`${HASHES_CLAIM}\`, so the presentation is bound to no transaction data`,
    );
  }
  if (!isStringArray(hashes) || hashes.length === 0) {
    fail(`\`${HASHES_CLAIM}\` must be a non-empty array of strings`);
  }
  return hashes;
}

/**
 * Proves that a presentation is bound to the transaction data that the Verifier sent. Compares
 * hashes only: the `type` of an entry is part of the hashed bytes.
 */
export function assertTransactionData(
  kbPayload: Record<string, unknown>,
  sent: TransactionDataInput,
): void {
  const claimed = hashesOf(kbPayload);
  const alg = hashAlgOf(kbPayload);
  const computed = entriesOf(sent).map((entry) =>
    transactionDataHash(
      typeof entry === "string" ? entry : encodeTransactionData(entry),
      alg,
    ),
  );

  const claimedSet = new Set(claimed);
  const unbound = computed.filter((hash) => !claimedSet.has(hash));
  if (unbound.length > 0) {
    fail(
      `the user signed other terms: ${unbound.length} of the ${computed.length} transaction data entries supplied are absent from \`${HASHES_CLAIM}\``,
    );
  }

  const computedSet = new Set(computed);
  const surplus = claimed.filter((hash) => !computedSet.has(hash));
  if (surplus.length > 0) {
    fail(
      `the user signed more terms: ${surplus.length} of the ${claimed.length} hashes in \`${HASHES_CLAIM}\` match no transaction data supplied`,
    );
  }
}
