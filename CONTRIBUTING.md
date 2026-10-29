# Contributing to Auto Formisch

Thanks for helping out! This guide covers everything from your first clone to getting a change released. Maintainers who cut releases should also read [RELEASING.md](RELEASING.md).

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md). To report a security issue, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Before you start

- **Bugs:** search [existing issues](https://github.com/ganbaruhq/auto-formisch/issues) first, then open one with a minimal schema or definition that reproduces the problem.
- **Small fixes** (typos, docs, an obvious bug): open a pull request directly.
- **Features, new Valibot support, or API changes:** open an issue first so the design can be agreed on before you write code. This matters most for the JSON definition format, which is stored by users and has to stay compatible.

## Prerequisites

- **Node.js** — the version in [`.node-version`](.node-version) (Node 24). Any version manager that reads `.node-version` works, such as `fnm`, `mise`, or `asdf`. The minimum is Node 22.18.
- **pnpm** — the version pinned in `package.json` under `packageManager`. Run `corepack enable` once and Node picks the right version automatically.
- **Vite+** — nothing to install. The `vp` CLI comes from the `vite-plus` dev dependency and is available through the `pnpm` scripts.

## Getting set up

```bash
git clone https://github.com/<your-username>/auto-formisch.git
```

```bash
cd auto-formisch
```

```bash
pnpm install
```

```bash
pnpm build
```

Build once before anything else: packages import each other through their built `dist/` output, so the playground and the type checker need it.

```bash
pnpm dev
```

`pnpm dev` starts the playground app (`apps/playground`), which exercises all four packages.

## Repository layout

| Path                             | What lives there                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------------------- |
| `packages/auto-formisch-core`    | Shared types, Valibot inspection, inferred field metadata                                |
| `packages/auto-formisch-json`    | Versioned JSON codec: serialize supported schemas + UI and rebuild them                  |
| `packages/auto-formisch-builder` | Compiles editable definitions into Valibot + UI schemas                                  |
| `packages/auto-formisch-react`   | Accessible React rendering on top of `@formisch/react`                                   |
| `apps/playground`                | Private Vite+ React app for trying changes by hand (never published)                     |
| `.changeset/`                    | Pending release notes (see [Changesets](#changesets))                                    |
| `.claude/skills/`                | Vendored [agent skills](https://github.com/addyosmani/agent-skills) for AI coding agents |

Dependencies flow one way: `core` ← `json` ← `builder`, and `core` ← `react`. Each package has its own `package.json` and `vite.config.ts` (`vp pack` builds ESM plus type declarations into `dist/`). Tests live next to the code as `src/*.test.ts(x)`.

## Development workflow

1. Create a branch from `main`, named after the change, such as `fix/json-optional-message` or `feat/nested-objects`.
2. Rebuild the package you're editing on save, in a second terminal next to `pnpm dev`:

   ```bash
   pnpm --filter auto-formisch-json exec vp pack --watch
   ```

3. Run tests in watch mode while you work:

   ```bash
   pnpm exec vp test
   ```

4. Before pushing, run the same checks CI runs (see below).
5. Add a changeset if your change affects a published package.
6. Open a pull request against `main`.

## Checks

CI runs these four commands on every push and pull request, and the release workflow runs them again before anything is published. Run them locally before you push:

```bash
pnpm build
```

```bash
pnpm typecheck
```

```bash
pnpm check
```

```bash
pnpm test
```

- `pnpm check` runs the Vite+ formatter and linter. Fix formatting automatically with `pnpm exec vp check --fix`.
- `pnpm test` runs every package's tests once with Vitest (through Vite+) in a jsdom environment.

## Project rules

These keep the libraries safe to embed and the stored format trustworthy. Pull requests that break them will be asked to change.

- **Keep framework-neutral packages neutral.** `core`, `json`, and `builder` must not import React, DOM APIs, or Node runtime APIs. They run in browsers, servers, and Cloudflare Workers.
- **Reject unsupported Valibot behavior explicitly.** If a schema uses something the codec can't represent (transforms, custom checks, defaults, async, …), throw a clear error. Never drop it silently: a definition that loses a rule validates differently after a round trip.
- **Test the JSON codec in both directions.** Every new supported feature needs a round-trip test (serialize → deserialize gives the same validation and UI) and a negative test (unsupported variants are rejected).
- **Keep the portable definition versioned.** Changing the stored shape means bumping the definition `version` and keeping old versions readable, or documenting the break.
- **Never serialize functions or evaluate code from stored definitions.** Definitions come from storage and may be untrusted; no `eval`, `new Function`, or dynamic imports driven by their contents.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/), as the existing history does:

```text
feat(json): support v.picklist fields
fix(react): announce validation errors to screen readers
docs: explain the supported schema boundary
chore: bump vite-plus
```

The scope is optional; use the package name without the `auto-formisch-` prefix (`core`, `json`, `builder`, `react`) or `playground`. Commit messages don't drive versioning — changesets do — but clear commits make review and history easier.

If you use an AI coding agent, don't add AI attribution, "generated by" footers, or AI co-author trailers to commits, pull requests, or comments. Human co-author credits are welcome.

## Changesets

Releases are managed with [Changesets](https://changesets.dev/). A changeset is a small Markdown file in `.changeset/` that says which packages changed, how big the change is, and what to put in the changelog.

**Add one** when your pull request changes anything a user of a published package can notice: features, bug fixes, behavior or type changes, new or removed exports, and peer dependency changes.

**Skip it** for changes users can't see: tests only, internal refactors, CI, docs in this repository, or the playground.

To add one, run:

```bash
pnpm changeset
```

Pick the affected packages and a bump type, then write one or two sentences for the changelog. Write for users, not reviewers: say what changed and what they need to do.

While the packages are below 1.0, pick the bump like this:

| Change                                                                                      | Bump    |
| ------------------------------------------------------------------------------------------- | ------- |
| Breaking change (removed/renamed export, stricter behavior, incompatible definition format) | `minor` |
| New feature or newly supported Valibot behavior                                             | `minor` |
| Bug fix or internal improvement users benefit from                                          | `patch` |

From 1.0 onward, use normal [semver](https://semver.org/): breaking → `major`, feature → `minor`, fix → `patch`.

All four packages are released together with the same version number (a Changesets "fixed" group), so a changeset for any one of them bumps all four. Pick the packages your change actually touches anyway: it decides where the changelog entry appears.

You can edit or delete the generated file before committing. Commit it with your pull request. You can see what's pending with `pnpm changeset status`.

## Pull requests

- Keep pull requests focused: one fix or feature each. Split unrelated changes up.
- Fill in the pull request template, including how you tested the change.
- Update the README when you change public APIs or the supported schema boundary.
- CI must be green before merging. A maintainer reviews and merges (squash merge).
- If you're asked for changes, push new commits to the same branch; there's no need to force-push.

## Using AI coding agents

The repository vendors [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) in `.claude/skills/`, and [AGENTS.md](AGENTS.md) holds the instructions agents should follow. Agent-written changes go through the same checks and review as everyone else's. You are responsible for every line you submit.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
