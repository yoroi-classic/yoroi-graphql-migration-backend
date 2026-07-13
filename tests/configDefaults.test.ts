import { expect } from "chai";
import { createRequire } from "module";
import path from "path";

interface BackendConfig {
  server: {
    txSubmissionEndpoint: string;
    signedTxQueueEndpoint: string;
    smashEndpoint: string;
  };
  usingQueueEndpoint: string;
  catalystFundInfoPath: string;
}

const requireFromTest = createRequire(
  path.resolve(process.cwd(), "tests/configDefaults.test.ts")
);
const configPath = path.resolve(process.cwd(), "config/default.ts");
const forbiddenHostedDefaults = [
  "backend.yoroiwallet.com",
  "smash.yoroiwallet.com",
  "yoroiwallet.com",
  "dwgsvtv0ekonw.cloudfront.net",
  "emurgo",
];
const managedEnvKeys = [
  "NODE_ENV",
  "TX_SUBMISSION_ENDPOINT",
  "SIGNED_TX_QUEUE_ENDPOINT",
  "USE_SIGNED_TX_QUEUE",
  "SMASH_ENDPOINT",
  "CATALYST_FUND_INFO_PATH",
  "POSTGRES_USER",
  "POSTGRES_HOST",
  "POSTGRES_DB",
  "POSTGRES_PASSWORD",
  "POSTGRES_PORT",
  "PORT",
] as const;

type ManagedEnvKey = typeof managedEnvKeys[number];

const clearConfigModule = (): void => {
  delete requireFromTest.cache[requireFromTest.resolve(configPath)];
};

const loadConfig = (): BackendConfig => {
  clearConfigModule();
  const configModule = requireFromTest(configPath) as {
    default: BackendConfig;
  };
  return configModule.default;
};

const withManagedEnv = <T>(
  env: Partial<Record<ManagedEnvKey, string>>,
  action: () => T
): T => {
  const previousEnv = new Map<ManagedEnvKey, string | undefined>(
    managedEnvKeys.map((key) => [key, process.env[key]])
  );

  for (const key of managedEnvKeys) {
    delete process.env[key];
  }

  for (const [key, value] of Object.entries(env) as [ManagedEnvKey, string][]) {
    process.env[key] = value;
  }

  try {
    return action();
  } finally {
    clearConfigModule();
    for (const [key, value] of previousEnv) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
};

const collectStrings = (value: unknown): string[] => {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value !== null && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap(
      collectStrings
    );
  }

  return [];
};

describe("config defaults", function () {
  this.timeout(20000);

  it("keeps development service endpoints local", () => {
    const backendConfig = withManagedEnv({ NODE_ENV: "test" }, loadConfig);

    expect(backendConfig.server.txSubmissionEndpoint).to.equal(
      "http://localhost:8090/api/submit/tx"
    );
    expect(backendConfig.server.signedTxQueueEndpoint).to.equal(
      "http://localhost:3030/"
    );
    expect(backendConfig.server.smashEndpoint).to.equal(
      "http://localhost:8083/api/v1/metadata/"
    );
    expect(backendConfig.catalystFundInfoPath).to.equal(
      "http://localhost:8083/catalyst/fund-info.json"
    );
    expect(backendConfig.usingQueueEndpoint).to.equal("false");
  });

  it("does not include legacy hosted Yoroi or EMURGO defaults", () => {
    const backendConfig = withManagedEnv({ NODE_ENV: "test" }, loadConfig);
    const defaultValues = collectStrings(backendConfig).map((value) =>
      value.toLowerCase()
    );

    for (const forbiddenDefault of forbiddenHostedDefaults) {
      expect(
        defaultValues.some((value) => value.includes(forbiddenDefault)),
        `unexpected hosted default containing ${forbiddenDefault}`
      ).to.equal(false);
    }
  });

  it("requires explicit production service endpoints", () => {
    expect(() =>
      withManagedEnv({ NODE_ENV: "production" }, loadConfig)
    ).to.throw("TX_SUBMISSION_ENDPOINT must be set in production");

    expect(() =>
      withManagedEnv(
        {
          NODE_ENV: "production",
          USE_SIGNED_TX_QUEUE: "true",
        },
        loadConfig
      )
    ).to.throw(
      "SIGNED_TX_QUEUE_ENDPOINT must be set in production when USE_SIGNED_TX_QUEUE=true"
    );

    expect(() =>
      withManagedEnv(
        {
          NODE_ENV: "production",
          TX_SUBMISSION_ENDPOINT: "https://backend.example.test/api/submit/tx",
        },
        loadConfig
      )
    ).to.throw("SMASH_ENDPOINT must be set in production");

    expect(() =>
      withManagedEnv(
        {
          NODE_ENV: "production",
          TX_SUBMISSION_ENDPOINT: "https://backend.example.test/api/submit/tx",
          SMASH_ENDPOINT: "https://smash.example.test/api/v1/metadata/",
        },
        loadConfig
      )
    ).to.throw("CATALYST_FUND_INFO_PATH must be set in production");
  });
});
