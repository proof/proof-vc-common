import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { X509Certificate } from "node:crypto";

import { ProofVCError } from "../dist/index.js";
import { verifyChain } from "../dist/certificates/chain_validator.js";
import { TRUST_ROOTS } from "../dist/certificates/trust_store/index.js";

const load = (name) =>
  new X509Certificate(
    readFileSync(new URL(`./fixtures/chain/${name}.crt`, import.meta.url)),
  );

const root = load("root");
const int = load("int");
const leaf = load("leaf");
const leafCa = load("leaf_ca");
const leafKeyCertSign = load("leaf_keycertsign");
const leafNoKeyUsage = load("leaf_nokeyusage");
const childOfKeyCertSign = load("child_of_keycertsign");
const childOfNoKeyUsage = load("child_of_nokeyusage");

function rejects(chain, pattern) {
  assert.throws(
    () => verifyChain(chain, root),
    (error) =>
      error instanceof ProofVCError &&
      error.code === "verification_failed" &&
      pattern.test(error.message),
  );
}

test("accepts a leaf issued by a CA intermediate chaining to the root", () => {
  verifyChain([leaf, int], root);
});

test("rejects a CA:false certificate used as an intermediate, even with keyCertSign", () => {
  assert.equal(leafKeyCertSign.ca, false);
  assert.equal(childOfKeyCertSign.checkIssued(leafKeyCertSign), true);
  rejects(
    [childOfKeyCertSign, leafKeyCertSign, int],
    /Certificate at index 1 is not a CA certificate/,
  );
});

test("rejects a CA:false certificate without keyUsage used as an intermediate", () => {
  assert.equal(leafNoKeyUsage.ca, false);
  rejects(
    [childOfNoKeyUsage, leafNoKeyUsage, int],
    /Certificate at index 1 is not a CA certificate/,
  );
});

test("rejects a CA:true leaf", () => {
  rejects([leafCa, int], /Leaf certificate must not be a CA certificate/);
});

test("rejects a chain that skips the intermediate", () => {
  rejects([leaf], /Certificate at index 0 not issued by next in chain/);
});

test("rejects a valid chain against a different root", () => {
  assert.throws(
    () => verifyChain([leaf, int], TRUST_ROOTS.development),
    (error) =>
      error instanceof ProofVCError &&
      error.code === "verification_failed" &&
      /Certificate at index 1 not issued by next in chain/.test(error.message),
  );
});

test("rejects an empty chain", () => {
  rejects([], /empty chain/);
});
