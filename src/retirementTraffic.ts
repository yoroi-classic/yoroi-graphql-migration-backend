import { IncomingMessage } from "http";
import { NextFunction, Request, Response } from "express";

type TrafficSink = (event: RetirementTrafficEvent) => void;

type RetirementTrafficOptions = {
  deployment?: string;
  network?: string;
  sink?: TrafficSink;
};

type ClientEvidence = {
  client_kind: "required_client" | "operations_only" | "unknown";
  client_platform:
    | "android"
    | "ios"
    | "legacy_mobile"
    | "firefox"
    | "chrome"
    | "unknown";
  client_version_band: string | null;
};

export type RetirementTrafficEvent = ClientEvidence & {
  event: "retirement_route_request";
  schema_version: 1;
  deployment: string;
  network: string;
  surface: "http" | "websocket";
  method: string;
  route: string;
  response_class: string;
};

const VERSION_HEADER = "yoroi-version";
const OPERATIONS_ROUTES = new Set([
  "/v2/importerhealthcheck",
  "/v2.1/importerhealthcheck",
]);
const SAFE_DIMENSION = /^[a-z0-9][a-z0-9_-]{0,31}$/i;
const CLIENT_VERSION =
  /^(android|ios|-|firefox|chrome) \/ ([0-9]{1,6})\.([0-9]{1,6})(?:\.[0-9]{1,6})?$/i;

const safeDimension = (value: string | undefined): string =>
  value && SAFE_DIMENSION.test(value) ? value.toLowerCase() : "unknown";

const defaultSink: TrafficSink = (event) => {
  console.info(JSON.stringify(event));
};

const responseClass = (statusCode: number): string =>
  Number.isInteger(statusCode) && statusCode >= 100 && statusCode <= 599
    ? `${Math.floor(statusCode / 100)}xx`
    : "unknown";

const normalizedRoute = (req: Request): string => {
  const route = req.route as { path?: unknown } | undefined;
  return typeof route?.path === "string" && route.path.startsWith("/")
    ? route.path
    : "unmatched";
};

const rawVersionHeader = (
  headers: IncomingMessage["headers"]
): string | undefined => {
  const value = headers[VERSION_HEADER];
  return Array.isArray(value) ? value[0] : value;
};

const clientEvidence = (
  route: string,
  headers: IncomingMessage["headers"]
): ClientEvidence => {
  if (OPERATIONS_ROUTES.has(route)) {
    return {
      client_kind: "operations_only",
      client_platform: "unknown",
      client_version_band: null,
    };
  }

  const match = rawVersionHeader(headers)?.match(CLIENT_VERSION);
  if (!match) {
    return {
      client_kind: "unknown",
      client_platform: "unknown",
      client_version_band: null,
    };
  }

  return {
    client_kind: "required_client",
    client_platform:
      match[1] === "-"
        ? "legacy_mobile"
        : (match[1].toLowerCase() as ClientEvidence["client_platform"]),
    client_version_band: `${Number(match[2])}.${Number(match[3])}`,
  };
};

const resolveOptions = (
  options: RetirementTrafficOptions
): Required<RetirementTrafficOptions> => ({
  deployment:
    options.deployment ||
    process.env.RETIREMENT_TRAFFIC_DEPLOYMENT ||
    "unknown",
  network:
    options.network || process.env.RETIREMENT_TRAFFIC_NETWORK || "unknown",
  sink: options.sink || defaultSink,
});

export const createRetirementTrafficMiddleware = (
  options: RetirementTrafficOptions = {}
) => {
  const resolved = resolveOptions(options);

  return (req: Request, res: Response, next: NextFunction): void => {
    res.once("finish", () => {
      const route = normalizedRoute(req);
      resolved.sink({
        event: "retirement_route_request",
        schema_version: 1,
        deployment: safeDimension(resolved.deployment),
        network: safeDimension(resolved.network),
        surface: "http",
        method: safeDimension(req.method),
        route,
        response_class: responseClass(res.statusCode),
        ...clientEvidence(route, req.headers),
      });
    });
    next();
  };
};

export const recordRetirementWebSocketConnection = (
  req: IncomingMessage,
  options: RetirementTrafficOptions = {}
): void => {
  const resolved = resolveOptions(options);
  let route = "websocket_other";
  try {
    route =
      new URL(req.url || "/", "http://retirement.invalid").pathname === "/"
        ? "websocket_root"
        : "websocket_other";
  } catch (_error) {
    // Keep malformed or identifying upgrade targets out of the evidence.
  }
  resolved.sink({
    event: "retirement_route_request",
    schema_version: 1,
    deployment: safeDimension(resolved.deployment),
    network: safeDimension(resolved.network),
    surface: "websocket",
    method: "upgrade",
    route,
    response_class: "1xx",
    ...clientEvidence(route, req.headers),
  });
};
