# Documentation map

Keep this directory small and decision-oriented:

- `product-brief.md` - evolving product discovery facts and open questions.
- `architecture.md` - system principles, accepted core boundaries, and deferred adapter choices.
- `frontend-mental-model.md` - frontend concepts and failure modes in backend terms.
- `deployment-mental-model.md` - the path from source code and DNS to a running production system.
- `delivery.md` - the path from idea to verified production change.
- `codex-setup.md` - the verified Codex capabilities and the policy for keeping them focused.
- `decisions/` - short architecture decision records (ADRs) for consequential choices.

Documentation is not a second database for repository state. Git describes changed files, the package manager describes dependencies, CI describes check results, and GitHub issues will describe planned and follow-up work. Update docs when they explain intent that those systems cannot.
