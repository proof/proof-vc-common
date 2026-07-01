import { X509Certificate } from "node:crypto";
import { Buffer } from "node:buffer";
import { SDJwtVcInstance } from "@sd-jwt/sd-jwt-vc";
import type { JwtPayload } from "@sd-jwt/types";
import { ES256, ES384, ES512, hasher } from "@owf/crypto";
import { base64urlDecode } from "@owf/identity-common";

import type { ProofCredential, TrustRoot, VPToken } from "./types.ts";
import { credentialIdAsType } from "./utils.ts";
import { getProofCredential } from "./proof_credential_factory.ts";
import { verifyChain } from "./certificates/chain_validator.ts";
import { getTrustRoot } from "./certificates/trust_store/index.ts";

export type VerifierConfig = {
  trustRoot: TrustRoot;
};

export type VerifyParams = {
  encodedSDJWT: string;
  aud?: string;
};

export type VerifyVPTokenParams = {
  encodedVPToken: string;
  aud?: string;
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

function kbVerifierFor(kbAlg: SupportedAlg) {
  return async (
    data: string,
    sig: string,
    payload: JwtPayload,
  ): Promise<boolean> => {
    const cnfJwk = payload.cnf?.jwk;
    if (cnfJwk === undefined) {
      throw new Error("SD-JWT-VC is missing cnf.jwk — cannot verify KB JWT");
    }
    if (cnfJwk.crv !== EXPECTED_CURVE[kbAlg]) {
      throw new Error(
        `cnf.jwk curve ${cnfJwk.crv} does not match KB JWT alg ${kbAlg}`,
      );
    }
    const verifier = await VERIFIERS[kbAlg].getVerifier(cnfJwk);
    return verifier(data, sig);
  };
}

export interface Verifier {
  verify(params: VerifyParams): Promise<ProofCredential>;
  verifyVPToken(params: VerifyVPTokenParams): Promise<VPToken>;
}

export function createVerifier(config: VerifierConfig): Verifier {
  async function verify({
    encodedSDJWT,
    aud,
  }: VerifyParams): Promise<ProofCredential> {
    const decoded = await new SDJwtVcInstance({ hasher }).decode(encodedSDJWT);
    const alg = decoded.jwt?.header?.["alg"];
    const x5c = decoded.jwt?.header?.["x5c"];

    if (!isSupportedAlg(alg)) {
      throw new Error(`Unsupported or missing alg: ${alg}`);
    }
    if (!Array.isArray(x5c) || x5c.length === 0) {
      throw new Error("JWT header x5c is missing or empty");
    }

    let kbVerifier = null;
    let keyBindingNonce: string | undefined;
    const kbAlg = decoded.kbJwt?.header?.alg;
    if (decoded.kbJwt !== undefined) {
      if (!isSupportedAlg(kbAlg)) {
        throw new Error(`Unsupported or missing KB JWT alg: ${kbAlg}`);
      }
      if (aud !== undefined && decoded.kbJwt.payload?.aud !== aud) {
        throw new Error(
          `KB JWT aud ${decoded.kbJwt.payload?.aud} does not match expected aud ${aud}`,
        );
      }
      keyBindingNonce = decoded.kbJwt.payload?.nonce;
      if (keyBindingNonce === undefined) {
        throw new Error("SD-JWT-VC contains a KB JWT but no nonce claim");
      }
      kbVerifier = kbVerifierFor(kbAlg);
    } else if (aud !== undefined) {
      throw new Error(
        "aud was supplied for verification but the SD-JWT-VC contains no KB JWT",
      );
    }

    const chain = x5c.map(
      (b64) => new X509Certificate(Buffer.from(b64 as string, "base64")),
    );
    verifyChain(chain, getTrustRoot(config.trustRoot));

    const leafJwk = chain[0]!.publicKey.export({ format: "jwk" });
    if (leafJwk.crv !== EXPECTED_CURVE[alg]) {
      throw new Error(
        `Leaf cert curve ${leafJwk.crv} does not match alg ${alg}`,
      );
    }

    const verifier = await VERIFIERS[alg].getVerifier(leafJwk);
    const SDJWTClient = new SDJwtVcInstance({
      hasher,
      verifier,
      ...(kbVerifier !== null && { kbVerifier }),
    });
    await SDJWTClient.verify(encodedSDJWT, {
      ...(keyBindingNonce !== undefined && { keyBindingNonce }),
    });

    return getProofCredential(decoded);
  }

  async function verifyVPToken({
    encodedVPToken,
    aud,
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
        const credential = await verify({
          encodedSDJWT,
          ...(aud !== undefined && { aud }),
        });
        vpToken[credentialId].push(credential);
      }
    }
    return vpToken;
  }

  return { verify, verifyVPToken };
}
