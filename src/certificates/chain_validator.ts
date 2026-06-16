import type { X509Certificate } from "node:crypto";

export function verifyChain(
  chain: X509Certificate[],
  root: X509Certificate,
): void {
  if (chain.length === 0) {
    throw "verifyChain: empty chain";
  }

  const full = [...chain, root];
  const now = new Date();

  for (let i = 0; i < full.length - 1; i++) {
    const cert = full[i]!;
    const issuer = full[i + 1]!;

    const validFrom = new Date(cert.validFromDate);
    const validTo = new Date(cert.validToDate);
    if (now < validFrom || now > validTo) {
      throw `Certificate at index ${i} is expired or not yet valid`;
    }
    if (!cert.checkIssued(issuer)) {
      throw `Certificate at index ${i} not issued by next in chain`;
    }
    if (!cert.verify(issuer.publicKey)) {
      throw `Certificate at index ${i} has invalid signature`;
    }
  }

  if (now > new Date(root.validToDate)) {
    throw "Root certificate expired";
  }
  if (!root.verify(root.publicKey)) {
    throw "Root is not self-signed";
  }
}
