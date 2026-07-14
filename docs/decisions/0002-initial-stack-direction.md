# ADR 0002: Initial implementation direction

- **Status:** Accepted for the research prototype; UI and deployment adapters deferred
- **Date:** 2026-07-11
- **Accepted:** 2026-07-12

## Context

When this ADR was proposed, the product was unknown and expected to become a long-lived full-stack web application. The owner is highly experienced in backend systems, AWS, payments, distributed systems, and operations; frontend architecture and modern web deployment are the main learning areas. Discovery later selected a personal trading-strategy laboratory whose first slice does not need a web surface.

Choosing a full stack now would create momentum but risks optimizing for an example rather than a validated problem.

## Decision

Product discovery selected a personal trading-strategy laboratory whose first useful workflow needs deterministic calculations and local files, but not a browser, database, authentication, or hosted scheduler. Start with:

- a dependency-light TypeScript modular monolith on Node.js;
- framework-independent strategy, simulation, and risk modules;
- a local CLI as the first adapter;
- CSV market data as an explicit replaceable adapter;
- no broker adapter, database, web UI, or deployed scheduler in the first slice; and
- Node's test runner plus strict TypeScript checks for the initial quality gate.

Next.js/React remains the leading option when a review dashboard becomes useful. PostgreSQL is deferred until durable shared state or an audit service is justified. The job/scheduler deployment choice remains open because reliable market calendars, secret isolation, retries, and kill-switch behavior matter more than fitting the worker into the web host.

## Why the adapters remain deferred

The following answers could change the choice:

- Market-data licensing and corporate-action handling are not selected.
- Robinhood's agent/account privacy boundary and order semantics need a dedicated threat model.
- A reliable scheduled worker may favor a runtime separate from a future web UI.
- Persistence is unnecessary until paper runs or audit records must survive across machines.
- A dashboard should follow a proven review workflow rather than define it prematurely.

## Rejected for now

- Microservices: no scale, isolation, or team boundary justifies the cost.
- Kubernetes: no workload or operating constraint justifies the control plane.
- Multiple databases or event-driven infrastructure: speculative complexity.
- Direct client access to broadly exposed database tables: too easy to make authorization depend on fragile policy configuration for a sensitive product.

## Acceptance evidence

The product brief now names the owner as first user, defines a local paper-only workflow, excludes personal/broker data, prioritizes deterministic correctness, caps future live risk at $100, and sets an operational evidence gate. See [ADR 0003](0003-trading-automation-safety-boundary.md) for the safety boundary.
