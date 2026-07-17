import { expect } from "chai";
import axios from "axios";
import { NextFunction, Request, Response } from "express";
import type Logger from "bunyan";
import type { Pool } from "pg";

import {
  errorCodes,
  privacySafeErrorDetails,
  StableApiError,
} from "../src/errorCodes";
import { errorHandler, logErrors } from "../src/middleware";
import { currentPrice } from "../src/coin-price/handler";
import { handleSignedTx } from "../src/services/signedTransaction";

describe("privacy-safe error codes", () => {
  it("replaces an internal message with the same stable code in logs and HTTP", () => {
    const secret = "addr1secret-in-error-message";
    const error = new Error(`Database rejected ${secret}`);
    const logged: unknown[][] = [];
    const originalConsoleError = console.error;
    let forwarded: Error | undefined;
    let statusCode: number | undefined;
    let responseBody: unknown;
    const response = {
      status(status: number) {
        statusCode = status;
        return this;
      },
      send(body: unknown) {
        responseBody = body;
        return this;
      },
    } as Response;
    console.error = (...values: unknown[]) => logged.push(values);

    try {
      logErrors(error, {} as Request, response, ((nextError?: Error) => {
        forwarded = nextError;
      }) as NextFunction);
      errorHandler(
        error,
        {} as Request,
        response,
        (() => undefined) as NextFunction
      );
    } finally {
      console.error = originalConsoleError;
    }

    expect(forwarded).to.equal(error);
    expect(statusCode).to.equal(500);
    expect(responseBody).to.deep.equal({
      error: { code: errorCodes.internalServerError },
    });
    expect(logged).to.have.length(1);
    expect(logged[0][1]).to.include({
      error_code: errorCodes.internalServerError,
    });
    expect(logged[0][1]).not.to.have.property("message_digest");
    expect(JSON.stringify({ logged, responseBody })).not.to.include(secret);
  });

  it("does not treat legacy-looking messages as public codes", () => {
    expect(
      privacySafeErrorDetails(new Error("REFERENCE_POINT_BLOCK_NOT_FOUND"))
        .error_code
    ).to.equal(errorCodes.internalServerError);
  });

  it("returns an explicitly assigned stable code without message inspection", () => {
    const error = new StableApiError(errorCodes.invalidRequest);

    expect(privacySafeErrorDetails(error).error_code).to.equal(
      errorCodes.invalidRequest
    );
  });

  it("drops multiline message text before retaining bounded stack frames", () => {
    const secret = "addr1secret-on-an-extra-message-line";
    const error = new Error(`Rejected request\n${secret}`);
    const details = privacySafeErrorDetails(error);

    expect(details.error_code).to.equal(errorCodes.internalServerError);
    expect(details.stack_frames).to.be.a("string");
    expect(details.stack_frames?.split("\n")).to.have.length.lessThanOrEqual(
      12
    );
    expect(JSON.stringify(details)).not.to.include(secret);
  });

  it("does not expose database failures from the coin-price handler", async () => {
    const secret = "postgres-secret-detail";
    const loggerEntries: unknown[][] = [];
    const db = {
      query: async () => {
        throw new Error(`Database rejected ${secret}`);
      },
    } as unknown as Pool;
    const logger = {
      error: (...values: unknown[]) => loggerEntries.push(values),
    } as unknown as Logger;
    let statusCode: number | undefined;
    let responseBody: unknown;
    const response = {
      status(status: number) {
        statusCode = status;
        return this;
      },
      send(body: unknown) {
        responseBody = body;
        return this;
      },
    } as Response;

    await currentPrice(
      db,
      logger,
      { params: { from: "ADA" } } as unknown as Request,
      response
    );

    expect(statusCode).to.equal(500);
    expect(responseBody).to.deep.equal({
      error: { code: errorCodes.coinPriceUnavailable },
    });
    expect(loggerEntries).to.have.length(1);
    expect(loggerEntries[0][0]).to.include({
      error_code: errorCodes.coinPriceUnavailable,
    });
    expect(JSON.stringify({ loggerEntries, responseBody })).not.to.include(
      secret
    );
  });

  it("does not forward transaction-submission response details", async () => {
    const secret = "upstream-transaction-rejection-detail";
    const originalAdapter = axios.defaults.adapter;
    let caught: unknown;
    axios.defaults.adapter = async () => {
      const error = new Error("Transaction submission failed") as Error & {
        response: { status: number; data: { detail: string } };
      };
      error.response = { status: 400, data: { detail: secret } };
      throw error;
    };

    try {
      await handleSignedTx(
        {
          body: { signedTx: Buffer.from("not-sensitive").toString("base64") },
        } as Request,
        {} as Response
      );
    } catch (error) {
      caught = error;
    } finally {
      axios.defaults.adapter = originalAdapter;
    }

    expect(caught).to.be.instanceOf(StableApiError);
    expect((caught as StableApiError).code).to.equal(
      errorCodes.transactionSubmissionFailed
    );
    expect(JSON.stringify(caught)).not.to.include(secret);
  });
});
