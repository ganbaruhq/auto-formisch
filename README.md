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

- Value Fields: every value Field takes `label`, `description`, `widget`, `required` and `requiredMessage`, and is optional by default.

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
