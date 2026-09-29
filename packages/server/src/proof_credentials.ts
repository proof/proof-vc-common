import type { CredentialType, Format } from "@proof.com/proof-vc-common";
import type { ProofCredential } from "./types.ts";
import type { SDJwt } from "@sd-jwt/core";

export type { ProofCredential } from "./types.ts";

type CredentialParams = {
  sdjwt: SDJwt;
  claims: Record<string, unknown>;
};

type ProofCredentialV1Params = {
  given_name?: string;
  family_name?: string;
  birth_date?: string;
  is_over_18?: boolean;
  is_over_21?: boolean;
  is_over_65?: boolean;
  is_national_us?: boolean;
} & CredentialParams;

type DefaultProofCredentialParams = {
  vct?: string;
} & CredentialParams;

abstract class Credential implements ProofCredential {
  private readonly sdjwt: SDJwt;
  private readonly claims: Record<string, unknown>;

  protected constructor({ sdjwt, claims }: CredentialParams) {
    this.sdjwt = sdjwt;
    this.claims = claims;
  }

  abstract credentialType(): CredentialType;
  abstract format(): Format;

  public getClaims(): Record<string, unknown> {
    return this.claims;
  }

  public getSDJWT(): SDJwt {
    return this.sdjwt;
  }

  public getNonce(): string | undefined {
    return this.sdjwt.kbJwt?.payload?.nonce;
  }

  public toJSON(): Record<string, unknown> {
    return {
      credentialType: this.credentialType(),
      format: this.format(),
      nonce: this.getNonce(),
    };
  }
}

export class ProofCredentialV1 extends Credential {
  public readonly givenName: string | undefined;
  public readonly familyName: string | undefined;
  public readonly birthDate: string | undefined;
  public readonly isOver18: boolean | undefined;
  public readonly isOver21: boolean | undefined;
  public readonly isOver65: boolean | undefined;
  public readonly isNationalUS: boolean | undefined;

  constructor(params: ProofCredentialV1Params) {
    super(params);
    this.givenName = params.given_name;
    this.familyName = params.family_name;
    this.birthDate = params.birth_date;
    this.isOver18 = params.is_over_18;
    this.isOver21 = params.is_over_21;
    this.isOver65 = params.is_over_65;
    this.isNationalUS = params.is_national_us;
  }

  public credentialType(): CredentialType {
    return "ProofCredentialV1";
  }

  public format(): Format {
    return "dc+sd-jwt";
  }

  public override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      givenName: this.givenName,
      familyName: this.familyName,
      birthDate: this.birthDate,
      isOver18: this.isOver18,
      isOver21: this.isOver21,
      isOver65: this.isOver65,
      isNationalUS: this.isNationalUS,
    };
  }
}

export class DefaultProofCredential extends Credential {
  public readonly vct: string | undefined;

  constructor(params: DefaultProofCredentialParams) {
    super(params);
    this.vct = params.vct;
  }

  public credentialType(): CredentialType {
    return "Default";
  }

  public format(): Format {
    return "dc+sd-jwt";
  }

  public override toJSON(): Record<string, unknown> {
    return { ...super.toJSON(), vct: this.vct, claims: this.getClaims() };
  }
}

// this definition is a compile time guard, `satisfies` fails typecheck if a `CredentialType` has no class
const _CREDENTIAL_CLASSES = {
  ProofCredentialV1,
  Default: DefaultProofCredential,
} satisfies Record<CredentialType, unknown>;
