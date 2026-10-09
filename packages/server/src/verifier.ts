import { X509Certificate } from "node:crypto";
import { Buffer } from "node:buffer";
import { SDJwtVcInstance } from "@sd-jwt/sd-jwt-vc";
import type { JwtPayload } from "@sd-jwt/core";
import { ES256, ES384, ES512, hasher } from "@owf/crypto";
import { base64urlDecode } from "@owf/identity-common";
import {
  ProofVCError,
  type Environment,
  type ProofVCErrorCode,
} from "@proof.com/proof-vc-common";
import {
  warnOnce,
  assertOneOf,
  assertNonEmptyString,
  credentialIssuer,
  BASE_URLS,
} from "@proof.com/proof-vc-common/internal";

import type { ProofCredential, TrustRoot, VPToken } from "./types.ts";
import { CREDENTIAL_IDS, isKnownCredentialId } from "./utils.ts";
import { getProofCredential } from "./proof_credential_factory.ts";
import { verifyChain } from "./certificates/chain_validator.ts";
import { getTrustRoot } from "./certificates/trust_store/index.ts";
import { assertPositiveInteger, type PrivateKeyFactory } from "./client.ts";
import type { HttpConfig, RequestOptions } from "./http.ts";
import { resolveDetachedSignatures } from "./detached_signatures.ts";

export type VerifierConfig = HttpConfig & {
  environment: Environment;
  clientId?: string;
  privateKeyFactory?: PrivateKeyFactory;
};

const SD_JWT_VC_TYP = "dc+sd-jwt";

function trustRootFor(environment: Environment): TrustRoot {
  return environment === "production" ? "production" : "development";
}

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

function fail(message: string): never {
  throw new ProofVCError("verification_failed", message);
}

async function wrap<T>(
  code: ProofVCErrorCode,
  message: string,
  fn: () => T | Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (cause) {
    if (cause instanceof ProofVCError) {
      throw cause;
    }
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new ProofVCError(code, `${message}: ${detail}`, { cause });
  }
}

function kbVerifierFor(kbAlg: SupportedAlg) {
  return async (
    data: string,
    sig: string,
    payload: JwtPayload,
  ): Promise<boolean> => {
    const cnfJwk = payload.cnf?.jwk;
    if (cnfJwk === undefined) {
      fail("SD-JWT-VC is missing cnf.jwk — cannot verify KB JWT");
    }
    if (cnfJwk.crv !== EXPECTED_CURVE[kbAlg]) {
      fail(`cnf.jwk curve ${cnfJwk.crv} does not match KB JWT alg ${kbAlg}`);
    }
    const verifier = await VERIFIERS[kbAlg].getVerifier(cnfJwk);
    return verifier(data, sig);
  };
}

export interface Verifier {
  verify(
    params: VerifyParams,
    options?: RequestOptions,
  ): Promise<ProofCredential>;
  verifyVPToken(
    params: VerifyVPTokenParams,
    options?: RequestOptions,
  ): Promise<VPToken>;
}

function assertVerifierConfig(config: VerifierConfig): void {
  assertOneOf(config.environment, BASE_URLS, "environment");
  if (config.clientId !== undefined) {
    assertNonEmptyString(config.clientId, "clientId");
  }
  if (
    config.privateKeyFactory !== undefined &&
    typeof config.privateKeyFactory !== "function"
  ) {
    throw new ProofVCError(
      "invalid_config",
      "`privateKeyFactory` must be a function",
    );
  }
  if (config.timeout !== undefined) {
    assertPositiveInteger(config.timeout, "timeout");
  }
}

export function createVerifier(config: VerifierConfig): Verifier {
  assertVerifierConfig(config);
  const trustRoot = trustRootFor(config.environment);
  const expectedIssuer = credentialIssuer(config.environment);

  async function verify(
    { encodedSDJWT: presented, aud }: VerifyParams,
    options?: RequestOptions,
  ): Promise<ProofCredential> {
    const encodedSDJWT = await resolveDetachedSignatures(
      config,
      presented,
      options,
    );
    const decoded = await wrap("invalid_input", "malformed SD-JWT-VC", () =>
      new SDJwtVcInstance({ hasher }).decode(encodedSDJWT),
    );
    const typ = decoded.jwt?.header?.["typ"];
    const alg = decoded.jwt?.header?.["alg"];
    const x5c = decoded.jwt?.header?.["x5c"];
    const iss = decoded.jwt?.payload?.["iss"];

    if (typ !== SD_JWT_VC_TYP) {
      fail(`JWT header typ ${String(typ)} is not ${SD_JWT_VC_TYP}`);
    }
    if (!isSupportedAlg(alg)) {
      fail(`Unsupported or missing alg: ${alg}`);
    }
    if (!Array.isArray(x5c) || x5c.length === 0) {
      fail("JWT header x5c is missing or empty");
    }
    if (iss !== expectedIssuer) {
      fail(
        `Credential iss ${String(iss)} does not match expected issuer ${expectedIssuer}`,
      );
    }

    let kbVerifier = null;
    let keyBindingNonce: string | undefined;
    const kbAlg = decoded.kbJwt?.header?.alg;
    if (decoded.kbJwt !== undefined) {
      if (!isSupportedAlg(kbAlg)) {
        fail(`Unsupported or missing KB JWT alg: ${kbAlg}`);
      }
      if (aud !== undefined && decoded.kbJwt.payload?.aud !== aud) {
        fail(
          `KB JWT aud ${decoded.kbJwt.payload?.aud} does not match expected aud ${aud}`,
        );
      }
      keyBindingNonce = decoded.kbJwt.payload?.nonce;
      if (keyBindingNonce === undefined) {
        fail("SD-JWT-VC contains a KB JWT but no nonce claim");
      }
      kbVerifier = kbVerifierFor(kbAlg);
    }

    const chain = await wrap("invalid_input", "malformed x5c certificate", () =>
      x5c.map(
        (b64) => new X509Certificate(Buffer.from(b64 as string, "base64")),
      ),
    );
    verifyChain(chain, getTrustRoot(trustRoot));

    const leafJwk = chain[0]!.publicKey.export({ format: "jwk" });
    if (leafJwk.crv !== EXPECTED_CURVE[alg]) {
      fail(`Leaf cert curve ${leafJwk.crv} does not match alg ${alg}`);
    }

    const verifier = await VERIFIERS[alg].getVerifier(leafJwk);
    const SDJWTClient = new SDJwtVcInstance({
      hasher,
      verifier,
      ...(kbVerifier !== null && { kbVerifier }),
    });
    await wrap("verification_failed", "SD-JWT-VC verification failed", () =>
      SDJWTClient.verify(encodedSDJWT, {
        ...(keyBindingNonce !== undefined && { keyBindingNonce }),
      }),
    );

    return getProofCredential(decoded);
  }

  async function verifyVPToken(
    { encodedVPToken, aud }: VerifyVPTokenParams,
    options?: RequestOptions,
  ): Promise<VPToken> {
    const parsed: unknown = await wrap(
      "invalid_input",
      "malformed vp_token",
      () => JSON.parse(base64urlDecode(encodedVPToken)),
    );
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      throw new ProofVCError(
        "invalid_input",
        "vp_token must decode to a JSON object keyed by credential id",
      );
    }
    const records = parsed as Record<string, unknown>;

    const vpToken = {} as VPToken;
    const credentialIds = new Set<string>([
      ...CREDENTIAL_IDS,
      ...Object.keys(records),
    ]);
    for (const credentialId of credentialIds) {
      if (credentialId in Object.prototype) {
        throw new ProofVCError(
          "invalid_input",
          `vp_token contains an invalid credential id "${credentialId}"`,
        );
      }
      if (!isKnownCredentialId(credentialId)) {
        warnOnce(
          "PROOF_VC_UNKNOWN_CREDENTIAL_ID",
          `vp_token contains credential id "${credentialId}" which is not known to this version of the Proof VC SDK; upgrade to a newer version`,
        );
      }
      const presentations = Object.hasOwn(records, credentialId)
        ? records[credentialId]
        : [];
      if (
        !Array.isArray(presentations) ||
        !presentations.every((p) => typeof p === "string")
      ) {
        throw new ProofVCError(
          "invalid_input",
          `vp_token["${credentialId}"] must be an array of SD-JWT-VC strings`,
        );
      }
      const credentials: ProofCredential[] = [];
      for (const encodedSDJWT of presentations) {
        credentials.push(
          await verify(
            { encodedSDJWT, ...(aud !== undefined && { aud }) },
            options,
          ),
        );
      }
      vpToken[credentialId] = credentials;
    }
    return vpToken;
  }

  return { verify, verifyVPToken };
}
