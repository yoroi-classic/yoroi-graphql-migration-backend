import { NextFunction, Request, Response, Router } from "express";
import { expect } from "chai";

import { applyRoutes, Route } from "../src/utils";

type RegisteredRoute = {
  method: string;
  path: string;
  handler: unknown;
};

const createRouterRecorder = (): {
  registeredRoutes: RegisteredRoute[];
  router: Record<string, (path: string, handler: unknown) => void>;
} => {
  const registeredRoutes: RegisteredRoute[] = [];

  return {
    registeredRoutes,
    router: {
      get: (path, handler) => {
        registeredRoutes.push({ method: "get", path, handler });
      },
      post: (path, handler) => {
        registeredRoutes.push({ method: "post", path, handler });
      },
    },
  };
};

describe("applyRoutes", function () {
  it("registers direct handlers and interceptor-backed handlers in order", () => {
    const directHandler = (_req: Request, _res: Response) => undefined;
    const interceptor = (
      _req: Request,
      _res: Response,
      _next: NextFunction
    ) => _next();
    const interceptedHandler = (_req: Request, _res: Response) => undefined;
    const routes: Route[] = [
      {
        path: "/direct",
        method: "get",
        handler: directHandler,
      },
      {
        path: "/with-interceptor",
        method: "post",
        interceptor,
        handler: interceptedHandler,
      },
    ];
    const { registeredRoutes, router } = createRouterRecorder();

    applyRoutes(routes, router as unknown as Router);

    expect(registeredRoutes).to.deep.equal([
      { method: "get", path: "/direct", handler: directHandler },
      { method: "post", path: "/with-interceptor", handler: interceptor },
      {
        method: "post",
        path: "/with-interceptor",
        handler: interceptedHandler,
      },
    ]);
  });
});
