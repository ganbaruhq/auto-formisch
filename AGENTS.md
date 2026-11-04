# Repository instructions

- Use pnpm workspaces and Vite+; keep framework-neutral packages independent of React and Node runtime APIs.
- Run `pnpm build`, `pnpm typecheck`, `pnpm check`, and `pnpm test` before pushing changes.
- Reject unsupported Valibot behavior explicitly. Add round-trip and negative tests when extending the JSON codec.
- Keep the portable definition versioned. Never serialize functions or evaluate code from stored definitions.
- Do not add AI attribution, generated-by footers, assistant signatures, or AI co-author trailers to commit messages, PR titles/descriptions, or comments. Preserve human co-author credits.

## Agent skills

### Issue tracker

Issues live in YouTrack project `AF` (`quanglv.youtrack.cloud`, via the `youtrack-quanglv` MCP); GitHub hosts code and PRs only. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default triage roles map to same-named YouTrack tags (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one root `GLOSSARY.md` plus `docs/adr/`, created lazily. See `docs/agents/domain.md`.
