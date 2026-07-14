# Deployment mental model

A production web application is a chain of independently replaceable responsibilities. "Hosting" is an overloaded word for one or more parts of that chain.

## Request path

```text
User enters a domain
  -> DNS resolves the name
  -> TLS proves the service identity and encrypts traffic
  -> CDN or edge network routes/caches the request
  -> static asset or application runtime handles it
  -> application calls data and external services
  -> logs, metrics, traces, and errors describe the result
```

The browser may make later API requests that traverse a similar path. Each arrow is a latency, failure, security, ownership, and cost boundary.

## Responsibilities by layer

| Layer | Responsibility | Typical failure |
| --- | --- | --- |
| Registrar | Lease the domain name | Expiry or account takeover |
| DNS | Map names to service endpoints | Bad record, slow propagation |
| TLS | Authenticate and encrypt | Expired/misissued certificate |
| CDN/edge | Cache and route near users | Stale cache or regional issue |
| Build system | Turn source into deployable artifacts | Dependency/build failure |
| App runtime | Execute request-time code | Crash, timeout, saturation |
| Database | Durable state and constraints | Bad migration, connection exhaustion |
| Object storage | Durable files/blobs | Public exposure, lifecycle error |
| Identity | Authenticate users and issue sessions | Token/session compromise |
| Observability | Explain behavior after deployment | Missing or sensitive telemetry |

A company can sell several layers. Buying a domain from GoDaddy does not choose the application runtime. Connecting that domain to Vercel does not require the database to be on Vercel. Using Supabase Postgres does not require Supabase Auth or direct browser data access.

## What Vercel provides

For a Git-connected web project, Vercel can build each commit, produce an immutable deployment with a unique URL, serve static assets through its delivery network, run supported server-side workloads, manage environment-specific configuration, and point production domains at a chosen deployment.

The valuable initial workflow is:

```text
feature branch -> pull request -> preview deployment -> tests/review -> production -> smoke test/log scan
```

This is materially different from traditional shared web hosting, where you may upload mutable files into one long-lived server directory. The abstraction is convenient, but it has constraints: runtime duration, memory, regions, cold starts, background work, connection behavior, and platform pricing. Verify current limits before designing around them.

## What Supabase provides

A Supabase project can bundle a dedicated Postgres database, authentication, generated data APIs, file storage, realtime features, and functions. The bundle reduces integration work, but those products have distinct trust boundaries.

Important implications:

- Postgres remains the durable source of truth; schema migrations and constraints still matter.
- Browser-accessible data APIs make grants and row-level security part of the application authorization model.
- A public/publishable browser key identifies the project but is not authorization by itself.
- Privileged service keys belong only in trusted server environments.
- Authenticated means "we know the identity"; authorization still decides which rows and actions that identity owns.

Supabase should be selected because we need enough of the bundle, not because every web application automatically needs it.

## Environments are separate systems

Maintain at least these logical environments once deployment starts:

- **Local:** rapid development, synthetic data, disposable dependencies.
- **Preview:** production-shaped deployment for a branch or pull request; no production secrets or data.
- **Production:** real users and durable data; tightly controlled changes and access.

Configuration belongs to an environment, not a developer's source tree. Commit `.env.example` with names and safe explanations; never commit actual secrets. Preview and production databases must not casually share writable data.

## Serverless and managed-platform traps

- The filesystem may be ephemeral; durable files need object storage.
- Instances may start and stop at any time; in-memory state is not authoritative.
- Many short-lived instances can overwhelm a database; use supported pooling and bounded concurrency.
- A request timeout is not a job scheduler. Long-running or retryable work may require a queue or workflow system, but only after the workload exists.
- Deploying application code and migrating a database are not one atomic operation. Prefer backward-compatible expand/migrate/contract changes.
- Rollback of code does not automatically roll back data. Destructive schema changes require a separate recovery strategy.

## Release evidence

A successful deployment means only that an artifact was built and placed somewhere. A successful release additionally proves:

1. The expected commit and configuration were deployed.
2. Migrations completed safely.
3. Health and critical smoke checks pass.
4. Error logs and key service signals are clean.
5. A rollback or forward-fix path exists.

## Portability rule

Keep domain logic and use cases independent of Vercel and Supabase. Allow platform-specific adapters at the edges when they save meaningful work. Portability does not mean avoiding every vendor feature; it means knowing where the coupling lives and what evidence would justify replacing it.

## Further reading

- [Vercel deployment overview](https://vercel.com/docs/deployments/overview)
- [Vercel projects and environments](https://vercel.com/docs/projects)
- [Supabase platform overview](https://supabase.com/docs/guides/platform)
- [Supabase Auth architecture](https://supabase.com/docs/guides/auth/architecture)
