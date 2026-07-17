import { EventEmitter } from "events";
import { IncomingMessage } from "http";
import { expect } from "chai";
import { NextFunction, Request, Response } from "express";

import {
  createRetirementTrafficMiddleware,
  recordRetirementWebSocketConnection,
  RetirementTrafficEvent,
} from "../src/retirementTraffic";
import { logErrors } from "../src/middleware";

const captureHttpEvent = (
  request: Partial<Request>,
  statusCode = 200
): RetirementTrafficEvent => {
  const events: RetirementTrafficEvent[] = [];
  const response = new EventEmitter() as EventEmitter & { statusCode: number };
  response.statusCode = statusCode;
  const middleware = createRetirementTrafficMiddleware({
    deployment: "Production_EU",
    network: "Mainnet",
    sink: (event) => events.push(event),
  });

  middleware(
    request as Request,
    response as unknown as Response,
    (() => undefined) as NextFunction
  );
  response.emit("finish");
  expect(events).to.have.length(1);
  return events[0];
};

describe("retirement traffic evidence", function () {
  it("emits only normalized dimensions for a client HTTP request", () => {
    const sensitiveTxHash = "secret-transaction-hash";
    const sensitiveAddress = "addr1secret-wallet-address";
    const sensitiveMnemonic = "one two three four five";
    const event = captureHttpEvent(
      {
        method: "GET",
        url: `/txs/io/${sensitiveTxHash}/o/4`,
        route: { path: "/txs/io/:tx_hash/o/:index" },
        body: {
          addresses: [sensitiveAddress],
          mnemonic: sensitiveMnemonic,
        },
        headers: {
          "yoroi-version": "chrome / 4.31.2",
          authorization: "Bearer secret",
        },
      },
      201
    );

    expect(event).to.deep.equal({
      event: "retirement_route_request",
      schema_version: 1,
      deployment: "production_eu",
      network: "mainnet",
      surface: "http",
      method: "get",
      route: "/txs/io/:tx_hash/o/:index",
      response_class: "2xx",
      client_kind: "required_client",
      client_platform: "chrome",
      client_version_band: "4.31",
    });
    const serialized = JSON.stringify(event);
    for (const secret of [
      sensitiveTxHash,
      sensitiveAddress,
      sensitiveMnemonic,
      "Bearer secret",
    ]) {
      expect(serialized).not.to.include(secret);
    }
  });

  it("does not copy malformed or identifying version headers", () => {
    const identifyingHeader = "android / 4.31.0 addr1do-not-log";
    const event = captureHttpEvent({
      method: "POST",
      route: { path: "/account/state" },
      headers: { "yoroi-version": identifyingHeader },
    });

    expect(event.client_kind).to.equal("unknown");
    expect(event.client_platform).to.equal("unknown");
    expect(event.client_version_band).to.equal(null);
    expect(JSON.stringify(event)).not.to.include(identifyingHeader);
  });

  it("keeps the legacy mobile version band without copying its header", () => {
    const event = captureHttpEvent({
      method: "GET",
      route: { path: "/status" },
      headers: { "yoroi-version": "- / 2.2.4" },
    });

    expect(event.client_kind).to.equal("required_client");
    expect(event.client_platform).to.equal("legacy_mobile");
    expect(event.client_version_band).to.equal("2.2");
  });

  it("labels importer health checks as operations-only", () => {
    const event = captureHttpEvent({
      method: "GET",
      route: { path: "/v2.1/importerhealthcheck" },
      headers: { "yoroi-version": "chrome / 4.31.2" },
    });

    expect(event.client_kind).to.equal("operations_only");
    expect(event.client_platform).to.equal("unknown");
  });

  it("records unmatched requests without copying their URL", () => {
    const sensitivePath = "/unknown/addr1secret";
    const event = captureHttpEvent({
      method: "GET",
      url: sensitivePath,
      headers: {},
    });

    expect(event.route).to.equal("unmatched");
    expect(JSON.stringify(event)).not.to.include(sensitivePath);
  });

  it("counts the root WebSocket without copying upgrade request data", () => {
    const events: RetirementTrafficEvent[] = [];
    const sensitiveCookie = "wallet_session=secret";
    recordRetirementWebSocketConnection(
      {
        headers: {
          cookie: sensitiveCookie,
          "yoroi-version": "ios / 4.30.1",
        },
        url: "/addr1secret",
      } as unknown as IncomingMessage,
      {
        deployment: "production-us",
        network: "mainnet",
        sink: (event) => events.push(event),
      }
    );

    expect(events).to.deep.equal([
      {
        event: "retirement_route_request",
        schema_version: 1,
        deployment: "production-us",
        network: "mainnet",
        surface: "websocket",
        method: "upgrade",
        route: "websocket_root",
        response_class: "1xx",
        client_kind: "required_client",
        client_platform: "ios",
        client_version_band: "4.30",
      },
    ]);
    expect(JSON.stringify(events)).not.to.include(sensitiveCookie);
    expect(JSON.stringify(events)).not.to.include("addr1secret");
  });

  it("does not copy request data or error text into the error log", () => {
    const logged: unknown[][] = [];
    const originalConsoleError = console.error;
    const sensitiveValue = "addr1secret-from-request";
    let forwarded: Error | undefined;
    console.error = (...values: unknown[]) => logged.push(values);

    try {
      logErrors(
        new Error(`Rejected value ${sensitiveValue}`),
        {
          url: `/account/${sensitiveValue}`,
          body: { address: sensitiveValue },
        } as Request,
        {} as Response,
        ((error?: Error) => {
          forwarded = error;
        }) as NextFunction
      );
    } finally {
      console.error = originalConsoleError;
    }

    expect(forwarded).to.be.instanceOf(Error);
    expect(logged).to.deep.equal([["Request failed", { name: "Error" }]]);
    expect(JSON.stringify(logged)).not.to.include(sensitiveValue);
  });
});
