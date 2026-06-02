import type { CredentialType, Format, ProofCredential } from "./types.ts";
import type { SDJwt } from "@sd-jwt/core";

export type { ProofCredential } from "./types.ts";

type CredentialParams = {
  sdjwt: SDJwt;
  claims: Record<string, unknown>;
};

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
}

type ProofCredentialV1Params = {
  given_name?: string;
  family_name?: string;
  birth_date?: string;
  is_over_18?: boolean;
  is_over_21?: boolean;
  is_over_65?: boolean;
} & CredentialParams;

export class ProofCredentialV1 extends Credential {
  private readonly given_name: string | undefined;
  private readonly family_name: string | undefined;
  private readonly birth_date: string | undefined;
  private readonly is_over_18: boolean | undefined;
  private readonly is_over_21: boolean | undefined;
  private readonly is_over_65: boolean | undefined;

  constructor(params: ProofCredentialV1Params) {
    super(params);
    this.given_name = params.given_name;
    this.family_name = params.family_name;
    this.birth_date = params.birth_date;
    this.is_over_18 = params.is_over_18;
    this.is_over_21 = params.is_over_21;
    this.is_over_65 = params.is_over_65;
  }

  public credentialType(): CredentialType {
    return "ProofCredentialV1";
  }

  public format(): Format {
    return "dc+sd-jwt";
  }

  public givenName(): string | undefined {
    return this.given_name;
  }

  public familyName(): string | undefined {
    return this.family_name;
  }

  public dateOfBirth(): Date | undefined {
    if (this.birth_date !== undefined) {
      return new Date(this.birth_date);
    } else {
      return undefined;
    }
  }

  public isOver18(): boolean | undefined {
    return this.is_over_18;
  }

  public isOver21(): boolean | undefined {
    return this.is_over_21;
  }

  public isOver65(): boolean | undefined {
    return this.is_over_65;
  }
}
