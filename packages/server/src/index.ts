export * from "@proof.com/proof-vc-common";

export { ProofCredentialV1 } from "./proof_credentials.ts";
export type { ProofCredential, VPToken, TrustRoot } from "./types.ts";

export type {
  TransactionData,
  WireInstructionsTransactionData,
  PaymentMandateTransactionData,
  PaymentItemizedTransactionData,
  SessionDataTransactionData,
  WireInstructionsPayload,
  PaymentMandatePayload,
  PaymentItemizedPayload,
  PaymentItemizedItem,
  SessionDataPayload,
} from "./transaction_data.ts";
export { TX_DATA_TYPE, transactionData } from "./transaction_data.ts";

export type {
  ServerClientConfig,
  ServerAuthorizationRequestParams,
  ServerVCClient,
  DCAPIAuthorizationRequestParams,
  AuthorizationRequest,
} from "./client.ts";
export { createClient } from "./client.ts";

export type {
  VerifierConfig,
  VerifyParams,
  VerifyVPTokenParams,
  Verifier,
} from "./verifier.ts";
export { createVerifier } from "./verifier.ts";
