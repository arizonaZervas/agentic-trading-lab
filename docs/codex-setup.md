# Codex setup and capability policy

**Last verified:** 2026-07-11 with `codex-cli 0.144.0-alpha.4`

This document separates repository instructions, machine-level capabilities, and product dependencies. They solve different problems and should not be accumulated indiscriminately.

## Verified foundation

- Root `AGENTS.md` is discovered by a fresh ephemeral Codex process.
- The official OpenAI developer-docs MCP is configured globally at `https://developers.openai.com/mcp` and a fresh process successfully called its `search_openai_docs` tool.
- Playwright MCP is configured globally for browser automation.
- codebase-memory-mcp 0.9.0 is installed as an ad-hoc-signed local arm64 binary, configured globally as a stdio MCP server, and set to auto-index repositories while keeping its derived graph artifact out of git. Ad-hoc signing satisfies macOS executable integrity checks but does not establish a trusted publisher identity.
- GitHub integration is installed and enabled; the public canonical remote is [arizonaZervas/agentic-trading-lab](https://github.com/arizonaZervas/agentic-trading-lab).
- The official shadcn/ui project skill is installed in `.agents/skills/shadcn`. Its source lock is recorded in `skills-lock.json`; it becomes project-aware when shadcn creates `components.json`.
- `./scripts/check-foundation.sh` passes locally and is wired into GitHub Actions.

The OpenAI manual-download helper currently fails because the server response lacks the helper's expected integrity header. This does not block official documentation access because the developer-docs MCP was exercised successfully. Do not claim the helper itself works until a later smoke test passes.

## Instruction and tool surfaces

Use the smallest durable surface that matches the need:

| Need | Surface |
| --- | --- |
| One task's outcome or temporary constraint | Prompt/task context |
| Repository conventions, commands, quality bar | `AGENTS.md` |
| Reusable specialist workflow | Skill |
| Live external data or actions | MCP server/app connector |
| Trusted repository configuration | `.codex/config.toml` |
| Cross-repository personal defaults | `~/.codex/config.toml` |
| Mechanical lifecycle enforcement | Hook or CI |

Do not create a skill until a workflow repeats enough to have stable inputs, steps, and evidence. Do not put a behavioral preference in an MCP server, or an external credential in `AGENTS.md`.

## Plugin-budget finding

A fresh Codex smoke test reported that skill descriptions were shortened to fit the skills-context budget. At the time, 19 installed plugins were globally enabled. The run still found the root instructions and used the requested MCP successfully, so this is an efficiency and discoverability warning rather than a functional failure.

### Recommended always-on set for this project

- `github@openai-curated` - issues, pull requests, and repository collaboration.
- `build-web-apps@openai-curated` - full-stack web implementation workflows.
- `browser@openai-bundled` - in-app browser verification.
- `chrome@openai-bundled` - only when existing Chrome login/session state is required.
- `computer-use@openai-bundled` - only for local UI that has no better API or CLI.
- OpenAI developer-docs MCP - current Codex/OpenAI documentation.
- Playwright MCP - deterministic browser automation and regression evidence.

### Enable after the stack or task requires them

- Exactly one primary database platform workflow (`supabase` or `neon-postgres`) after ADR 0002 is decided; keeping both during evaluation is temporarily reasonable.
- Documents, PDF, spreadsheets, presentations, Canva, Google Drive, Notion, Calendar, Linear, Sites, visualization, and template creation only for tasks that use them.

### Project skills

- `shadcn` - official shadcn/ui component, CLI, composition, accessibility, theming, and registry guidance. Installed now because it is part of the proposed frontend path, but it activates from actual project context rather than forcing shadcn into the stack decision.
- `migrate-radix-to-base` - a narrowly triggered companion published by the same official repository. It is relevant only if we later request a Radix-to-Base migration; its presence is not a decision to perform one.

Project skills are versioned with the repository so Codex and human collaborators receive the same workflow. `skills-lock.json` records their upstream source and content hashes.

Plugin changes currently live in the user-level Codex configuration and affect other workspaces. Do not disable them automatically from this repository. Ask the user, make a backup, change the smallest set, restart Codex, and repeat the same smoke test.

## Useful verification commands

```bash
./scripts/check-foundation.sh
codex --version
codex plugin list
codex mcp list
codebase-memory-mcp --version
codebase-memory-mcp cli list_projects
```

## Codebase-memory operating model

codebase-memory-mcp is a local structural index, analogous to a compiler symbol table plus a call/dependency graph. Use it to answer questions such as “what calls this function?”, “where are the routes?”, and “what modules depend on this one?” without repeatedly scanning the entire tree. It does not replace source, git, tests, or runtime evidence.

The machine-level installer added the executable at `$HOME/.local/bin/codebase-memory-mcp`, the global `[mcp_servers.codebase-memory-mcp]` entry, a SessionStart reminder, and `$HOME/.local/bin` to the interactive shell PATH. Automatic indexing is enabled and automatic watching remains enabled. This repository ignores `.codebase-memory/`; its compressed graph is derived from source and should be rebuilt locally rather than reviewed or merged as a binary artifact.

Freshness rules:

1. Prefer graph queries for symbols, callers, relationships, routes, and architecture.
2. Check index status or changes before consequential architectural conclusions.
3. Prefer `rg`, git, and direct reads for exact strings, docs/config, generated content, and current uncommitted edits.
4. Re-index after major scaffolds, branch switches, or when the watcher/index state is uncertain.

The integration is intentionally global because the executable and MCP registration are machine capabilities. Repository-specific usage rules live in `AGENTS.md`, and derived index data stays local.

For a functional check, a fresh read-only Codex process must do both of these, not merely list configuration:

1. Read the exact H2 headings from the repository's root `AGENTS.md`.
2. Call `openaiDeveloperDocs.search_openai_docs` and return an official AGENTS.md documentation result.

The most recent smoke test passed both. It was run with `--ephemeral` and `--sandbox read-only`, so it did not modify the repository or persist a new task.

## When to add project config

Do not add `.codex/config.toml` merely because the file exists as an option. Add it when this trusted repository needs a setting different from the user's defaults and the key is documented as project-overridable. The attempted whole-plugin project override was not established by current public documentation or the CLI listing behavior, so no speculative project config has been committed.

## Setup change protocol

For every Codex tooling change:

1. Record why the capability is needed and its scope.
2. Prefer repository scope over global scope when officially supported.
3. Validate configuration syntax with the runtime that will read it.
4. Restart or launch a fresh process when discovery happens only at startup.
5. Exercise one representative tool call or behavior.
6. Remove or disable the capability when its ongoing value no longer exceeds its context, security, and maintenance cost.
