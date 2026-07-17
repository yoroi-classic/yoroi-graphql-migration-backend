import { NextFunction, Request, Response, Router } from "express";
import cors from "cors";
import parser from "body-parser";
import compression from "compression";
import { createHash } from "crypto";
import camelizeKeys from "./utils";

export const handleCors = (router: Router): Router =>
  router.use(cors({ credentials: true, origin: true }));

export const handleBodyRequestParsing = (router: Router): void => {
  router.use(parser.urlencoded({ extended: true }));
  router.use(parser.json());
};

export const handleCompression = (router: Router): void => {
  router.use(compression());
};

export const handleCamelCaseResponse = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const send = res.send;
  res.send = function (body?: Buffer | string | boolean | Array<any>) {
    if (typeof body === "object" && body != null) {
      send.call(this, camelizeKeys(body));
    } else {
      send.call(this, body);
    }
    return res;
  };
  next();
};

export const logErrors = (
  err: unknown,
  _req: Request,
  _res: Response,
  next: NextFunction
): void => {
  let message: string;
  try {
    message = err instanceof Error ? err.message : String(err);
  } catch (_error) {
    message = "unstringifiable_error";
  }
  // Issue #48 replaces this interim digest with stable privacy-safe error codes.
  console.error("Request failed", {
    name: err instanceof Error ? err.name : typeof err,
    message_digest: createHash("sha256").update(message).digest("hex"),
  });
  next(err);
};

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  res.status(500).send({ error: { response: err.message } });
};
