export const errorCodes = {
  internalServerError: "INTERNAL_SERVER_ERROR",
  coinPriceUnavailable: "COIN_PRICE_UNAVAILABLE",
  invalidRequest: "INVALID_REQUEST",
  transactionSubmissionFailed: "TRANSACTION_SUBMISSION_FAILED",
  referenceBestBlockMismatch: "REFERENCE_BEST_BLOCK_MISMATCH",
  referenceTxNotFound: "REFERENCE_TX_NOT_FOUND",
  referenceBlockMismatch: "REFERENCE_BLOCK_MISMATCH",
  referencePointBlockNotFound: "REFERENCE_POINT_BLOCK_NOT_FOUND",
  referenceBestBlockNotFound: "REFERENCE_BESTBLOCK_NOT_FOUND",
  bestBlockReferenceMismatch: "BESTBLOCK_REFERENCE_MISMATCH",
} as const;

export type ErrorCode = typeof errorCodes[keyof typeof errorCodes];

export class StableApiError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode) {
    super(code);
    this.name = "StableApiError";
    this.code = code;
  }
}

export const errorCodeFor = (error: unknown): ErrorCode =>
  error instanceof StableApiError ? error.code : errorCodes.internalServerError;

export type PrivacySafeErrorDetails = {
  error_code: ErrorCode;
};

export const privacySafeErrorDetails = (
  error: unknown,
  errorCode: ErrorCode = errorCodeFor(error)
): PrivacySafeErrorDetails => {
  return { error_code: errorCode };
};
