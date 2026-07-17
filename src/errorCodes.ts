export const errorCodes = {
  internalServerError: "INTERNAL_SERVER_ERROR",
  coinPriceUnavailable: "COIN_PRICE_UNAVAILABLE",
  invalidRequest: "INVALID_REQUEST",
  transactionSubmissionFailed: "TRANSACTION_SUBMISSION_FAILED",
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

export const errorCodeFor = (error: Error): ErrorCode =>
  error instanceof StableApiError ? error.code : errorCodes.internalServerError;

export type PrivacySafeErrorDetails = {
  error_code: ErrorCode;
  stack_frames?: string;
};

export const privacySafeErrorDetails = (
  error: Error,
  errorCode: ErrorCode = errorCodeFor(error)
): PrivacySafeErrorDetails => {
  const stackFrames = error.stack
    ?.split("\n")
    .slice(1)
    .filter((line) => /^\s+at\s/.test(line))
    .slice(0, 12)
    .join("\n");
  return {
    error_code: errorCode,
    ...(stackFrames ? { stack_frames: stackFrames } : {}),
  };
};
