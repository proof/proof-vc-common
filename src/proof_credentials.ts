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
  public readonly givenName: string | undefined;
  public readonly familyName: string | undefined;
  public readonly isOver18: boolean | undefined;
  public readonly isOver21: boolean | undefined;
  public readonly isOver65: boolean | undefined;
  private readonly birth_date: string | undefined;

  constructor(params: ProofCredentialV1Params) {
    super(params);
    this.givenName = params.given_name;
    this.familyName = params.family_name;
    this.birth_date = params.birth_date;
    this.isOver18 = params.is_over_18;
    this.isOver21 = params.is_over_21;
    this.isOver65 = params.is_over_65;
  }

  public credentialType(): CredentialType {
    return "ProofCredentialV1";
  }

  public format(): Format {
    return "dc+sd-jwt";
  }

  public get dateOfBirth(): Date | undefined {
    return this.birth_date !== undefined
      ? new Date(this.birth_date)
      : undefined;
  }
}
