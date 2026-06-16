import { X509Certificate } from "node:crypto";
import { Buffer } from "node:buffer";
import { SDJwtVcInstance } from "@sd-jwt/sd-jwt-vc";
import type { JwtPayload } from "@sd-jwt/types";
import { ES256, ES384, ES512, hasher } from "@owf/crypto";
import { base64urlDecode } from "@owf/identity-common";

import type {
  Environment,
  ProofCredential,
  ResponseMode,
  TrustRoot,
  VPToken,
} from "../types.ts";
import { credentialIdAsType } from "../utils.ts";
import { getProofCredential } from "../proof_credential_factory.ts";
import { verifyChain } from "../certificates/chain_validator.ts";
import { getTrustRoot } from "../certificates/trust_store/index.ts";
import {
  VCPresentationClient,
  type AuthorizationRequestParams,
} from "./base_client.ts";

export type NodeInitParams = {
  trustRoot?: TrustRoot;
  environment?: Environment;
  clientId?: string;
  clientSecret?: string;
  callbackUri?: string;
  responseMode?: ResponseMode;
  usePushedAuthorizationRequest?: boolean;
};

export type VerifyParams = {
  encodedSDJWT: string;
  nonce?: string;
  aud?: string;
};

export type VerifyVPTokenParams = {
  encodedVPToken: string;
  nonce?: string;
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
      throw "SD-JWT-VC is missing cnf.jwk — cannot verify KB JWT";
    }
    if (cnfJwk.crv !== EXPECTED_CURVE[kbAlg]) {
      throw `cnf.jwk curve ${cnfJwk.crv} does not match KB JWT alg ${kbAlg}`;
    }
    const verifier = await VERIFIERS[kbAlg].getVerifier(cnfJwk);
    return verifier(data, sig);
  };
}

export class NodeVCPresentationClient extends VCPresentationClient {
  protected readonly clientSecret?: string;
  protected readonly usePushedAuthorizationRequest: boolean = false;
  protected readonly trustRoot?: TrustRoot;

  constructor(params: NodeInitParams) {
    super(params);
    if (params.clientSecret !== undefined) {
      this.clientSecret = params.clientSecret;
    }
    if (params.usePushedAuthorizationRequest !== undefined) {
      this.usePushedAuthorizationRequest = params.usePushedAuthorizationRequest;
    }
    if (params.trustRoot !== undefined) {
      this.trustRoot = params.trustRoot;
    }
  }

  public override async getAuthorizationRequestURL(
    params: AuthorizationRequestParams,
  ): Promise<string> {
    this.requireRequestConfig();
    return this.usePushedAuthorizationRequest
      ? this.pushAuthorizationRequest(params)
      : this.buildAuthorizeURL(params);
  }

  protected override defaultAuthorizationRequestParameters(): Record<
    string,
    string
  > {
    return {
      ...super.defaultAuthorizationRequestParameters(),
      ...(this.clientSecret !== undefined && {
        client_secret: this.clientSecret,
      }),
    };
  }

  protected async pushAuthorizationRequest(
    params: AuthorizationRequestParams,
  ): Promise<string> {
    if (this.clientSecret === undefined) {
      throw "pushed authorization requests require `clientSecret` in init()";
    }
    const parURL = new URL(`${this.oid4vpUri}/par`, this.baseURL()).toString();
    const response = await fetch(parURL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: this.buildParameters(params).toString(),
    });
    const data = await response.json();

    if (!response.ok) {
      throw `${data["error"]}: ${data["error_description"]}`;
    }

    const authorizeURL = new URL(`${this.oid4vpUri}/authorize`, this.baseURL());
    authorizeURL.search = new URLSearchParams({
      client_id: this.clientId!,
      request_uri: data["request_uri"],
    }).toString();

    return authorizeURL.toString();
  }

  protected requireTrustRoot(): TrustRoot {
    if (this.trustRoot === undefined) {
      throw "verify requires `trustRoot` in init()";
    }
    return this.trustRoot;
  }

  public async verify({
    encodedSDJWT,
    nonce,
    aud,
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

    let kbVerifier = null;
    const kbAlg = decoded.kbJwt?.header?.alg;
    if (decoded.kbJwt !== undefined) {
      if (nonce === undefined) {
        throw "SD-JWT-VC contains a KB JWT but no nonce was supplied for verification";
      }
      if (!isSupportedAlg(kbAlg)) {
        throw `Unsupported or missing KB JWT alg: ${kbAlg}`;
      }
      if (aud !== undefined && decoded.kbJwt.payload?.aud !== aud) {
        throw `KB JWT aud ${decoded.kbJwt.payload?.aud} does not match expected aud ${aud}`;
      }
      kbVerifier = kbVerifierFor(kbAlg);
    } else if (aud !== undefined) {
      throw "aud was supplied for verification but the SD-JWT-VC contains no KB JWT";
    }

    const chain = x5c.map(
      (b64) => new X509Certificate(Buffer.from(b64 as string, "base64")),
    );
    verifyChain(chain, getTrustRoot(this.requireTrustRoot()));

    const leafJwk = chain[0]!.publicKey.export({ format: "jwk" });
    if (leafJwk.crv !== EXPECTED_CURVE[alg]) {
      throw `Leaf cert curve ${leafJwk.crv} does not match alg ${alg}`;
    }

    const verifier = await VERIFIERS[alg].getVerifier(leafJwk);
    const SDJWTClient = new SDJwtVcInstance({
      hasher,
      verifier,
      ...(kbVerifier !== null && { kbVerifier }),
    });
    await SDJWTClient.verify(encodedSDJWT, {
      ...(nonce !== undefined ? { keyBindingNonce: nonce } : {}),
    });

    return getProofCredential(decoded);
  }

  public async verifyVPToken({
    encodedVPToken,
    nonce,
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
        const credential = await this.verify({
          encodedSDJWT,
          ...(nonce !== undefined && { nonce }),
          ...(aud !== undefined && { aud }),
        });
        vpToken[credentialId].push(credential);
      }
    }
    return vpToken;
  }
}
