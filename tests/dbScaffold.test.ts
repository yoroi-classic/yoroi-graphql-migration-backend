import config from "config";
import { expect } from "chai";
import pg from "pg";
import type { PoolConfig } from "pg";

const { Pool } = pg;

const asPort = (value: string | number): number => {
  const port = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid Postgres port: ${value}`);
  }
  return port;
};

const databaseConfig = (): PoolConfig => ({
  user: config.get<string>("db.user"),
  host: config.get<string>("db.host"),
  database: config.get<string>("db.database"),
  password: config.get<string>("db.password"),
  port: asPort(config.get<string | number>("db.port")),
});

describe("database test scaffold", function () {
  this.timeout(20000);

  it("connects to Postgres and runs an isolated fixture transaction", async () => {
    const pool = new Pool(databaseConfig());
    const client = await pool.connect();
    let transactionStarted = false;

    try {
      await client.query("BEGIN");
      transactionStarted = true;

      await client.query(`
        CREATE TEMP TABLE db_scaffold_fixture (
          id integer PRIMARY KEY,
          label text NOT NULL
        ) ON COMMIT DROP
      `);
      await client.query(
        "INSERT INTO db_scaffold_fixture (id, label) VALUES ($1, $2)",
        [1, "fixture-ok"]
      );

      const result = await client.query<{ label: string }>(
        "SELECT label FROM db_scaffold_fixture WHERE id = $1",
        [1]
      );

      expect(result.rows).to.deep.equal([{ label: "fixture-ok" }]);
    } finally {
      if (transactionStarted) {
        await client.query("ROLLBACK");
      }
      client.release();
      await pool.end();
    }
  });
});
