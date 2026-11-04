# Auto Formisch

Render forms automatically on top of [Formisch](https://formisch.dev/) from a portable, versioned JSON Form Definition, and validate submissions on a server with exactly the same logic.

This is early work towards v1. So far a Form Definition supports the single-value Field Types `text`, `number`, `boolean`, `choice`, `multi_choice` and `date`.

## Workspace

| Package                | Path               | Responsibility                                                                                    |
| ---------------------- | ------------------ | ------------------------------------------------------------------------------------------------- |
| `@auto-formisch/core`  | `packages/core`    | Framework-neutral loader and `compile`. Depends only on Valibot; no React, DOM, Node or Formisch. |
| `@auto-formisch/react` | `frameworks/react` | `AutoForm`, default Widgets and Field Wrapper on `@formisch/react`. Re-exports all of `core`.     |
| `playground`           | `apps/playground`  | Vite+ React example on the new API.                                                               |

Valibot (`^1.5.0`) and, for React, `@formisch/react` (`^1.2.0`), `react` and `react-dom` are peer dependencies. Both packages are ESM with a single `.` entry and `sideEffects: false`.

Tooling: pnpm workspaces, TypeScript, Vite+ (`vp pack`, `vp build`, `vp test`, `vp check`), GitHub Actions.

## Development

Use Node.js from `.node-version`, pnpm 10.34.7, and the project-local Vite+ CLI installed with dependencies.

```sh
pnpm install
pnpm build
pnpm dev
```

Build first so workspace package exports resolve. During library development, run `pnpm --filter @auto-formisch/core exec vp pack --watch` (or the corresponding package) alongside the playground.

```sh
pnpm build
pnpm typecheck
pnpm check
pnpm test
```

`core` tests run in a `node` environment with no DOM, and `core` is also type-checked without DOM types; `react` tests run in jsdom.

## Agent skills

`.claude/skills/` vendors the skills from [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) (MIT, commit `eb07f19`), with their shared checklists in `.claude/references/`. Claude Code loads them automatically. The files are excluded from formatting so they stay identical to upstream; to update, copy `skills/` and `references/` from a newer upstream checkout over them.

## Usage

A Form Definition is plain JSON. Store it, send it to a Worker, or write it by hand:

```json
{
  "version": 1,
  "components": [
    {
      "type": "text",
      "name": "email",
      "label": "Email address",
      "required": true,
      "rules": [{ "type": "email", "message": "Enter a valid email address" }]
    }
  ]
}
```

`compile` checks the Definition and throws a `DefinitionError` whose `errors` lists every problem as `{message, path}`: an unknown key (such as `requried`), an unknown `type` or Rule, or a `version` other than `1`. It never evaluates code from a Definition.

### In React

```tsx
import { AutoForm, compile } from '@auto-formisch/react';

const form = compile(definition); // once, outside render

export function ContactForm() {
  return <AutoForm form={form} onSubmit={(output) => save(output)} />;
}
```

`AutoForm` validates on submit and revalidates on input. To show a different form, change its React `key`.

### On a server or in a Worker

```ts
import { compile } from '@auto-formisch/core';

const form = compile(definition);
const result = form['~standard'].validate(await request.json());
if (result.issues) return Response.json({ errors: result.issues }, { status: 422 });
await store(result.value);
```

`compiled['~standard']` is a Standard Schema whose issues are `{message, path}` with a plain key path; the client and the server get the same result. `compiled.schema` is the underlying Valibot pipe, for `v.safeParse` with a per-request config. Read its errors only as `{message, path}`.

### Supported so far

- Fields: every Field takes `label`, `description`, `widget`, `required` and `requiredMessage`, and is optional by default.

  | `type`         | Value                                     | Extra keys               | Default Widget                        |
  | -------------- | ----------------------------------------- | ------------------------ | ------------------------------------- |
  | `text`         | string                                    | `placeholder`            | `input[type=text]`                    |
  | `number`       | finite number                             | `placeholder`            | `input[type=number]`                  |
  | `boolean`      | `true` or `false`                         |                          | checkbox                              |
  | `choice`       | one value of `choices`                    | `choices`, `placeholder` | `select` with an empty option         |
  | `multi_choice` | distinct values of `choices`, as an array | `choices`                | one checkbox per choice in a fieldset |
  | `date`         | `YYYY-MM-DD` calendar date                |                          | `input[type=date]`                    |

  `choices` is required: a non-empty list of strings or finite numbers, or `{value, label?}`, with no empty, duplicate or mixed string and number values.

- Rules, each `{type, requirement?, message?}`, are rejected on load on any other Field Type:

  | Rule                       | Applies to       | `requirement`                                    |
  | -------------------------- | ---------------- | ------------------------------------------------ |
  | `email`, `url`             | `text`           | none                                             |
  | `min_length`, `max_length` | `text`           | non-negative integer                             |
  | `min_value`, `max_value`   | `number`, `date` | a number, or a `YYYY-MM-DD` date on a date Field |
  | `integer`                  | `number`         | none                                             |
  | `accepted`                 | `boolean`        | none                                             |
  | `min_items`, `max_items`   | `multi_choice`   | non-negative integer                             |

- Empty means `undefined`, `null`, `''`, a whitespace-only string or `[]`; `0` and `false` are values. An empty Field drops its key from the output and skips its Rules; a required one reports `Required` or its `requiredMessage`.
- Output holds only the keys the Definition declares.

## References

- [Vite+ monorepos](https://viteplus.dev/guide/monorepo)
- [Vite+ library packaging](https://viteplus.dev/guide/pack)
- [Formisch React](https://formisch.dev/react/guides/introduction/)
- [Valibot](https://valibot.dev/)
- [Standard Schema](https://standardschema.dev/)
