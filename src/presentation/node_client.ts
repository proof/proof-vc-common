import { X509Certificate } from "node:crypto";
import { Buffer } from "node:buffer";
import { SDJwtVcInstance } from "@sd-jwt/sd-jwt-vc";
import { ES256, ES384, ES512, hasher } from "@owf/crypto";
import { base64urlDecode } from "@owf/identity-common";

import type { ProofCredential, VPToken } from "../types.ts";
import { credentialIdAsType } from "../utils.ts";
import { getProofCredential } from "../proof_credential_factory.ts";
import { verifyChain } from "../certificates/chain_validator.ts";
import { getTrustRoot } from "../certificates/trust_store/index.ts";
import { VCPresentationClient } from "./base_client.ts";

export type VerifyParams = {
  encodedSDJWT: string;
  nonce?: string;
};

export type VerifyVPTokenParams = {
  encodedVPToken: string;
  nonce?: string;
};

const VERIFIERS = { ES256, ES384, ES512 } as const;
type SupportedAlg = keyof typeof VERIFIERS;

const EXPECTED_CURVE: Record<SupportedAlg, string> = {
  ES256: "P-256",
  ES384: "P-384",
  ES512: "P-521",
};

function isSupportedAlg(s: unknown): s is SupportedAlg {
  return typeof s === "string" && s in VERIFIERS;
}

export class NodeVCPresentationClient extends VCPresentationClient {
  public async verify({
    encodedSDJWT,
    nonce,
  }: VerifyParams): Promise<ProofCredential> {
    const decoded = await new SDJwtVcInstance({ hasher }).decode(encodedSDJWT);
    const alg = decoded.jwt?.header?.["alg"];
    const x5c = decoded.jwt?.header?.["x5c"];

    if (!isSupportedAlg(alg)) {
      throw `Unsupported or missing alg: ${alg}`;
    }
    if (!Array.isArray(x5c) || x5c.length === 0) {
      throw "JWT header x5c is missing or empty";
    }

    const chain = x5c.map(
      (b64) => new X509Certificate(Buffer.from(b64 as string, "base64")),
    );
    verifyChain(chain, getTrustRoot(this.environment));

    const leafJwk = chain[0]!.publicKey.export({ format: "jwk" });
    if (leafJwk.crv !== EXPECTED_CURVE[alg]) {
      throw `Leaf cert curve ${leafJwk.crv} does not match alg ${alg}`;
    }

    const verifier = await VERIFIERS[alg].getVerifier(leafJwk);
    const SDJWTClient = new SDJwtVcInstance({ hasher, verifier });
    await SDJWTClient.verify(encodedSDJWT, { nonce });

    return getProofCredential(decoded);
  }

  public async verifyVPToken({
    encodedVPToken,
    nonce,
  }: VerifyVPTokenParams): Promise<VPToken> {
    const records = JSON.parse(base64urlDecode(encodedVPToken)) as Record<
      string,
      string[]
    >;
    const vpToken = {} as VPToken;

    for (const [key, encodedSDJWTs] of Object.entries(records)) {
      const credentialId = credentialIdAsType(key);
      vpToken[credentialId] = [];
      for (const encodedSDJWT of encodedSDJWTs) {
        const credential = await this.verify({
          encodedSDJWT,
          ...(nonce !== undefined && { nonce }),
        });
        vpToken[credentialId].push(credential);
      }
    }
    return vpToken;
  }
}
