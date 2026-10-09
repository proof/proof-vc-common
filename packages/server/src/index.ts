export * from "@proof.com/proof-vc-common";

export {
  ProofCredentialV1,
  DefaultProofCredential,
} from "./proof_credentials.ts";
export type { ProofCredential, VPToken } from "./types.ts";

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
  PrivateKeyFactory,
  ServerAuthorizationRequestParams,
  ServerVCClient,
  DCAPIAuthorizationRequestParams,
  DCAPIAuthorizationRequest,
  JarByReferenceParams,
  RequestOptions,
} from "./client.ts";
export { DEFAULT_TIMEOUT_MS } from "./http.ts";
export { DEFAULT_REQUEST_OBJECT_LIFETIME_SECONDS } from "./secured_request.ts";
export { createClient } from "./client.ts";
export type { PrivateKey } from "./client_assertion.ts";

export type {
  ClientIdMetadataDocumentParams,
  ClientIdMetadataDocument,
} from "./client_id_metadata.ts";
export { createClientIdMetadataDocument } from "./client_id_metadata.ts";

export type {
  EnrollParams,
  EnrollResult,
  EnrollmentPending,
  EnrollmentApproved,
  EnrollmentRejected,
  EnrollmentErrorResponse,
} from "./enroll.ts";
export { enroll, EnrollmentError, ENROLLMENT_PATH } from "./enroll.ts";

export type {
  VerifierConfig,
  VerifyParams,
  VerifyVPTokenParams,
  Verifier,
} from "./verifier.ts";
export { createVerifier } from "./verifier.ts";
