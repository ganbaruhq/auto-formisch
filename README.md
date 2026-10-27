# Auto Formisch

Generate React forms from Valibot schemas, keep presentation in a separate UI schema, and persist supported form definitions as versioned JSON.

This is an early working starter. The builder is a programmatic compiler; a visual editor is not implemented.

## Workspace

| Package                 | Responsibility                                                                  |
| ----------------------- | ------------------------------------------------------------------------------- |
| `auto-formisch-core`    | Shared types, Valibot inspection, inferred field metadata                       |
| `auto-formisch-json`    | Serialize supported Valibot schemas + UI to JSON and rebuild executable schemas |
| `auto-formisch-builder` | Compile editable definitions into Valibot + UI schemas                          |
| `auto-formisch-react`   | Accessible native inputs, validation, and submission using `@formisch/react`    |
| `apps/playground`       | Vite+ React example exercising all four packages                                |

Tooling: pnpm workspaces, TypeScript, Vite+ (`vp pack`, `vp build`, `vp test`, `vp check`), GitHub Actions.

## Development

Use Node.js from `.node-version`, pnpm 10.34.7, and the project-local Vite+ CLI installed with dependencies.

```sh
pnpm install
pnpm build
pnpm dev
```

Build first so workspace package exports resolve. During library development, run `pnpm --filter auto-formisch-core exec vp pack --watch` (or the corresponding package) alongside the playground.

```sh
pnpm build
pnpm typecheck
pnpm check
pnpm test
```

## Schema-first usage

```tsx
import * as v from 'valibot';
import { AutoForm } from 'auto-formisch-react';
import { serialize, deserialize } from 'auto-formisch-json';

const schema = v.object({
  email: v.pipe(v.string(), v.email('Enter a valid email')),
  age: v.pipe(v.number(), v.minValue(18)),
  notes: v.optional(v.string()),
  newsletter: v.boolean(),
});
const ui = { email: { label: 'Email address' } };
const json = serialize(schema, ui);
const restored = deserialize(json);

export function ProfileForm() {
  return (
    <AutoForm
      schema={restored.schema}
      ui={restored.ui}
      onSubmit={(values) => {
        console.log(values);
      }}
    />
  );
}
```

`AutoForm` infers email, number, checkbox, and text widgets. String fields can use `widget: 'textarea'`. Labels, descriptions, and placeholders live in `UISchema`. The initial checkbox value is false; other inputs start empty. Optional string fields edited to empty submit as an empty string. Empty number inputs become undefined. `onSubmit` receives validated values; its current type is `Record<string, unknown>` because portable definitions are dynamic. Remount `AutoForm` with a new React `key` when changing the schema.

## Definition-first usage

```ts
import { buildForm } from 'auto-formisch-builder';

const { schema, ui } = buildForm({
  version: 1,
  fields: {
    email: { type: 'string', rules: [{ type: 'email' }] },
  },
  ui: { email: { label: 'Email address' } },
});
```

The same definition is the editable data model for a future visual builder. It is a project-specific format, not standard JSON Schema and not a dump of Valibot internals. Submitted answers are separate from the form definition.

## Supported boundary

- A synchronous `v.object` root with flat `string`, `number`, and `boolean` fields.
- `v.optional` without defaults.
- `email`, `minLength`, `maxLength`, `minValue`, and `maxValue` pipelines, including string validation messages.
- UI labels, descriptions, placeholders, and compatible widget choices.

Nested objects, arrays, unions, defaults, transforms, custom checks, async schemas, custom base error messages, and other pipelines are rejected explicitly. No arbitrary function evaluation is used when reading JSON. Stored definitions are validated before compilation. UI rendering currently shares this supported subset. Valibot inspection depends on its schema structure; extend the codec and round-trip tests together when adding support.

## Cloudflare Workers and D1

Core, JSON, and builder packages use no Node-specific runtime APIs or DOM APIs. Use them in a Worker to deserialize a form definition and run `v.safeParse(schema, requestData)`. Store the JSON string in a D1 TEXT column, version definitions immutably, and associate submissions with a definition version. The React adapter runs in the browser. This repository does not provision D1 or include authentication/persistence endpoints. Revalidate submissions on the server even when the browser already validated them.

## References

- [Vite+ monorepos](https://viteplus.dev/guide/monorepo)
- [Vite+ library packaging](https://viteplus.dev/guide/pack)
- [Formisch React](https://formisch.dev/react/guides/introduction/)
- [Valibot](https://valibot.dev/)
