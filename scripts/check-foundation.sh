#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

required_files=(
  .codex/config.toml
  .agents/skills/shadcn/SKILL.md
  skills-lock.json
  AGENTS.md
  README.md
  docs/README.md
  docs/product-brief.md
  docs/architecture.md
  docs/frontend-mental-model.md
  docs/deployment-mental-model.md
  docs/delivery.md
  docs/codex-setup.md
  docs/decisions/README.md
  docs/decisions/0001-development-operating-model.md
  docs/decisions/0002-initial-stack-direction.md
  docs/decisions/template.md
  .github/dependabot.yml
  .github/ISSUE_TEMPLATE/config.yml
  .github/ISSUE_TEMPLATE/feature.yml
  .github/ISSUE_TEMPLATE/bug.yml
  .github/pull_request_template.md
  .github/workflows/foundation.yml
)

for path in "${required_files[@]}"; do
  if [[ ! -s "$path" ]]; then
    echo "Missing or empty required file: $path" >&2
    exit 1
  fi
done

python3 - <<'PY'
import pathlib
import re
import sys

root = pathlib.Path.cwd()
text_paths = [
    root / "README.md",
    root / "AGENTS.md",
    *sorted((root / ".agents").rglob("*.md")),
    *sorted((root / "docs").rglob("*.md")),
    *sorted((root / ".github").rglob("*.md")),
    *sorted((root / ".github").rglob("*.yml")),
    *sorted((root / "scripts").rglob("*.sh")),
]
problems = []

robinhood_config = (root / ".codex" / "config.toml").read_text(encoding="utf-8")
allowlist_match = re.search(
    r"\[mcp_servers\.robinhood\]\s*enabled_tools\s*=\s*\[(.*?)\]",
    robinhood_config,
    re.DOTALL,
)
expected_robinhood_tools = [
    "get_accounts",
    "get_portfolio",
    "get_equity_positions",
    "get_equity_orders",
    "get_equity_quotes",
    "get_equity_historicals",
    "get_equity_tradability",
]
configured_robinhood_tools = (
    re.findall(r'"([^"]+)"', allowlist_match.group(1))
    if allowlist_match is not None
    else []
)
if configured_robinhood_tools != expected_robinhood_tools:
    problems.append(
        ".codex/config.toml: Robinhood enabled_tools must equal the seven-tool read-only allowlist"
    )

for path in text_paths:
    text = path.read_text(encoding="utf-8")
    for line_number, line in enumerate(text.splitlines(), 1):
        if line.rstrip() != line:
            problems.append(f"{path.relative_to(root)}:{line_number}: trailing whitespace")

    if path.suffix != ".md":
        continue
    for target in re.findall(r"(?<!!)\[[^]]+\]\(([^)]+)\)", text):
        target = target.strip()
        if not target or "://" in target or target.startswith("#"):
            continue
        local = target.split("#", 1)[0]
        destination = (path.parent / local).resolve()
        if not destination.exists():
            problems.append(f"{path.relative_to(root)}: broken link to {target}")

if problems:
    print("\n".join(problems), file=sys.stderr)
    raise SystemExit(1)
PY

tracked_local_artifacts="$(git ls-files -- '.env' '.env.*' .playwright-mcp tmp .vercel node_modules 2>/dev/null || true)"
if [[ -n "$tracked_local_artifacts" ]]; then
  echo "Local or secret artifacts are tracked:" >&2
  echo "$tracked_local_artifacts" >&2
  exit 1
fi

git diff --check
git diff --cached --check

echo "Foundation checks passed."
