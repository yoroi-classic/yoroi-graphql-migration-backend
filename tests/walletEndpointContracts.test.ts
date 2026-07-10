import axios from "axios";
import { expect } from "chai";
import { Request, Response } from "express";
import { Pool } from "pg";

import { handleGetAccountState } from "../src/services/accountState";
import { handlePoolInfo } from "../src/services/poolInfo";
import { handleSignedTx } from "../src/services/signedTransaction";
import { utxoForAddresses } from "../src/services/utxoForAddress";
import { BlockEra, TransactionFrag } from "../src/Transactions/types";
import { mapTransactionFragToResponse } from "../src/utils/mappers";

interface QueryCall {
  queryText: string;
  values?: any[];
}

interface MockResponse {
  statusCode: number;
  body?: any;
  status: (statusCode: number) => MockResponse;
  send: (body?: any) => MockResponse;
}

const createPool = (rowsByCall: any[][]) => {
  const calls: QueryCall[] = [];
  const pool = {
    query: async (queryText: string, values?: any[]) => {
      calls.push({ queryText, values });
      return { rows: rowsByCall.shift() || [], rowCount: 0 };
    },
  };

  return { pool: pool as unknown as Pool, calls };
};

const createResponse = (): MockResponse => {
  const response: MockResponse = {
    statusCode: 200,
    status(statusCode: number) {
      response.statusCode = statusCode;
      return response;
    },
    send(body?: any) {
      response.body = body;
      return response;
    },
  };

  return response;
};

const requestWithBody = (body: any): Request => ({ body } as Request);

describe("wallet endpoint contracts without live backend dependencies", () => {
  const originalAxiosGet = axios.get;

  afterEach(() => {
    axios.get = originalAxiosGet;
  });

  it("preserves the account state response map and null missing-account entries", async () => {
    const fundedStakeAddress =
      "e15e8600926ab1856e52bf2f2960def3bc59f7ffa5c4162a578ddd264b";
    const missingStakeAddress =
      "e1b48e1d28ae9d4ea604ec265551d177cd2b5ccb18818c7f1b70cfd42a";
    const { pool, calls } = createPool([
      [
        {
          stakeAddress: Buffer.from(fundedStakeAddress, "hex"),
          remainingAmount: "1234567",
          remainingNonSpendableAmount: "0",
          reward: "2234567",
          withdrawal: "1000000",
        },
      ],
    ]);
    const response = createResponse();

    await handleGetAccountState(pool)(
      requestWithBody({ addresses: [fundedStakeAddress, missingStakeAddress] }),
      response as unknown as Response
    );

    expect(calls[0].values).to.deep.equal([
      [fundedStakeAddress, missingStakeAddress],
    ]);
    expect(response.body).to.deep.equal({
      [fundedStakeAddress]: {
        remainingAmount: "1234567",
        remainingNonSpendableAmount: "0",
        rewards: "2234567",
        withdrawals: "1000000",
        poolOperator: null,
        isRewardsOff: true,
      },
      [missingStakeAddress]: null,
    });
  });

  it("preserves the UTxO response fields used by wallet restore and sync", async () => {
    const address =
      "DdzFFzCqrht4wFnWC5TJA5UUVE54JC9xZWq589iKyCrWa6hek3KKevyaXzQt6FsdunbkZGzBFQhwZi1MDpijwRoC7kj1MkEPh2Uu5Ssz";
    const txHash =
      "5d7b1cc04e35f5d5db9c7c5e3b2dd42b3ebd1827dd5e58871ed2527d4f9327f5";
    const { pool, calls } = createPool([
      [
        {
          hash: txHash,
          index: 2,
          address,
          value: "42000000",
          data_hash: "datum-hash",
          assets: [
            {
              f1: "a".repeat(56),
              f2: "746f6b656e",
              f3: "7",
            },
          ],
          blockNumber: 456789,
        },
      ],
    ]);
    const response = createResponse();

    await utxoForAddresses(pool)(
      requestWithBody({ addresses: [address] }),
      response as unknown as Response
    );

    expect(calls[0].values).to.deep.equal([[address], []]);
    expect(response.body).to.deep.equal([
      {
        utxo_id: `${txHash}:2`,
        tx_hash: txHash,
        tx_index: 2,
        receiver: address,
        amount: "42000000",
        dataHash: "datum-hash",
        assets: [
          {
            assetId: `${"a".repeat(56)}.746f6b656e`,
            policyId: "a".repeat(56),
            name: "746f6b656e",
            amount: "7",
          },
        ],
        block_num: 456789,
      },
    ]);
  });

  it("keeps pool info usable when optional SMASH metadata is unavailable", async () => {
    const poolId = "b62ecc8ce7e46c4443b63b91fffaeb19f869d191a7d2381087aaa768";
    axios.get = (async () => {
      throw new Error("SMASH unavailable");
    }) as typeof axios.get;
    const { pool } = createPool([
      [{ metadata_hash: "0".repeat(64) }],
      [
        {
          epoch_no: 221,
          epoch_slot_no: 344193,
          tx_index: 1,
          certIndex: 2,
          jsonCert: {
            jsType: "PoolRetirement",
            certIndex: 2,
            poolHashKey: poolId,
            epoch: 300,
          },
        },
      ],
    ]);
    const response = createResponse();

    await handlePoolInfo(pool)(
      requestWithBody({ poolIds: [poolId] }),
      response as unknown as Response
    );

    expect(response.body).to.deep.equal({
      [poolId]: {
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
              poolKeyHash: poolId,
              epoch: 300,
            },
          },
        ],
      },
    });
  });

  it("preserves the transaction history response casing and wallet fields", () => {
    const includedAt = new Date("2026-01-02T03:04:05.000Z");
    const transaction: TransactionFrag = {
      hash: "8".repeat(64),
      fee: "170000",
      validContract: true,
      scriptSize: 12,
      ttl: "2147483647",
      blockEra: BlockEra.Shelley,
      metadata: null,
      block: {
        number: 123,
        hash: "9".repeat(64),
        epochNo: 42,
        slotNo: 999,
      },
      includedAt,
      inputs: [
        {
          address: "addr-input",
          amount: "1000000",
          id: `${"7".repeat(64)}0`,
          index: 0,
          txHash: "7".repeat(64),
          assets: [],
        },
      ],
      collateralInputs: [],
      outputs: [
        {
          address: "addr-output",
          amount: "830000",
          dataHash: null,
          assets: [],
        },
      ],
      collateralOutputs: [],
      txIndex: 3,
      withdrawals: [],
      certificates: [],
    };

    const response = mapTransactionFragToResponse(transaction);

    expect(response).to.deep.include({
      hash: "8".repeat(64),
      fee: "170000",
      valid_contract: true,
      script_size: 12,
      type: "shelley",
      tx_ordinal: 3,
      tx_state: "Successful",
      last_update: includedAt,
      block_num: 123,
      block_hash: "9".repeat(64),
      time: includedAt,
      epoch: 42,
      slot: 999,
    });
    expect(response).to.have.property("collateral_inputs").that.deep.equals([]);
    expect(response).to.not.have.property("validContract");
    expect(response).to.not.have.property("scriptSize");
  });

  it("rejects malformed signed transaction submissions before network calls", async () => {
    const response = createResponse();

    try {
      await handleSignedTx(
        requestWithBody({}),
        response as unknown as Response
      );
      expect.fail("expected handleSignedTx to reject a missing signedTx");
    } catch (error: any) {
      expect(error.message).to.equal("No signedTx in body");
      expect(response.body).to.equal(undefined);
    }
  });
});
