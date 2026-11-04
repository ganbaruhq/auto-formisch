# Auto Formisch

Render forms automatically on top of [Formisch](https://formisch.dev/) from a portable, versioned JSON Form Definition, and validate submissions on a server with exactly the same logic.

This is early work towards v1. So far a Form Definition supports the single-value Field Types `text`, `number`, `boolean`, `choice`, `multi_choice` and `date`, nested `object` and `repeater` Fields, plus Layouts and Content.

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

### In code: the Fluent Builder

Write the same Definition with Valibot-style functions and pipes. Rules, metadata (`label`, `description`, `placeholder`, `widget`, `columns`, `colSpan`, `defaultValue`) and Conditions (`visible`, `required`, `disabled`) all go in the pipe:

```ts
import {
  choice,
  compile,
  email,
  eq,
  form,
  label,
  repeater,
  required,
  section,
  text,
  visible,
} from '@auto-formisch/core';

const definition = form([
  section('Contact', [text('email', [label('Email address'), email(), required()])]),
  choice('country', ['VN', 'US']),
  text('taxId', [required(), visible(eq('country', 'VN'))]),
  repeater('addresses', [text('street', [required()]), text('city')]),
]);

const compiled = compile(definition);
// onSubmit / ~standard.validate output:
// { email: string; country?: 'VN' | 'US'; taxId?: string; addresses: { street: string; city?: string }[] }
```

`form()` returns the plain, frozen Definition data, deep-equal to the JSON, so it can be stored or sent to a Worker as is. It runs the same loader as JSON and throws the same `DefinitionError`, including for a Condition that reads a Field that doesn't exist. `compile` infers the output: a Field is optional unless it is `required()` with no Condition on it or on a Component around it. A pipe item only fits the Fields its JSON key or Rule applies to, so `boolean('agree', [email()])` fails to compile. `email()` and `url()` also set the matching `widget` unless the pipe names one; `grid(2, [...])` is a `section` with `columns: 2`. The Condition helpers return the JSON AST: `all`, `any`, `not`, `eq`, `neq`, `isIn` (`in`), `notIn` (`not_in`), `gt`, `gte`, `lt`, `lte`, `contains`, `isEmpty` (`empty`) and `notEmpty` (`not_empty`). Every function is its own export, so unused ones are left out of a bundle.

### In React

```tsx
import { AutoForm, compile } from '@auto-formisch/react';

const form = compile(definition); // once, outside render

export function ContactForm() {
  return <AutoForm form={form} onSubmit={(output) => save(output)} />;
}
```

`AutoForm` validates on submit and revalidates on input. To show a different form, change its React `key`.

### Customizing the Renderer

Each of these props replaces the defaults on its own; none changes the Definition or validation.

```tsx
<AutoForm
  form={form}
  widgets={{ text: MyInput, rating: { component: Stars, appliesTo: ['number'] } }}
  layouts={{ section: MySection }}
  fieldWrapper={MyWrapper}
  overrides={{ 'address.city': { widget: 'rating', label: 'City' } }}
  labels={{ submit: 'Gửi', add: 'Thêm', remove: 'Xóa' }}
  actions={({ isSubmitting, submit }) => <MyButtons busy={isSubmitting} onSave={submit} />}
  onSubmit={save}
/>
```

- `widgets` merges over the default Widget map. A Field or Content uses the entry named by its `widget ?? type`. An entry is a component, or `{ component, group?, appliesTo? }`: `group` makes the Field Wrapper use `fieldset`/`legend`, and `appliesTo` lists the types the Widget can present. In TypeScript, an entry named after a built-in type must take that type's props.
- A value Field's Widget gets `WidgetProps`: `value`, `onChange`, `inputProps` (spread onto the control: id, name, ref, focus handlers and ARIA state), `errors`, `disabled`, `readOnly`, `required` and `node`. It draws only the control, converts its own values (such as a string to a number) and calls `onChange(undefined)` when empty. `object`, `repeater` and `content` Widgets get `ObjectProps`, `RepeaterProps` and `ContentProps`.
- `layouts` merges over the default `section`, `tabs` and `tab`; `fieldWrapper` replaces the frame that draws every value Field's label, description and errors.
- `overrides` changes `widget`, `label`, `description` or `placeholder` by data path, without Repeater indices (`'pets.kind'` is every row's `kind`).
- On mount, `AutoForm` checks the whole tree, rendered or not, and throws an `AutoFormError` whose `errors` lists every unknown Widget name, Widget whose `appliesTo` leaves out the type, and unknown `overrides` path or key, as `{message, path}`.
- `labels` sets the wording of the default buttons (`submit`, `add`, `remove`, `moveUp`, `moveDown`); `actions` draws the buttons instead of the default submit button.
- `useAutoForm(form)` returns the Formisch store, for calling Formisch's `reset`, `setInput` or `submit`; pass it as `store`. Nested paths of a JSON Definition need a cast there.
- `useFormValue(path)` lets a Widget read another Field, with the path syntax of Conditions, such as `useFormValue('../country')` from a Repeater row.

### On a server or in a Worker

```ts
import { compile } from '@auto-formisch/core';

const form = compile(definition);
const result = form['~standard'].validate(await request.json());
if (result.issues) return Response.json({ errors: result.issues }, { status: 422 });
await store(result.value);
```

`compiled['~standard']` is a Standard Schema whose issues are `{message, path}` with a plain key path; the client and the server get the same result. `compiled.schema` is the underlying Valibot pipe, for `v.safeParse` with a per-request config. Read its errors only as `{message, path}`.

### Custom Field Types and Rules

Register values and constraints the built-ins don't cover with `defineFieldType` and `defineRule`, and pass them explicitly to `compile` and `form`; there is no global registry. Neither holds anything of React, so a server loads them with only the core package and Valibot. Their Widgets go to `<AutoForm widgets>`.

```tsx
import * as v from 'valibot';
import { compile, defineFieldType, defineRule, form, required, text } from '@auto-formisch/core';

const rating = defineFieldType({
  type: 'rating',
  options: { max: v.number() },
  schema: (node) => v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(node.max)),
  conditionAs: 'number',
});

const startsWith = defineRule({
  type: 'starts_with',
  appliesTo: ['text'],
  requirement: v.string(),
  check: (value, requirement) => value.startsWith(requirement),
  message: 'Wrong prefix',
});

const extensions = { fieldTypes: [rating], rules: [startsWith] };
const definition = form(
  [rating('score', { max: 5 }, [required()]), text('code', [startsWith('VN')])],
  extensions,
);
const compiled = compile(definition, extensions); // { score: number; code?: string }

<AutoForm form={compiled} widgets={{ rating: Stars }} onSubmit={save} />;
```

```jsonc
{ "type": "rating", "name": "score", "max": 5 }
{ "type": "text", "name": "code", "rules": [{ "type": "starts_with", "requirement": "VN" }] }
```

- A custom Field Type is a Field holding one JSON value (string, number, boolean, list or object; no `Date` or `File`). It takes `label`, `description`, `placeholder`, `widget`, `colSpan`, `visible`, `disabled`, `required`, `requiredMessage`, `default` and its own `options`, flat and strict on the node; it takes no `rules`. An option whose schema rejects `undefined` must be present, and option values must be JSON. `schema` may be a function of the node, built once per node on load; if it throws, loading reports an error at the node.
- The schema only validates: what it outputs is ignored, so `v.trim()` has no effect, and a schema that changes its value's type or holds no JSON value fails to compile. It never sees an empty or Inactive value; empty means what it does for every Field. All its errors show on the Field's own path, after `required`.
- `conditionAs` picks a row of the Condition operator table (`text`, `number`, `date`, `boolean` or `multi_choice`) and must fit the value; without it, Conditions can only use `empty` and `not_empty`. A Condition's `value` is checked with the type's schema on load (for `contains`, it is a string, number or boolean).
- A custom Rule keeps the shape `{type, requirement?, message?}`; `requirement` is checked with its schema on load, and the Definition's `message` replaces the default. `appliesTo` lists built-in value Field Types, and a Rule's Builder item only fits those (`number('n', [startsWith('VN')])` fails to compile). `check` runs sync, only on a non-empty value of the Field's type. It is the official way to validate a pattern: a regex there that is open to ReDoS is the application's risk, on every server that validates the form.
- Names match `^[a-z][a-z0-9_]*$`. A built-in name (Field Type, Layout or Rule), an invalid option key, an option that reuses a built-in key, an async schema, requirement or `check`, and a name passed twice throw a `TypeError` at once. A Definition that uses a type or Rule not passed to `compile` throws on load, so a Rule is never skipped. Adding a built-in later is a breaking change for a custom one of the same name.
- Custom code that throws while validating is a bug: `~standard.validate` throws, and it is never a validation result; a `check` that returns anything but a boolean, such as a Promise, throws too. In `<AutoForm>`, Formisch catches it on submit and shows its message in the general error region, and the form never submits.
- Known limit: an async check is caught only where Valibot marks it async, anywhere in a schema (`v.pipe(v.string(), v.checkAsync(...))` is caught). An async function given to a sync API such as `v.check` or `v.custom`, or a schema inside `v.lazy`, can't be detected, and its Promise counts as valid.
- A custom type's Widget takes `WidgetProps<InferFieldValue<typeof rating>, InferFieldNode<typeof rating>>`. Custom Field Types and Rules have no version of their own: change their options or drop one, and a stored Definition that uses it throws on load until the application migrates it.

### Validation messages

Messages go through Valibot; there is no catalog of our own. From highest priority:

1. A Rule's `message` and a Field's `requiredMessage` in the Definition.
2. Valibot's `setSpecificMessage`, then `setSchemaMessage`, then `setGlobalMessage`.
3. Valibot's defaults, which are technical English such as `Invalid length: Expected >=3 but received 1`. A form for end users should register its own messages, or use [`@valibot/i18n`](https://github.com/open-circle/valibot/tree/main/packages/i18n).

A required error is the exception: it resolves through `requiredMessage`, then `setRequiredMessage`, then `Required`, so Valibot's `setGlobalMessage` and messages for `v.check` don't reach it.

```ts
import * as v from 'valibot';
import { setRequiredMessage } from '@auto-formisch/core';
import '@valibot/i18n/de';

setRequiredMessage('This field is required');
setRequiredMessage('Pflichtfeld', 'de');
v.setSpecificMessage(v.minLength, (issue) => `Tối thiểu ${issue.requirement}`, 'vi');

// In the browser, Formisch reads the global language.
v.setGlobalConfig({ lang: 'de' });
// On a server answering in several languages, pass it per request;
// `~standard.validate` takes no language and uses the global one.
const result = await v.safeParseAsync(form.schema, input, { lang: 'de' });
```

Like Valibot, a message set for one language doesn't fall back to another; `deleteRequiredMessage(lang?)` removes one.

### Supported so far

- Value Fields: every value Field takes `label`, `description`, `widget`, `required`, `requiredMessage` and `default`, and is optional by default. `default` must be non-empty, of the Field's type and pass its Rules, or loading fails; it stays out of the schema, so the server never fills it in. (The Renderer doesn't seed it into the form yet.)

  | `type`         | Value                                     | Extra keys               | Default Widget                        |
  | -------------- | ----------------------------------------- | ------------------------ | ------------------------------------- |
  | `text`         | string                                    | `placeholder`            | `input[type=text]`                    |
  | `number`       | finite number                             | `placeholder`            | `input[type=number]`                  |
  | `boolean`      | `true` or `false`                         |                          | checkbox                              |
  | `choice`       | one value of `choices`                    | `choices`, `placeholder` | `select` with an empty option         |
  | `multi_choice` | distinct values of `choices`, as an array | `choices`                | one checkbox per choice in a fieldset |
  | `date`         | `YYYY-MM-DD` calendar date                |                          | `input[type=date]`                    |

  Other default Widgets, chosen with `widget`: `textarea`, `email`, `url` and `password` for `text`; `toggle` (a checkbox with `role="switch"`) for `boolean`; `radio` for `choice`; `multi_select` (`select multiple`) for `multi_choice`. A `widget` changes presentation only: `email` does not add the `email` Rule.

  `choices` is required: a non-empty list of strings or finite numbers, or `{value, label?}`, with no empty, duplicate or mixed string and number values.

- Nested Fields: `object` and `repeater` take `name`, `label`, `description`, `widget` and a non-empty `components`, but no `required`; they always keep their key in the output, as `{}` and `[]`. An `object` nests its Fields' values under its `name`. A `repeater` holds a list of rows, each an object made from its `components`; `min_items: 1` asks for at least one row. Each `object` and each row is its own data scope, so a `name` need only be unique within it, and errors carry plain key paths into rows, such as `['contacts', 1, 'name']`. Repeaters nest. The default Widgets are a `fieldset` for an `object`, and for a `repeater` a `fieldset` with one group per row (Move up, Move down, Remove) and an Add button that is disabled at `max_items`; values and errors stay with their row when it moves.

- Rules, each `{type, requirement?, message?}`, are rejected on load on any other Field Type:

  | Rule                       | Applies to                 | `requirement`                                    |
  | -------------------------- | -------------------------- | ------------------------------------------------ |
  | `email`, `url`             | `text`                     | none                                             |
  | `min_length`, `max_length` | `text`                     | non-negative integer                             |
  | `min_value`, `max_value`   | `number`, `date`           | a number, or a `YYYY-MM-DD` date on a date Field |
  | `integer`                  | `number`                   | none                                             |
  | `accepted`                 | `boolean`                  | none                                             |
  | `min_items`, `max_items`   | `multi_choice`, `repeater` | non-negative integer                             |

- Empty means `undefined`, `null`, `''`, a whitespace-only string or `[]`; `0` and `false` are values. An empty value Field drops its key from the output and skips its Rules; a required one reports `Required` or its `requiredMessage`.
- Conditions: every Component takes `visible`, and every Field takes `disabled`, as a Condition (`disabled` also as `true` or `false`); a value Field's `required` is `true`, `false` or a Condition. A Condition is a leaf `{field, operator, value?}` or a group `{all: [...]}`, `{any: [...]}` or `{not: ...}`, at most 8 levels deep. `field` is relative to the Component's data scope: `../` steps out of an `object` or Repeater row, then names joined by `.` reach into `object`s, never into a Repeater's rows.

  | Field `type`     | Operators                                         |
  | ---------------- | ------------------------------------------------- |
  | `text`, `choice` | `eq`, `neq`, `in`, `not_in`, `empty`, `not_empty` |
  | `number`, `date` | the same, and `gt`, `gte`, `lt`, `lte`            |
  | `boolean`        | `eq`, `neq`, `empty`, `not_empty`                 |
  | `multi_choice`   | `contains`, `empty`, `not_empty`                  |
  | `repeater`       | `empty`, `not_empty`                              |

  `value` must fit the Field (a `choice` value is one of its `choices`); `in` and `not_in` take a non-empty list, and `empty` and `not_empty` take none. Comparisons are strict, with no trimming or coercion, and an empty or wrongly typed value makes them false (`neq` and `not_in` true). A Field hidden or disabled, itself or through a Component around it, is Inactive: it is not validated, not in the output (an `object` or Repeater outputs `{}` or `[]`), and reads as empty to Conditions and `useFormValue`, so a value a client forges into it changes nothing. Its value stays in the form and comes back when it reappears. A missing Field, an operator that doesn't fit, or a cycle through `visible` or `disabled` is rejected on load; `required` only reads values, so "at least one of these two" is fine. The server gets the same result from `~standard.validate`.

- Output holds only the keys the Definition declares.
- Layouts `section` (`label`, `description`, `columns`), `tabs` and `tab` (`label`, `description`, `columns`; a `tab` sits only directly inside `tabs`), and Content `{type: 'content', text}` add no data path: moving a Field in or out of them changes neither its path nor the output. Inside a Layout with `columns`, any child but a `tab` takes `colSpan` (at most `columns`). The default Layouts are native HTML: a `fieldset` for a labelled section, a WAI-ARIA tab list whose inactive panels stay mounted (so their Fields are still validated), and an inline CSS grid whose column count is the fallback of `--af-columns`, so a media query can change it. Content renders as plain text, never as HTML.

## References

- [Vite+ monorepos](https://viteplus.dev/guide/monorepo)
- [Vite+ library packaging](https://viteplus.dev/guide/pack)
- [Formisch React](https://formisch.dev/react/guides/introduction/)
- [Valibot](https://valibot.dev/)
- [Standard Schema](https://standardschema.dev/)
