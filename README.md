# Auto Formisch

Render forms automatically on top of [Formisch](https://formisch.dev/) from a portable, versioned JSON Form Definition, and validate submissions on a server with exactly the same logic.

- One **Form Definition** describes every Field, Layout, Rule and Condition of a form. Store it as JSON, or write it in TypeScript with the **Fluent Builder** and get the submitted data's type inferred.
- `compile` turns it into a [Standard Schema](https://standardschema.dev/), so a server or Worker validates with only the core package and Valibot, Conditions and Wizards included.
- `<AutoForm>` renders it on Formisch with native, accessible HTML and no stylesheet. Widgets, the Field Wrapper and Layouts are swappable without touching the Definition.
- A stored Definition is data only: unknown keys are rejected, and loading never runs code.

```sh
pnpm add @auto-formisch/react @formisch/react valibot react react-dom
```

<!-- example: docs/examples/contact-form.tsx#client -->

```tsx
import { AutoForm, compile, type FormOutput, type SubmitResult } from '@auto-formisch/react';
import definition from './contact.json';

// Compile once, outside render.
const form = compile(definition);

async function send(output: FormOutput): Promise<SubmitResult> {
  const response = await fetch('/api/contact', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(output),
  });
  // The server's `{ errors: [{ message, path }] }` shows on the Fields.
  if (response.status === 422) return response.json();
  // A thrown error's message shows in the form's general error region.
  if (!response.ok) throw new Error('Your message could not be sent. Try again later.');
}

export function ContactForm() {
  return <AutoForm form={form} onSubmit={send} />;
}
```

## Documentation

- [Guide](docs/guide.md): a first form in JSON and the Fluent Builder, through `<AutoForm>` and server validation, then Conditions, Repeaters, Wizards, Widgets, editing a record, Locked Fields, messages and custom Field Types and Rules.
- [Before you ship](docs/guide.md#before-you-ship): the behaviours most likely to surprise you in production. Read it before you go live.
- [Reference](docs/reference.md): every key, type, Rule, operator and export.
- [Glossary](GLOSSARY.md), and the decisions behind the design in [`docs/adr/`](docs/adr/).
- Changelogs: [`@auto-formisch/core`](packages/core/CHANGELOG.md), [`@auto-formisch/react`](frameworks/react/CHANGELOG.md).

## Packages

| Package                | Path               | Responsibility                                                                                                                                   |
| ---------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@auto-formisch/core`  | `packages/core`    | Loader, `compile`, `lock`, the Condition evaluator, the Fluent Builder and extensions. Depends only on Valibot; no React, DOM, Node or Formisch. |
| `@auto-formisch/react` | `frameworks/react` | `AutoForm`, `useAutoForm`, `useFormValue`, default Widgets and Layouts on `@formisch/react`. Re-exports all of `core`.                           |
| `playground`           | `apps/playground`  | A Vite+ React example.                                                                                                                           |

Peer dependencies: `valibot ^1.5.0`, and for React `@formisch/react ^1.2.0` and `react`/`react-dom ^19.2.0`. Both packages are ESM with a single `.` entry and `sideEffects: false`.

## Versions

A Form Definition's `version` is the version of its **format**, separate from the packages' own version numbers.

- **Format version 1 is the only one.** `compile` accepts only the version it reads and throws a `DefinitionError` for any other, older or newer: `Unsupported version 2; this package reads version 1`. Nothing ever runs under a meaning it wasn't written for.
- **`version` goes up only for a breaking format change**: when a valid Definition would stop loading, or would load with a different meaning. Adding an optional key, a `type`, a Rule or an operator does not change it. An older package rejects a Definition that uses such an addition as an unknown key or `type`, so a Definition using a new feature needs a package new enough to know it.
- **A new format version is a major release** of the packages. A major release does not always mean a new format version.
- **Migration is explicit.** Version 1 has no migration code. When version 2 exists, `@auto-formisch/core` will export a pure `migrate(definition)` that upgrades step by step from any older version, without evaluating code, and the error for an older `version` will point to it. Your application calls `migrate` and decides whether to store the result. `compile` never migrates on its own, so a server never silently runs something other than what is stored.
- **Stored records have no version.** A record saved under an older Definition goes through the same normalization as any [`initialInput`](docs/guide.md#defaults-and-editing-a-record).
- **Custom Field Types and Rules have no version.** Renaming one or changing its options is the application's own migration.
- **One JSON Schema per format version** ships in `@auto-formisch/core` at `schema/v<version>.json`, at a URL that stays the same across releases; later releases keep shipping `schema/v1.json`.

## Development

Use Node.js from `.node-version`, pnpm 10.34.7, and the project-local Vite+ CLI installed with dependencies.

```sh
pnpm install
pnpm build
pnpm dev
```

Build first so workspace package exports resolve. During library development, run `pnpm --filter @auto-formisch/core exec vp pack --watch` (or the corresponding package) alongside the playground. Before pushing:

```sh
pnpm build
pnpm typecheck
pnpm check
pnpm test
```

`core` tests run in a `node` environment with no DOM, and `core` is also type-checked without DOM types; `react` tests run in jsdom. The docs' code samples live in `docs/examples/`: `pnpm typecheck` checks them, their tests run them, and `docs/docs.test.ts` fails when a sample in a Markdown file differs from its example or has none.

## Agent skills

`.claude/skills/` vendors the skills from [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) (MIT, commit `eb07f19`), with their shared checklists in `.claude/references/`. Claude Code loads them automatically. The files are excluded from formatting so they stay identical to upstream; to update, copy `skills/` and `references/` from a newer upstream checkout over them.

## References

- [Formisch React](https://formisch.dev/react/guides/introduction/)
- [Valibot](https://valibot.dev/)
- [Standard Schema](https://standardschema.dev/)
- [Vite+ monorepos](https://viteplus.dev/guide/monorepo) and [library packaging](https://viteplus.dev/guide/pack)
