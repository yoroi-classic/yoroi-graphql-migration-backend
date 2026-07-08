const requireEnvInProduction = (
  name: string,
  developmentDefault: string
): string => {
  const value = process.env[name];
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error(`${name} must be set in production`);
  }
  return developmentDefault;
};

const usingQueueEndpoint = process.env.USE_SIGNED_TX_QUEUE || "false";

const requireTxSubmissionEndpoint = (): string => {
  const value = process.env.TX_SUBMISSION_ENDPOINT;
  if (value) return value;
  if (process.env.NODE_ENV === "production" && usingQueueEndpoint !== "true") {
    throw new Error("TX_SUBMISSION_ENDPOINT must be set in production");
  }
  return "http://localhost:8090/api/submit/tx";
};

const requireSignedTxQueueEndpoint = (): string => {
  const value = process.env.SIGNED_TX_QUEUE_ENDPOINT;
  if (value) return value;
  if (process.env.NODE_ENV === "production" && usingQueueEndpoint === "true") {
    throw new Error(
      "SIGNED_TX_QUEUE_ENDPOINT must be set in production when USE_SIGNED_TX_QUEUE=true"
    );
  }
  return "http://localhost:3030/";
};

export default { 
  db: {
    user: process.env.POSTGRES_USER || "hasura",
    host: process.env.POSTGRES_HOST || "/tmp/",
    database: process.env.POSTGRES_DB || "cexplorer",
    password: process.env.POSTGRES_PASSWORD || "",
    port: process.env.POSTGRES_PORT || 5432
  },
  server: {
    addressRequestLimit: 500,
    apiResponseLimit: 50,
    txSubmissionEndpoint: requireTxSubmissionEndpoint(),
    signedTxQueueEndpoint: requireSignedTxQueueEndpoint(),
    smashEndpoint: requireEnvInProduction(
      "SMASH_ENDPOINT",
      "http://localhost:8083/api/v1/metadata/"
    ),
    port: process.env.PORT || 8082,
    txsHashesRequestLimit: 150,
  },
  safeBlockDifference: process.env.SAFE_BLOCK_DIFFERENCE || "10",
  usingQueueEndpoint,
  catalystFundInfoPath: requireEnvInProduction(
    "CATALYST_FUND_INFO_PATH",
    "http://localhost:8083/catalyst/fund-info.json"
  ),
  aws: {
    lambda: {
      nftValidator: "{envName}NftValidatorLambda"
    },
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
    region: process.env.AWS_REGION || "eu-central-1"
  },
  postgresOptions: {
    workMem: process.env.WORK_MEM || "'2GB'",
    maxParallelWorkers: process.env.MAX_PARALLEL_WORKERS || "12"
  },
  coinPrice: {
    currentPriceHttpCacheControlMaxAge: 60, // which is the price data refresh interval
    logLevel: "info",
    s3: {
      region: process.env.PRICE_DATA_S3_REGION,
      bucketName: process.env.PRICE_DATA_S3_BUCKET_NAME,
      accessKeyId: process.env.PRICE_DATA_S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.PRICE_DATA_S3_SECRET_ACCESS_KEY,
    },
  }
};
