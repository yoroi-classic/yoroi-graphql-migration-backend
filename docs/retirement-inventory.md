# GraphQL migration backend retirement inventory

This document is the shutdown gate for
[`yoroi-graphql-migration-backend#43`](https://github.com/yoroi-classic/yoroi-graphql-migration-backend/issues/43).
It records the routes implemented by this repository, the known extension and
mobile callers, and the replacement or removal decision. It does not authorize
a shutdown.

## Evidence baseline

The inventory was refreshed on 2026-07-16 from:

- this repository's route registration at `61539de40b679720338b8a49463d76c89383f1b4`;
- `yoroi-frontend` extension callers at
  `7f5ef8d52833bdff9e837be89da1e41ea1943159`;
- `yoroi` mobile callers at
  `30c1526cea9a98c3415a8d7e680333760ff2885b`;
- `cardano-wallet-backend` OpenAPI at
  `443ad4a5830950e96910efce92f15fb3f53f1ee6`.

Client paths below include the production reverse-proxy `/api` prefix where the
client supplies it. The Express application registers the corresponding path
without that prefix.

Statuses:

- **covered**: a shipped `/v1` operation can replace the capability;
- **client rewrite**: `/v1` has the intended capability, but the caller still
  depends on the legacy data model;
- **backend gap**: the required `/v1` contract is tracked but not yet usable;
- **drop**: do not reproduce this product/business-specific behavior;
- **traffic proof**: no audited client reference was found; production traffic
  must prove that no other caller depends on it.

## Known live client route families

| Legacy route family                                                   | Known caller                                                              | `/v1` replacement or decision                                                                                                 | Status and owner                                                                                                                                                                                                           |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /status`, `GET /v2.1/status`                                     | extension and mobile server health                                        | `GET /v1/status`                                                                                                              | **covered**; extension/mobile migration                                                                                                                                                                                    |
| `GET /v2/bestblock`, `GET/POST /v2{.1}/tipStatus`                     | extension tip; mobile sync tip and rollback reference                     | `GET /v1/chain/tip`                                                                                                           | Extension tip is **covered**. Mobile rollback use is a **client rewrite** in [`yoroi#70`](https://github.com/yoroi-classic/yoroi/issues/70).                                                                               |
| `POST /v2{.1}/txs/utxoAtPoint`, `POST /v2{.1}/txs/utxoDiffSincePoint` | mobile wallet synchronization                                             | Refresh authoritative current state through `GET /v1/account/{stakeAddress}/utxos` plus the local pending-transaction overlay | **client rewrite**; [`yoroi#70`](https://github.com/yoroi-classic/yoroi/issues/70). Do not reproduce rollback diffs.                                                                                                       |
| `POST /v2{.1}/addresses/filterUsed`                                   | extension and mobile address discovery                                    | `POST /v1/addresses/filter-used`                                                                                              | Shelley is **covered**. Byron, enterprise, and pointer-address support is a **backend gap** in [`cardano-wallet-backend#90`](https://github.com/yoroi-classic/cardano-wallet-backend/issues/90).                           |
| `POST /txs/utxoForAddresses`, `POST /v2.1/txs/utxoForAddresses`       | extension transfer and hardware-wallet flows                              | Shelley: `GET /v1/account/{stakeAddress}/utxos`; addresses without a stake credential: proposed set-keyed address UTxO read   | **backend gap/client migration**; [`cardano-wallet-backend#90`](https://github.com/yoroi-classic/cardano-wallet-backend/issues/90) and [`yoroi-frontend#60`](https://github.com/yoroi-classic/yoroi-frontend/issues/60).   |
| `POST /v2{.1}/txs/history`                                            | extension and mobile transaction synchronization                          | `GET /v1/account/{stakeAddress}/txs`                                                                                          | Shelley capability is **covered**, client migration remains. Address-keyed history for wallets without stake credentials is a **backend gap** in `cardano-wallet-backend#90`.                                              |
| `POST /v2.1/txs/summaries`, `POST /v2{.1}/txs/get`                    | extension recent-transaction synchronization                              | `GET /v1/account/{stakeAddress}/txs`                                                                                          | **covered by a different sync contract**; migration is owned by `yoroi-frontend#60` and the target contract is recorded in [`cardano-wallet-backend#3`](https://github.com/yoroi-classic/cardano-wallet-backend/issues/3). |
| `GET /txs/io/:tx_hash/o/:index`, `GET /v2.1/txs/io/:tx_hash/o/:index` | extension collateral selection and dApp connector                         | `POST /v1/tx/utxos`                                                                                                           | **covered**, client migration remains under `yoroi-frontend#60`.                                                                                                                                                           |
| `POST /txs/signed`, `POST /v2.1/txs/signed`                           | extension and mobile transaction submission                               | `POST /v1/tx/submit`                                                                                                          | **covered**, client migration remains. Ordered bulk-submit verification is tracked separately in [`yoroi-graphql-migration-backend#5`](https://github.com/yoroi-classic/yoroi-graphql-migration-backend/issues/5).         |
| `POST /tx/status`, `POST /v2.1/tx/status`                             | extension swap confirmation and mobile pending transaction reconciliation | `GET /v1/tx/{txHash}/status`                                                                                                  | **covered**, client migration remains.                                                                                                                                                                                     |
| `POST /account/state` and versioned/deprecated aliases                | extension and mobile account state                                        | `GET /v1/account/{stakeAddress}/state`                                                                                        | **covered** for Shelley; migration remains.                                                                                                                                                                                |
| `POST /account/rewardHistory` and versioned/deprecated aliases        | extension reward graph                                                    | `GET /v1/account/{stakeAddress}/rewards`                                                                                      | **covered**, client migration remains.                                                                                                                                                                                     |
| `POST /pool/info` and versioned/deprecated aliases                    | extension and mobile pool details                                         | `POST /v1/pools/info`                                                                                                         | **covered**, client migration remains.                                                                                                                                                                                     |
| `POST /multiAsset/supply` and `/v2.1` alias                           | extension and mobile native-asset supply                                  | `POST /v1/assets/info`                                                                                                        | **covered**, client migration remains.                                                                                                                                                                                     |
| `POST /multiAsset/metadata` and `/v2.1` alias                         | extension and mobile mint/registry metadata                               | `POST /v1/assets/info`                                                                                                        | **covered**, client migration remains.                                                                                                                                                                                     |
| `GET /v0/catalyst/fundInfo` and `/v2.1` alias                         | extension voting; mobile legacy adapter                                   | No usable `/v1` replacement yet; mobile also has a direct Project Catalyst API adapter                                        | **backend gap or deliberate feature removal**; [`cardano-wallet-backend#71`](https://github.com/yoroi-classic/cardano-wallet-backend/issues/71).                                                                           |
| `GET /price/:fiat/current`, `GET /price/:fiat/:timestamps`            | extension ADA current and historical fiat prices                          | `GET /v1/price/ada` and `GET /v1/price/ada/history`                                                                           | **backend gap**: the paths are published but deliberately return not-implemented until a provider is configured. Track in [`cardano-wallet-backend#6`](https://github.com/yoroi-classic/cardano-wallet-backend/issues/6).  |

## Implemented routes without an audited extension/mobile caller

No reference to the following route families was found in the audited client
trees. This is not evidence that they are unused: older releases, scripts, or
third-party integrations may still call them.

| Route family                                                                                                                  | Retirement decision                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| account registration history (`/getRegistrationHistory`, `/account/registrationHistory`, `/v2.1/account/registrationHistory`) | **traffic proof**; no replacement unless a caller is identified                                                 |
| pool delegation history (`/pool/delegationHistory`, `/v2.1/pool/delegationHistory`)                                           | **traffic proof**; account/pool `/v1` data is not assumed equivalent                                            |
| UTxO sum (`/txs/utxoSumForAddresses`, `/v2.1/txs/utxoSumForAddresses`)                                                        | **traffic proof**; clients should sum exact integer quantities from `/v1` UTxOs                                 |
| whole-transaction I/O (`/txs/io/:tx_hash`, `/v2.1/txs/io/:tx_hash`)                                                           | **traffic proof**; do not infer coverage from output-reference lookup                                           |
| message board and direct message routes                                                                                       | **traffic proof**, then **drop** unless an explicit product owner requests migration                            |
| oracle datapoint and ticker routes                                                                                            | **traffic proof**, then **drop** unless an explicit product owner requests migration                            |
| `/pool/cardanoWallet` and `/v2.1/pool/cardanoWallet`                                                                          | **traffic proof**, then use neutral `GET /v1/pools`; do not preserve curated ranking                            |
| asset mint transaction, NFT validation, and policy-existence routes                                                           | **traffic proof**; map any discovered caller to `POST /v1/assets/info` or open a narrowly scoped backend gap    |
| importer health routes                                                                                                        | operations-only **traffic proof**; replace monitoring with `/health` and `/v1/status` before deployment removal |
| the root WebSocket server                                                                                                     | **traffic proof**; no audited wallet client opens it                                                            |

All `/v2.1` entries that only add camel-case response conversion are aliases of
the same capability and share its decision.

## Related hosted surfaces that this repository does not serve

The client audit also found active legacy-hosted calls outside this Express
application. They do not justify keeping this deployment alive, but they do
block the broader removal of Yoroi/EMURGO infrastructure:

- extension `/tokens/activity/multi/*`, `/dreps/active`,
  `/v2.1/lastBlockBySlot`, and `/v2.1/swap/feesInfo`;
- mobile backend-zero `/wallets*`, `/tx`, token discovery/info/traits/activity
  and history, processed-media invalidation, and curated pool-list calls;
- processed NFT media and remote configuration used by both clients.

Their replacement or drop decisions are recorded in
[`cardano-wallet-backend#71`](https://github.com/yoroi-classic/cardano-wallet-backend/issues/71).
In particular, swap fees, wallet registration, partner payout links, and
curated pool rankings are drop decisions rather than `/v1` contracts.

## Shutdown checklist

Every box requires evidence attached to issue #43 for the exact production
deployment and current released client versions.

- [ ] Extension migration issue
      [`yoroi-frontend#60`](https://github.com/yoroi-classic/yoroi-frontend/issues/60)
      is complete, with no GraphQL/legacy fallback defaults in a release build.
- [ ] Mobile migration issue
      [`yoroi#55`](https://github.com/yoroi-classic/yoroi/issues/55) and sync
      rewrite [`yoroi#70`](https://github.com/yoroi-classic/yoroi/issues/70)
      are complete for Shelley wallets.
- [ ] Byron and other no-stake-credential wallets are served through
      `cardano-wallet-backend#90`, or a human-approved support decision is
      recorded.
- [ ] Every **backend gap** above is shipped, or the affected feature has a
      human-approved removal decision.
- [ ] Route-normalized traffic metrics from
      [`yoroi-graphql-migration-backend#44`](https://github.com/yoroi-classic/yoroi-graphql-migration-backend/issues/44)
      cover every route family in this document without recording addresses,
      stake keys, transaction hashes, or request bodies.
- [ ] Required-client traffic is zero for the human-approved observation
      period, split by client version so old supported releases are visible.
- [ ] Unknown traffic is identified by owner and migrated, or explicitly
      accepted for removal.
- [ ] Transaction submission queues are drained and the submission mode is
      disabled before the HTTP deployment.
- [ ] Database, coin-price data, and operational logs have an approved
      retention/export and deletion record.
- [ ] Deployment manifests, DNS, TLS, secrets, queues, Sentry/monitoring, and
      CI release credentials are removed in an independently reviewed change.
- [ ] README/archive guidance names `cardano-wallet-backend` and the last
      supported client versions.
- [ ] A human approver explicitly authorizes shutdown and repository archive
      after reviewing the exact evidence above.

Do not merge a shutdown change, remove the deployment, or archive the
repository based only on this inventory.
