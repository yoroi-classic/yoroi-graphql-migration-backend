import axios, { AxiosInstance } from "axios";
import express from "express";
import http from "http";
import { AddressInfo } from "net";
import { expect } from "chai";
import { Request, Response } from "express";
import { Pool, QueryConfig, QueryResult, QueryResultRow } from "pg";

import * as middleware from "../src/middleware";
import {
  applyMiddleware,
  applyRoutes,
  errMsgs,
  PoolOrClient,
  Route,
  UtilEither,
} from "../src/utils";
import * as utils from "../src/utils";
import { askBestBlock } from "../src/services/bestblock";
import { utxoForAddresses } from "../src/services/utxoForAddress";
import { askUtxoSumForAddresses } from "../src/services/utxoSumForAddress";
import {
  askBlockNumByHash,
  askBlockNumByTxHash,
  askTransactionHistory,
  BlockNumByTxHashFrag,
} from "../src/services/transactionHistory";
import { filterUsedAddresses } from "../src/services/filterUsedAddress";
import { handleGetAccountState } from "../src/services/accountState";
import { handlePoolInfo } from "../src/services/poolInfo";
import { handleGetMultiAssetTxMintMetadata } from "../src/services/multiAssetTxMint";
import { mapTransactionFragsToResponse } from "../src/utils/mappers";
import { errorCodes, StableApiError } from "../src/errorCodes";

import { walletContractFixtures as fixtures } from "./fixtures/walletEndpointContracts";

const addressesRequestLimit = 500;
const apiResponseLimit = 50;

const rows = <T extends QueryResultRow>(data: T[]): QueryResult<T> =>
  ({
    rows: data,
    command: "SELECT",
    rowCount: data.length,
    oid: 0,
    fields: [],
  } as QueryResult<T>);

const unwrapEither = <T>(result: UtilEither<T>): T => {
  if (result.kind === "ok") return result.value;
  throw new Error(result.errMsg);
};

interface WalletContractPoolOptions {
  poolMetadataHash?: string | null;
  poolHistoryRows?: QueryResultRow[];
}

class WalletContractPool implements PoolOrClient {
  private readonly options: WalletContractPoolOptions;

  constructor(options: WalletContractPoolOptions = {}) {
    this.options = options;
  }

  async query<R extends QueryResultRow = any, I extends any[] = any[]>(
    queryTextOrConfig: string | QueryConfig<I>,
    _values?: I
  ): Promise<QueryResult<R>> {
    const text =
      typeof queryTextOrConfig === "string"
        ? queryTextOrConfig
        : queryTextOrConfig.text;
    const compactText = text.replace(/\s+/g, " ").trim();

    if (
      compactText.includes("FROM BLOCK") &&
      compactText.includes("ORDER BY id DESC")
    ) {
      return rows([
        {
          epoch: 42,
          slot: 123,
          globalSlot: 456789,
          hash: fixtures.blockHash,
          height: 987654,
        },
      ]) as unknown as QueryResult<R>;
    }

    if (
      compactText.includes("from tx_out as outertx") &&
      compactText.includes("where address = any")
    ) {
      return rows([
        {
          inputs: [fixtures.address],
          outputs: [fixtures.address],
        },
      ]) as unknown as QueryResult<R>;
    }

    if (
      compactText.includes("FROM valid_utxos_view") &&
      compactText.includes("payment_cred = any")
    ) {
      return rows([
        {
          hash: fixtures.txHash,
          index: 0,
          address: fixtures.address,
          value: "1234567",
          data_hash: fixtures.dataHash,
          assets: [
            {
              f1: fixtures.policyId,
              f2: fixtures.assetNameHex,
              f3: "2",
            },
          ],
          blockNumber: 987650,
        },
      ]) as unknown as QueryResult<R>;
    }

    if (compactText.includes("SELECT SUM(value) as value")) {
      return rows([{ value: "1234567" }]) as unknown as QueryResult<R>;
    }

    if (compactText.includes("SELECT SUM(ma_utxo.quantity) amount")) {
      return rows([
        {
          amount: "2",
          policy: fixtures.policyId,
          name: fixtures.assetNameHex,
        },
      ]) as unknown as QueryResult<R>;
    }

    if (/SELECT "block"\."block_no" AS "blockNumber"/.test(compactText)) {
      return rows([{ blockNumber: 987654 }]) as unknown as QueryResult<R>;
    }

    if (
      compactText.includes("with hashes as") &&
      compactText.includes("outAddrValPairs")
    ) {
      return rows([
        {
          hash: Buffer.from(fixtures.txHash, "hex"),
          fee: "177381",
          valid_contract: true,
          script_size: 0,
          metadata: null,
          txIndex: 1,
          blockNumber: 987654,
          blockHash: Buffer.from(fixtures.blockHash, "hex"),
          blockEpochNo: 42,
          blockSlotNo: 456789,
          blockSlotInEpoch: 123,
          blockEra: "shelley",
          includedAt: new Date("2026-01-02T03:04:05.000Z"),
          inAddrValPairs: [
            {
              f1: fixtures.address,
              f2: "1234567",
              f3: fixtures.inputTxHash,
              f4: 0,
              f5: [
                {
                  f1: fixtures.policyId,
                  f2: fixtures.assetNameHex,
                  f3: "2",
                },
              ],
            },
          ],
          collateralInAddrValPairs: null,
          outAddrValPairs: [
            {
              f1: fixtures.address,
              f2: "1000000",
              f3: null,
              f4: [
                {
                  f1: fixtures.policyId,
                  f2: fixtures.assetNameHex,
                  f3: "2",
                },
              ],
            },
          ],
          collateralOutAddrValPairs: null,
          withdrawals: [],
          certificates: null,
        },
      ]) as unknown as QueryResult<R>;
    }

    if (
      compactText.includes("from stake_address") &&
      /"remainingAmount"/.test(compactText)
    ) {
      return rows([
        {
          stakeAddress: Buffer.from(fixtures.stakeAddress, "hex"),
          remainingAmount: "3000",
          remainingNonSpendableAmount: "0",
          reward: "5000",
          withdrawal: "2000",
        },
      ]) as unknown as QueryResult<R>;
    }

    if (
      compactText.includes("from pool_hash") &&
      compactText.includes("pool_metadata_ref")
    ) {
      if (this.options.poolMetadataHash) {
        return rows([
          { metadata_hash: this.options.poolMetadataHash },
        ]) as unknown as QueryResult<R>;
      }

      return rows([]) as unknown as QueryResult<R>;
    }

    if (
      compactText.includes("from combined_certificates") &&
      /"poolHashKey" = \$1/.test(compactText)
    ) {
      return rows(
        this.options.poolHistoryRows || []
      ) as unknown as QueryResult<R>;
    }

    if (compactText.includes("WITH mint_detail")) {
      return rows([
        {
          policy: fixtures.policyId,
          asset: Buffer.from(fixtures.assetName),
          key: "721",
          json: fixtures.tokenMetadata,
        },
      ]) as unknown as QueryResult<R>;
    }

    throw new Error(`Unexpected wallet contract query: ${compactText}`);
  }
}

const bestBlock = (pool: Pool) => async (_req: Request, res: Response) => {
  res.send(unwrapEither(await askBestBlock(pool)));
};

const utxoSumForAddresses =
  (pool: Pool) => async (req: Request, res: Response) => {
    if (!req.body || !req.body.addresses) {
      throw new Error("error, no addresses.");
    }
    const addresses = unwrapEither(
      utils.validateAddressesReq(addressesRequestLimit, req.body.addresses)
    );
    res.send(unwrapEither(await askUtxoSumForAddresses(pool, addresses)));
  };

const getOrDefaultAfterParam = (
  result: UtilEither<BlockNumByTxHashFrag>
): {
  blockNumber: number;
  txIndex: number;
} => {
  if (result.kind !== "ok") {
    if (result.errMsg === errMsgs.noValue) {
      return {
        blockNumber: -1,
        txIndex: -1,
      };
    }
    throw new Error(result.errMsg);
  }
  return {
    blockNumber: result.value.block.number,
    txIndex: result.value.blockIndex,
  };
};

const txHistory =
  (pool: PoolOrClient) => async (req: Request, res: Response) => {
    if (!req.body) {
      throw new Error("error, no body");
    }
    const body = unwrapEither(
      utils.validateHistoryReq(
        addressesRequestLimit,
        apiResponseLimit,
        req.body
      )
    );
    const limit = body.limit || apiResponseLimit;
    const [referenceTx, referenceBlock] =
      (body.after && [body.after.tx, body.after.block]) || [];
    const untilBlockNum = await askBlockNumByHash(pool, body.untilBlock);
    const afterBlockInfo = await askBlockNumByTxHash(pool, referenceTx);

    if (
      untilBlockNum.kind === "error" &&
      untilBlockNum.errMsg === utils.errMsgs.noValue
    ) {
      throw new Error("REFERENCE_BEST_BLOCK_MISMATCH");
    }
    if (afterBlockInfo.kind === "error" && typeof referenceTx !== "undefined") {
      throw new Error("REFERENCE_TX_NOT_FOUND");
    }
    if (
      afterBlockInfo.kind === "ok" &&
      afterBlockInfo.value.block.hash !== referenceBlock
    ) {
      throw new Error("REFERENCE_BLOCK_MISMATCH");
    }

    if (untilBlockNum.kind !== "ok") {
      throw new Error(untilBlockNum.errMsg);
    }

    const txs = unwrapEither(
      await askTransactionHistory(
        pool,
        limit,
        body.addresses,
        getOrDefaultAfterParam(afterBlockInfo),
        untilBlockNum.value
      )
    );
    res.send(mapTransactionFragsToResponse(txs));
  };

const getStatus = async (_req: Request, res: Response) => {
  res.send({
    parallelSync: Boolean(process.env.PARALLEL_SYNC),
    isServerOk: true,
    isMaintenance: false,
    serverTime: Date.now(),
    isQueueOnline: false,
  });
};

type SignedTxContractHandler = (req: Request, res: Response) => Promise<void>;

const directSignedTxContractHandler: SignedTxContractHandler = async (
  req,
  res
) => {
  if (!req.body.signedTx) {
    throw new StableApiError(errorCodes.invalidRequest);
  }

  res.send([]);
};

const queuedSignedTxContractHandler: SignedTxContractHandler = async (
  req,
  res
) => {
  if (!req.body.signedTx) {
    throw new StableApiError(errorCodes.invalidRequest);
  }

  res.status(200).send({ txId: fixtures.txHash });
};

const createContractRouter = (
  pool: WalletContractPool,
  signedTxContractHandler = directSignedTxContractHandler
) => {
  const router = express();
  applyMiddleware(
    [
      middleware.handleCors,
      middleware.handleBodyRequestParsing,
      middleware.handleCompression,
    ],
    router
  );

  const typedPool = pool as unknown as Pool;
  const routes: Route[] = [
    { path: "/status", method: "get", handler: getStatus },
    { path: "/v2/bestblock", method: "get", handler: bestBlock(typedPool) },
    {
      path: "/v2/addresses/filterUsed",
      method: "post",
      handler: filterUsedAddresses(typedPool),
    },
    {
      path: "/txs/utxoForAddresses",
      method: "post",
      handler: utxoForAddresses(typedPool),
    },
    {
      path: "/txs/utxoSumForAddresses",
      method: "post",
      handler: utxoSumForAddresses(typedPool),
    },
    {
      path: "/v2/txs/history",
      method: "post",
      handler: txHistory(pool),
    },
    {
      path: "/account/state",
      method: "post",
      handler: handleGetAccountState(typedPool),
    },
    { path: "/pool/info", method: "post", handler: handlePoolInfo(typedPool) },
    {
      path: "/multiAsset/metadata",
      method: "post",
      handler: handleGetMultiAssetTxMintMetadata(typedPool),
    },
    { path: "/txs/signed", method: "post", handler: signedTxContractHandler },
  ];

  applyRoutes(routes, router);
  router.use(middleware.errorHandler);
  return router;
};

const startContractServer = async (
  signedTxContractHandler: SignedTxContractHandler = directSignedTxContractHandler,
  pool: WalletContractPool = new WalletContractPool()
): Promise<{ server: http.Server; client: AxiosInstance }> => {
  const server = http.createServer(
    createContractRouter(pool, signedTxContractHandler)
  );

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address() as AddressInfo;
  const client = axios.create({
    baseURL: `http://127.0.0.1:${address.port}`,
    validateStatus: () => true,
  });

  return { server, client };
};

const closeContractServer = async (server: http.Server): Promise<void> => {
  if (!server.listening) return;

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
};

describe("wallet endpoint contracts", function () {
  let server: http.Server;
  let client: AxiosInstance;
  const originalAxiosGet = axios.get;

  before(async () => {
    const contractServer = await startContractServer();
    server = contractServer.server;
    client = contractServer.client;
  });

  after(async () => {
    await closeContractServer(server);
  });

  afterEach(() => {
    axios.get = originalAxiosGet;
  });

  it("keeps status and best block response shapes stable", async () => {
    const status = await client.get("/status");
    expect(status.status).to.equal(200);
    expect(status.data).to.include({
      isServerOk: true,
      isMaintenance: false,
      isQueueOnline: false,
    });
    expect(status.data.serverTime).to.be.a("number");

    const bestBlockResponse = await client.get("/v2/bestblock");
    expect(bestBlockResponse.status).to.equal(200);
    expect(bestBlockResponse.data).to.deep.equal({
      epoch: 42,
      slot: 123,
      globalSlot: 456789,
      hash: fixtures.blockHash,
      height: 987654,
    });
  });

  it("keeps address discovery and UTxO response shapes stable", async () => {
    const filterUsed = await client.post("/v2/addresses/filterUsed", {
      addresses: [fixtures.address, fixtures.unusedAddress],
    });
    expect(filterUsed.status).to.equal(200);
    expect(filterUsed.data).to.deep.equal([fixtures.address]);

    const utxos = await client.post("/txs/utxoForAddresses", {
      addresses: [fixtures.address],
    });
    expect(utxos.status).to.equal(200);
    expect(utxos.data).to.deep.equal([
      {
        utxo_id: `${fixtures.txHash}:0`,
        tx_hash: fixtures.txHash,
        tx_index: 0,
        receiver: fixtures.address,
        amount: "1234567",
        dataHash: fixtures.dataHash,
        assets: [
          {
            assetId: fixtures.tokenId,
            policyId: fixtures.policyId,
            name: fixtures.assetNameHex,
            amount: "2",
          },
        ],
        block_num: 987650,
      },
    ]);

    const utxoSum = await client.post("/txs/utxoSumForAddresses", {
      addresses: [fixtures.address],
    });
    expect(utxoSum.status).to.equal(200);
    expect(utxoSum.data).to.deep.equal({
      sum: "1234567",
      tokensBalance: [
        {
          amount: "2",
          assetId: fixtures.tokenId,
        },
      ],
    });
  });

  it("keeps transaction history response shape stable", async () => {
    const history = await client.post("/v2/txs/history", {
      addresses: [fixtures.address],
      untilBlock: fixtures.blockHash,
      limit: 1,
    });

    expect(history.status).to.equal(200);
    expect(history.data).to.have.lengthOf(1);
    expect(history.data[0]).to.include({
      hash: fixtures.txHash,
      fee: "177381",
      metadata: null,
      valid_contract: true,
      script_size: 0,
      type: "shelley",
      tx_ordinal: 1,
      tx_state: "Successful",
      block_num: 987654,
      block_hash: fixtures.blockHash,
      epoch: 42,
      slot: 123,
    });
    expect(history.data[0]).to.not.have.property("validContract");
    expect(history.data[0]).to.not.have.property("scriptSize");
    expect(history.data[0].inputs[0]).to.include({
      address: fixtures.address,
      amount: "1234567",
      txHash: fixtures.inputTxHash,
      index: 0,
    });
    expect(history.data[0].outputs[0]).to.include({
      address: fixtures.address,
      amount: "1000000",
      dataHash: null,
    });
    expect(history.data[0].outputs[0].assets[0]).to.deep.equal({
      assetId: fixtures.tokenId,
      policyId: fixtures.policyId,
      name: fixtures.assetNameHex,
      amount: "2",
    });
  });

  it("keeps account state, pool info, and token metadata response shapes stable", async () => {
    const accountState = await client.post("/account/state", {
      addresses: [fixtures.stakeAddress, fixtures.missingStakeAddress],
    });
    expect(accountState.status).to.equal(200);
    expect(accountState.data[fixtures.stakeAddress]).to.deep.equal({
      remainingAmount: "3000",
      remainingNonSpendableAmount: "0",
      rewards: "5000",
      withdrawals: "2000",
      poolOperator: null,
      isRewardsOff: true,
    });
    expect(accountState.data[fixtures.missingStakeAddress]).to.equal(null);

    const poolInfo = await client.post("/pool/info", {
      poolIds: [fixtures.poolId],
    });
    expect(poolInfo.status).to.equal(200);
    expect(poolInfo.data).to.deep.equal({ [fixtures.poolId]: null });

    const metadata = await client.post("/multiAsset/metadata", {
      assets: [{ policy: fixtures.policyId, nameHex: fixtures.assetNameHex }],
    });
    expect(metadata.status).to.equal(200);
    expect(metadata.data).to.deep.equal({
      [fixtures.metadataTokenId]: [
        {
          key: "721",
          metadata: fixtures.tokenMetadata,
        },
      ],
    });
  });

  it("keeps pool history available when SMASH metadata lookup is unavailable", async () => {
    axios.get = (async () => {
      throw new Error("SMASH unavailable");
    }) as typeof axios.get;

    const pool = new WalletContractPool({
      poolMetadataHash: "0".repeat(64),
      poolHistoryRows: [
        {
          epoch_no: 221,
          epoch_slot_no: 344193,
          tx_index: 1,
          certIndex: 2,
          jsonCert: {
            jsType: "PoolRetirement",
            certIndex: 2,
            poolHashKey: fixtures.poolId,
            epoch: 300,
          },
        },
      ],
    });
    const fallback = await startContractServer(
      directSignedTxContractHandler,
      pool
    );

    try {
      const poolInfo = await fallback.client.post("/pool/info", {
        poolIds: [fixtures.poolId],
      });

      expect(poolInfo.status).to.equal(200);
      expect(poolInfo.data).to.deep.equal({
        [fixtures.poolId]: {
          info: {},
          history: [
            {
              epoch: 221,
              slot: 344193,
              tx_ordinal: 1,
              cert_ordinal: 2,
              payload: {
                kind: "PoolRetirement",
                certIndex: 2,
                poolKeyHash: fixtures.poolId,
                epoch: 300,
              },
            },
          ],
        },
      });
    } finally {
      await closeContractServer(fallback.server);
    }
  });

  it("keeps signed transaction success and malformed request behavior stable", async () => {
    const accepted = await client.post("/txs/signed", {
      signedTx: Buffer.from("contract tx").toString("base64"),
    });
    expect(accepted.status).to.equal(200);
    expect(accepted.data).to.deep.equal([]);

    const missingSignedTx = await client.post("/txs/signed", {});
    expect(missingSignedTx.status).to.equal(500);
    expect(missingSignedTx.data).to.deep.equal({
      error: { code: "INVALID_REQUEST" },
    });

    const malformedHistory = await client.post("/v2/txs/history", {
      addresses: [fixtures.address],
    });
    expect(malformedHistory.status).to.equal(500);
    expect(malformedHistory.data).to.deep.equal({
      error: { code: "INTERNAL_SERVER_ERROR" },
    });
  });

  it("keeps queued signed transaction success response shape stable", async () => {
    const queued = await startContractServer(queuedSignedTxContractHandler);

    try {
      const accepted = await queued.client.post("/txs/signed", {
        signedTx: Buffer.from("queued contract tx").toString("base64"),
      });

      expect(accepted.status).to.equal(200);
      expect(accepted.data).to.deep.equal({ txId: fixtures.txHash });
    } finally {
      await closeContractServer(queued.server);
    }
  });
});
