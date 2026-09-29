import type { X509Certificate } from "node:crypto";
import { ProofVCError } from "@proof.com/proof-vc-common";

function fail(message: string): never {
  throw new ProofVCError("verification_failed", message);
}

export function verifyChain(
  chain: X509Certificate[],
  root: X509Certificate,
): void {
  if (chain.length === 0) {
    fail("verifyChain: empty chain");
  }

  const full = [...chain, root];
  const now = new Date();

  if (chain[0]!.ca) {
    fail("Leaf certificate must not be a CA certificate");
  }

  for (let i = 0; i < full.length - 1; i++) {
    const cert = full[i]!;
    const issuer = full[i + 1]!;

    const validFrom = new Date(cert.validFromDate);
    const validTo = new Date(cert.validToDate);
    if (now < validFrom || now > validTo) {
      fail(`Certificate at index ${i} is expired or not yet valid`);
    }
    if (!issuer.ca) {
      fail(`Certificate at index ${i + 1} is not a CA certificate`);
    }
    if (!cert.checkIssued(issuer)) {
      fail(`Certificate at index ${i} not issued by next in chain`);
    }
    if (!cert.verify(issuer.publicKey)) {
      fail(`Certificate at index ${i} has invalid signature`);
    }
  }

  if (now > new Date(root.validToDate)) {
    fail("Root certificate expired");
  }
  if (!root.verify(root.publicKey)) {
    fail("Root is not self-signed");
  }
}
