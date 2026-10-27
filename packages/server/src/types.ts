import type { SDJwt } from "@sd-jwt/core";
import type {
  CredentialID,
  CredentialType,
  Format,
} from "@proof.com/proof-vc-common";
import type {
  TransactionDataPayload,
  TransactionDataType,
} from "./transaction_data.ts";

export type TrustRoot = "development" | "production";

export interface ProofCredential {
  credentialType(): CredentialType;
  format(): Format;
  getClaims(): Record<string, unknown>;
  getSDJWT(): SDJwt;
  getNonce(): string | undefined;
  getTransactionData<T extends TransactionDataType>(
    type: T,
  ): TransactionDataPayload<T> | undefined;
  toJSON(): Record<string, unknown>;
}

export type VPToken = Partial<Record<CredentialID, ProofCredential[]>> &
  Record<string, ProofCredential[] | undefined>;
