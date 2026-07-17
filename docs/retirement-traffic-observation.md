# Retirement traffic observation

Issue
[`#44`](https://github.com/yoroi-classic/yoroi-graphql-migration-backend/issues/44)
adds one structured `retirement_route_request` event for every completed HTTP
request and accepted root WebSocket connection. These events exist only to
produce the shutdown evidence required by
[`#43`](https://github.com/yoroi-classic/yoroi-graphql-migration-backend/issues/43).

## Deployment configuration

Set these low-cardinality values on every deployment:

- `RETIREMENT_TRAFFIC_DEPLOYMENT`: the deployment identifier, such as
  `production-eu`;
- `RETIREMENT_TRAFFIC_NETWORK`: the Cardano network, such as `mainnet`.

Missing or invalid values become `unknown`; do not put hostnames, tenant names,
wallet data, or other identifiers in either value. Remove that rollout fallback
through
[`#46`](https://github.com/yoroi-classic/yoroi-graphql-migration-backend/issues/46)
after every production manifest supplies both values.

Each event contains only:

- schema version, deployment, and network;
- HTTP or WebSocket surface;
- method and the normalized Express route template;
- response class (`1xx` through `5xx`);
- caller class (`required_client`, `operations_only`, or `unknown`);
- a recognized client platform and major/minor version band.

The `yoroi-version` header is accepted only when the entire value matches a
known platform and numeric version. Request URLs, path values, query strings,
bodies, cookies, authorization headers, IP addresses, user agents, and the raw
version header are never emitted. Existing error logging also omits request
URLs and bodies, and rejected signed transactions are no longer logged.

## Observation query and dashboard

In the production log system, select:

```text
event = "retirement_route_request" AND schema_version = 1
```

Count events in daily buckets, grouped by:

```text
deployment, network, surface, method, route, response_class,
client_kind, client_platform, client_version_band
```

The retirement dashboard must show:

1. required-client traffic by route and supported client version band;
2. unknown traffic by route;
3. operations-only health traffic;
4. root WebSocket connections;
5. non-`2xx` response classes and any `unknown` deployment or network values.

Keep the raw structured events only for the operations-approved retention
period. The dashboard must not add IP, user-agent, address, transaction, or
request-payload dimensions.

## Evidence attached to the shutdown issue

Before an observation begins, a human approver records on `#43`:

- the included deployment and network values;
- the deployed application revision;
- the supported extension and mobile version bands;
- the observation start, end, and log-retention period;
- the owners responsible for investigating unknown traffic.

At the end, attach the grouped counts and dashboard export to `#43`. Every route
family in `docs/retirement-inventory.md` must be represented, including zero
counts, and unknown traffic must have an owner or explicit removal decision.
Zero traffic alone does not authorize shutdown, deployment removal, or
repository archival.
