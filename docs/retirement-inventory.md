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

## Repository operational-surface audit

The following facts are derivable from this repository at the pinned
`61539de40b679720338b8a49463d76c89383f1b4` baseline. They describe code and
configuration entry points, not the production topology. In particular, the
absence of infrastructure here is not evidence that a production resource
does not exist.

| Surface                    | Repository evidence                                                                                                                                                                                                                                                                                                           | What must be established outside this repository before removal                                                                                                                                                                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime image              | `Dockerfile` is the only deployable artifact definition. Its final image starts the HTTP/WebSocket server and an Alpine cron daemon in one container. It declares port `8080`, while `config/default.ts` defaults `PORT` to `8082`.                                                                                           | Record every deployed image digest, runtime `PORT`, network/environment, replica set, orchestrator object, and owning repository. Do not infer production port or topology from either default.                                                                                             |
| Process manager            | `pm2.yaml` is an alternative clustered server definition (`instances: max`).                                                                                                                                                                                                                                                  | Record whether any environment uses PM2, the container command, or another supervisor, and its exact stop/rollback procedure.                                                                                                                                                               |
| Scheduled work             | The image schedules the coin-price fetcher every five minutes and the S3-to-Postgres poller every minute. The fetcher exits without work unless `RUN_FETCHER`/`run_fetcher` is `true`. A separate price monitor command exists but is not scheduled by this Dockerfile.                                                       | Identify every real scheduler, replica, and independently deployed fetcher, poller, or monitor. Prove each producer is stopped once; a multi-replica image may otherwise run duplicate cron jobs.                                                                                           |
| HTTP and WebSocket ingress | `src/index.ts` serves Express routes and a root WebSocket on the same HTTP server. No reverse-proxy, load-balancer, Kubernetes, Helm, Terraform, Pulumi, Compose, DNS, or TLS configuration is present here.                                                                                                                  | Inventory ingress/load balancers, WebSocket routing, domains, DNS records and TTLs, certificates, health checks, WAF/rate limits, and their owning accounts/repos. Attach provider evidence rather than guessing names.                                                                     |
| Database                   | The service uses PostgreSQL through `POSTGRES_*`. Startup creates or replaces Cardano transaction views/functions. The price poller creates/updates its own ticker data in the configured database. The configured database may also be the shared db-sync database.                                                          | Identify the exact clusters/schemas, backup and retention policy, app-owned tables/views/functions, and other consumers. Never delete a whole database or shared db-sync objects as part of an application shutdown. Use a separately reviewed cleanup migration after ownership is proven. |
| Transaction submission     | Runtime selects direct submission through `TX_SUBMISSION_ENDPOINT`, or queue mode through `USE_SIGNED_TX_QUEUE=true` and `SIGNED_TX_QUEUE_ENDPOINT`. Queue submission and status are external HTTP calls; no queue implementation or queue manifest lives here.                                                               | Record the mode per Cardano network, upstream owner, backlog/in-flight/retry/dead-letter evidence, and whether the queue is shared. Never discard signed transactions or delete a shared queue.                                                                                             |
| Price data and signing     | The fetcher reads provider keys, `COIN_PRICE_PRIV_KEY`/`COIN_PRICE_PUB_KEY`, `PRICE_PROVIDERS`, and S3 credentials/bucket settings. The poller reads the same S3 dataset into PostgreSQL.                                                                                                                                     | Identify bucket/versioning/lifecycle, provider accounts, signing-key custodian, key-destruction requirements, and data retention. Do not paste signing material or API-key values into issue #43.                                                                                           |
| AWS integration            | NFT validation constructs an AWS Lambda client from `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, and a configured function name. No Lambda or IAM definition is present here.                                                                                                                                  | Identify the function, aliases, IAM principals/policies, logs, and other callers. Remove only resources proven exclusive to this service.                                                                                                                                                   |
| Other upstreams            | Runtime configuration includes SMASH, Catalyst fund-info, and direct/queued transaction endpoints. The price fetcher calls configured market-data providers and an exchange-rate provider.                                                                                                                                    | Record endpoint owners, credentials, billing/subscription state, and other consumers before revoking access or deleting an account.                                                                                                                                                         |
| Monitoring and logs        | The server initializes Sentry from `DSNExpress`, exposes status/importer-health routes, and logs to stdout/stderr. The price tools use Bunyan and include a separately invocable monitor. No alert, dashboard, log-retention, or Sentry-project manifest is present here.                                                     | Identify Sentry projects, dashboards, alerts, log sinks/indexes, uptime probes, on-call ownership, and retention/export requirements. Keep shutdown monitoring until the observation and rollback windows close.                                                                            |
| GitHub automation          | `.github/workflows` contains PR checks, dependency review, and SonarQube analysis. PR CI builds a local image but does not publish it. No image-publish, release, deployment, rollback, or environment workflow is present. The only repository secrets referenced by these workflows are `SONAR_TOKEN` and `SONAR_HOST_URL`. | Locate any external CI/CD, registry, release branch automation, deploy keys/tokens, GitHub environments, and manual runbooks. A clean audit of this repository alone cannot prove that no release path exists.                                                                              |

### Required production evidence record

Create one row per production network/environment and per concrete resource in
issue #43. A link to an owning inventory or change record is acceptable; an
unsupported assertion is not.

| Evidence field              | Required value                                                                                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Resource                    | Provider type and exact provider identifier; for deployments include image digest and runtime entry point.                                                                                       |
| Network and scope           | Cardano network, region/account/project, public domains, and whether the resource is shared.                                                                                                     |
| Owner                       | Human/operations owner and owning repository/team.                                                                                                                                               |
| Current state               | Read-only provider evidence with collection time, including replicas/jobs and configuration **names**, never secret values.                                                                      |
| Traffic or backlog evidence | Privacy-safe query/export link, time range, client-version grouping, and result. Do not record addresses, stake keys, transaction hashes, signed transaction CBOR, mnemonics, or request bodies. |
| Retention obligation        | Data/log/key retention or destruction decision, approver, expiry, and evidence location.                                                                                                         |
| Removal change              | Independently reviewed PR/change ticket and execution window.                                                                                                                                    |
| Rollback                    | Trigger, exact artifact/config to restore, operator, and deadline before irreversible deletion.                                                                                                  |
| Approval                    | Named human approver and timestamp. Empty means not authorized.                                                                                                                                  |

At minimum the evidence record must cover deployment/orchestrator resources,
image registry artifacts, ingress and WebSocket routing, DNS, TLS, PostgreSQL,
transaction submission and any queue, price S3 data and schedules, Lambda/IAM,
provider accounts, Sentry/logging/alerts, runtime and CI/CD credentials, and any
release automation outside this repository.

## Ordered shutdown and removal runbook

This runbook is a sequence of gates, not authorization to execute them. Each
step must link its evidence and operator record in issue #43. Stop at the first
failed gate.

### 1. Freeze the retirement candidate

- [ ] Record the exact deployment resources, image digests, entry points,
      non-secret configuration names, Cardano network, domains, and client
      releases/builds in scope.
- [ ] Record the independently reviewed rollback change that restores those
      same artifacts and network-specific settings.
- [ ] Confirm all client migration, Byron/no-stake support, backend-gap, and
      feature-removal gates in the shutdown checklist below.
- [ ] Confirm privacy-safe route and WebSocket traffic evidence covers the
      human-approved observation period and supported client versions. Zero
      audited source references is not production traffic proof.
- [ ] Confirm backups, retention, legal/data obligations, and the rollback
      deadline before changing traffic or credentials.

### 2. Quiesce wallet writes reversibly

- [ ] During an approved window, stop accepting **new** legacy transaction
      submissions using the owning ingress/deployment mechanism. Keep the
      change reversible and scoped to the correct Cardano network.
- [ ] In queue mode, prove all accepted items reached a documented terminal
      state and that pending, in-flight, retry, and dead-letter counts are zero.
      Record queue ownership before changing it. In direct mode, prove there
      are no in-flight submission requests; this repository has no local
      durable queue to inspect.
- [ ] Confirm no signed transaction body, CBOR, transaction hash, wallet
      address, key, or mnemonic entered the shutdown evidence or logs.
- [ ] Observe the approved write-freeze interval. Any supported wallet write
      or unexplained backlog aborts the shutdown and triggers rollback.

### 3. Stop producers, then serving processes

- [ ] Stop every coin-price fetcher, poller, and separately deployed monitor,
      and verify no new S3 objects or price rows are written. Account for the
      Docker image's bundled cron daemon and every replica before declaring
      scheduled work stopped.
- [ ] Gracefully stop HTTP and root-WebSocket serving processes after the
      transaction gate is satisfied. Record active connection/request counts
      before and after. Do not delete the database, queue, bucket, or keys in
      this reversible phase.
- [ ] Verify `cardano-wallet-backend` health and wallet-critical behavior on
      each affected network: address discovery, exact UTxO/token quantities,
      transaction history/state, submission, and pending-status reconciliation.
- [ ] Keep ingress rollback, logs, Sentry, traffic dashboards, alerts, and the
      known-good image available for the approved rollback window.

### 4. Validate silence and close rollback

- [ ] Prove no required HTTP route, WebSocket, scheduled writer, or transaction
      queue activity occurred for the approved post-stop period. Separate
      operations probes from client traffic and investigate unknown callers.
- [ ] Confirm supported clients show no legacy-backend failures and that no
      wallet state, UTxO, exact amount, network selection, or transaction
      submission invariant regressed.
- [ ] Have the named human/operations approvers explicitly close the rollback
      window. Before this approval, perform rollback rather than irreversible
      deletion if a trigger fires.

### 5. Remove infrastructure in owning systems

- [ ] Remove deployment, scheduler, service, ingress/load-balancer, and
      WebSocket resources through independently reviewed changes in their
      owning repositories/accounts. This repository contains none of those
      production manifests, so links to external changes are mandatory.
- [ ] Remove DNS only after recording current records/TTLs and completing the
      approved transition/observation interval; then retire TLS certificates
      and validation records proven exclusive to these names.
- [ ] Apply the approved database/export plan. Drop only app-owned
      tables/views/functions with a reviewed migration; preserve shared db-sync
      data and backups for their required retention period.
- [ ] Apply the approved S3, Lambda/IAM, provider-account, log, Sentry, and
      monitoring retention/removal plans. Shared resources remain until every
      other owner signs off.
- [ ] After the rollback deadline, revoke or rotate runtime identities,
      transaction/price provider credentials, S3/Lambda credentials, Sentry
      DSN, and the coin-price signing key according to the recorded custody
      plan. Record destruction/revocation without publishing values.
- [ ] Remove external release/deploy automation and registry credentials, then
      expire image artifacts according to the approved retention policy. Do
      not treat the absence of a workflow here as proof this is complete.

### 6. Archive only after evidence review

- [ ] Replace the README with final archive/migration guidance naming
      `cardano-wallet-backend`, supported client versions, shutdown date, and
      retained-data contact.
- [ ] Attach the completed evidence table, execution records, and residual
      ownership decisions to issue #43.
- [ ] Obtain Crypto2099/human operations approval for the shutdown evidence and
      a separate explicit approval to archive the repository. Repository
      archive is the last step and is not authorized by merging this document.

### Rollback triggers

Rollback before irreversible removal if any supported client still calls a
required route, a transaction remains pending/in-flight/retrying/dead-lettered,
unknown traffic cannot be attributed, the replacement serves the wrong Cardano
network or inconsistent wallet state, exact Lovelace/token quantities differ,
transaction submission/status reconciliation fails, or required monitoring is
lost. Restore the recorded image/config and ingress through the approved
rollback change, then reopen the failed gate in issue #43. Do not improvise a
new GraphQL product contract as a rollback.

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
