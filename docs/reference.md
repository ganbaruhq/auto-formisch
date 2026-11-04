# Reference

Every key, type and function of format version 1. The [guide](guide.md) explains how they fit together; terms follow [`GLOSSARY.md`](../GLOSSARY.md).

- [Form Definition](#form-definition)
- [Field Types](#field-types)
- [Rules](#rules)
- [Conditions](#conditions)
- [Layouts and Content](#layouts-and-content)
- [Editor support](#editor-support)
- [Core API](#core-api)
- [React API](#react-api)
- [Errors](#errors)

## Form Definition

The root is an object with:

| Key          | Value                                                                                           |
| ------------ | ----------------------------------------------------------------------------------------------- |
| `version`    | `1`. Required. Any other value throws (see the [version policy](../README.md#versions)).        |
| `components` | The Components of a single-page form.                                                           |
| `pages`      | The Pages of a [Wizard](guide.md#wizards): a non-empty list of `page`. Never with `components`. |
| `$schema`    | Optional, any string, ignored by `compile`. See [Editor support](#editor-support).              |

Every Component has a `type`. Keys are flat on the node and strict per `type`: an unknown key, `type`, Rule or operator is a load error, and every load error is reported at once in one `DefinitionError`.

A Field's `name` is one segment matching `^[A-Za-z_][A-Za-z0-9_]*$`, other than `__proto__`, `prototype` and `constructor`. It is unique within its **data scope**: the root, an `object`, or a Repeater row. Layouts don't make a scope, so the names inside them share their parent's.

## Field Types

Every value Field takes these keys, besides `type` and `name`:

| Key               | Value                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------------------------- |
| `label`           | Shown by the Field Wrapper; the `name` stands in when it is missing.                                      |
| `description`     | Help text, linked to the control with `aria-describedby`.                                                 |
| `widget`          | The Widget to draw it with. Presentation only: it never changes validation.                               |
| `required`        | `true`, `false` (the default) or a [Condition](#conditions).                                              |
| `requiredMessage` | The message when a required Field is empty, in place of `Required`.                                       |
| `rules`           | A list of [Rules](#rules).                                                                                |
| `default`         | The value a new form starts with. Non-empty, of the Field's type and passing its Rules, or loading fails. |
| `visible`         | A Condition. Hidden makes the Field Inactive.                                                             |
| `disabled`        | `true`, `false` or a Condition. Disabled makes the Field Inactive.                                        |
| `colSpan`         | Columns to span, inside a Layout with `columns`; at most its `columns`.                                   |

| `type`         | Value                                   | Extra keys               | Default Widget                         | Other Widgets                            |
| -------------- | --------------------------------------- | ------------------------ | -------------------------------------- | ---------------------------------------- |
| `text`         | a string                                | `placeholder`            | `input[type=text]`                     | `textarea`, `email`, `url`, `password`   |
| `number`       | a finite number                         | `placeholder`            | `input[type=number]`                   |                                          |
| `boolean`      | `true` or `false`                       |                          | checkbox                               | `toggle` (a checkbox with `role=switch`) |
| `choice`       | one value of `choices`                  | `choices`, `placeholder` | `select` with an empty option          | `radio`                                  |
| `multi_choice` | distinct values of `choices`, as a list | `choices`                | a checkbox per choice, in a `fieldset` | `multi_select` (`select multiple`)       |
| `date`         | a `YYYY-MM-DD` string of a real date    |                          | `input[type=date]`                     |                                          |

Any value Field can also use the `hidden` Widget, which keeps the value with no UI and no Field Wrapper; its errors show in the form's general error region as `label: message` (the name when it has no label). A required one with no `default` logs a `console.warn` on mount.

`choices` is required on `choice` and `multi_choice`: a non-empty list of strings or finite numbers, or of `{ value, label? }`, with no empty or duplicate values, and not mixing strings and numbers. A `multi_choice` value is a list in any order with no duplicates, and all its errors show on the Field itself.

**Empty** means `undefined`, `null`, `''`, a whitespace-only string or `[]`; `0` and `false` are values. An empty Field has no key in the output and skips its Rules; if required, it reports `Required`. A value of any other type is reported with Valibot's message, such as `Invalid type: Expected string but received 5`.

### `object`

Nests its Fields' values under its `name`: `{ "type": "object", "name": "address", "components": [...] }` outputs `address: { ... }`. It takes `label`, `description`, `widget`, `visible`, `disabled`, `colSpan` and a non-empty `components`, but no `required`, `rules` or `default`. It always keeps its key, as at least `{}`, even while Inactive. Its default Widget is a `fieldset` named by its label.

A list submitted where an object belongs, for an `object`, a Repeater row or the whole input, even an empty one, is an error at that path: `Invalid type: Expected Object but received Array`.

### `repeater`

A list of rows, each an object made from its `components` (the template), in its own data scope. It takes the keys of `object`, plus `rules` (`min_items`, `max_items`, which count rows) and `default`.

A `default` is a non-empty list of rows, such as `[{}]` for one empty row. Each row may only use the template's names, each value must be a valid `default` for its Field, and the list must pass the Repeater's Rules. A key a row leaves out takes its Field's own `default`. Inside a row, a nested Repeater may hold an empty list, `inner: []`, for a row with no inner rows; its Rules, such as `min_items`, still apply.

It always keeps its key, as at least `[]`. Errors carry the row index: `['contacts', 1, 'name']`. Row errors are reported before `max_items`, which only shows once every row is valid. The default Widget is a `fieldset` with a group per row (Move up, Move down, Remove) and an Add button, disabled at `max_items`.

### Custom Field Types

A `type` registered with [`defineFieldType`](guide.md#custom-field-types-and-rules). It takes the value Field keys above except `rules`, plus `placeholder` and its own options, flat on the node.

## Rules

Each Rule is `{ type, requirement?, message? }`. A Rule on a Field Type it doesn't apply to is a load error.

| Rule                       | Applies to                 | `requirement`                                    | Fails when                           |
| -------------------------- | -------------------------- | ------------------------------------------------ | ------------------------------------ |
| `email`                    | `text`                     | none                                             | not an email address                 |
| `url`                      | `text`                     | none                                             | not a URL of any scheme              |
| `min_length`, `max_length` | `text`                     | a non-negative integer                           | its `length` is smaller or larger    |
| `min_value`, `max_value`   | `number`, `date`           | a number, or a `YYYY-MM-DD` date on a date Field | smaller or larger, or earlier, later |
| `integer`                  | `number`                   | none                                             | not a whole number                   |
| `accepted`                 | `boolean`                  | none                                             | `false`                              |
| `min_items`, `max_items`   | `multi_choice`, `repeater` | a non-negative integer                           | fewer or more items or rows          |

`message` replaces Valibot's message for that Rule. A Field's Rules run in Definition order and stop at the first that fails, so a Field shows one Rule error at a time, and a Rule after a failed one never runs. Rules only run on a non-empty value, so `accepted` without `required` passes an untouched checkbox: an unticked box is empty, and an empty value skips every Rule. Add `required` to reject it. `url` accepts any scheme the platform's URL parser accepts, `javascript:` included. There is no `regex` Rule; see [custom Rules](guide.md#custom-field-types-and-rules).

## Conditions

`visible` (every Component), `disabled` (every Field) and `required` (value Fields) take a Condition:

- a leaf `{ "field": "country", "operator": "eq", "value": "VN" }`;
- a group `{ "all": [...] }` or `{ "any": [...] }`, each non-empty, or `{ "not": ... }`;
- nested at most 8 levels, the leaf included.

`field` is a reference from the Component's data scope: names joined by `.` reach into `object`s, and each leading `../` steps out of an `object` or Repeater row. A reference never reaches into a Repeater's rows. It must name a Field.

| Field `type`                     | Operators                                         |
| -------------------------------- | ------------------------------------------------- |
| `text`, `choice`                 | `eq`, `neq`, `in`, `not_in`, `empty`, `not_empty` |
| `number`, `date`                 | the same, and `gt`, `gte`, `lt`, `lte`            |
| `boolean`                        | `eq`, `neq`, `empty`, `not_empty`                 |
| `multi_choice`                   | `contains`, `empty`, `not_empty`                  |
| `repeater`                       | `empty`, `not_empty`                              |
| `object`                         | none                                              |
| a custom type with `conditionAs` | the row it names; otherwise `empty`, `not_empty`  |

`value` must fit the Field read: a `choice` value is one of its `choices`, a `text` value is a non-empty string (use `empty` for no value), a `date` value a real date. `in` and `not_in` take a non-empty list; `empty` and `not_empty` take none. Comparisons are strict, with no trimming or type conversion. When the Field read is empty or holds a wrongly typed value, every comparison is false, so `neq` and `not_in` are true.

A Field hidden or disabled, itself or through a Component around it, is Inactive: not validated, not in the output, and read as empty by Conditions. An Inactive `object` or Repeater outputs `{}` or `[]` and skips its Rules.

Load errors: a reference to no Field, an operator or value that doesn't fit, and a cycle through `visible` or `disabled`. `required` only reads values, so two Fields may require each other.

The Fluent Builder writes Conditions with `all`, `any`, `not`, `eq`, `neq`, `isIn` (`in`), `notIn` (`not_in`), `gt`, `gte`, `lt`, `lte`, `contains`, `isEmpty` (`empty`) and `notEmpty` (`not_empty`).

## Layouts and Content

| `type`    | Keys                                                       | Notes                                                                   |
| --------- | ---------------------------------------------------------- | ----------------------------------------------------------------------- |
| `section` | `label`, `description`, `columns`, `visible`, `colSpan`    | A `fieldset` with a `legend` when labelled, else a `div`.               |
| `tabs`    | `visible`, `colSpan`; `components` holds one `tab` or more | A WAI-ARIA tab list. Every panel stays mounted, so its Fields validate. |
| `tab`     | `label` (required), `description`, `columns`, `visible`    | Only directly inside `tabs`. Hidden Tabs leave the list.                |
| `page`    | `label` (required), `description`, `columns`, `visible`    | Only in the root `pages`. Its label names its focusable group.          |
| `content` | `text` (required), `widget`, `visible`, `colSpan`          | Shows `text` as plain text, never as HTML.                              |

Every Layout takes a `components` list, which may be empty except on `tabs`. A Layout adds no data path: moving a Field in or out of one changes neither its path nor the output.

Inside a Layout with `columns`, every child except a `tab` or `page` may take `colSpan`, at most `columns`. The default grid is an inline CSS grid whose column count falls back from the variable `--af-columns`, so a stylesheet can change it per screen size. A hidden child takes no cell.

## Editor support

`@auto-formisch/core` ships a JSON Schema (draft-07) for each format version, at `schema/v<version>.json` in the package. Point a Definition's `$schema` at it for autocomplete, hover help and errors in an editor:

<!-- check: definition -->

```json
{
  "$schema": "https://cdn.jsdelivr.net/npm/@auto-formisch/core/schema/v1.json",
  "version": 1,
  "components": []
}
```

The URL is the schema's `$id` and stays the same across releases: a package keeps shipping `schema/v1.json` after later format versions are added. Offline, use the installed copy, such as `./node_modules/@auto-formisch/core/schema/v1.json` (with pnpm, only when `@auto-formisch/core` is a direct dependency).

The loader is the one judge of a Definition. The schema catches most mistakes, but some only the loader sees: duplicate names, a `colSpan` wider than its parent's `columns`, Condition references, operators and values that depend on the Field read, cycles, a `default` that fails its Rules or `choices`, and impossible dates such as `2023-02-29`.

The schema describes only the built-ins, and takes any other `type` or Rule name loosely, as a custom one: `"type": "txet"` is not flagged in the editor, and only `compile` rejects it. An unknown `type` must still look like a custom Field (a lower-case `type`, a `name`, no `rules`, the shared Field keys typed as on built-ins); its options can be anything. An unknown Rule must still be `{ type, requirement?, message? }` on a built-in value Field other than a `repeater`.

## Core API

`@auto-formisch/core` runs anywhere Valibot does, with no React, DOM, Node API or Formisch. `@auto-formisch/react` re-exports all of it.

| Export                                        | What it does                                                                                              |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `compile(definition, { fieldTypes, rules }?)` | Loads and checks a Definition, and returns a `CompiledForm`. Throws `DefinitionError`.                    |
| `lock(compiled, values)`                      | Returns a new `CompiledForm` with Locked Fields, by data path. Throws `LockError`.                        |
| `validateForm(compiled, input, { lang }?)`    | Validates in one request's language. Returns `{ value }` or `{ errors: { message, path }[] }`.            |
| `defineFieldType`, `defineRule`               | Register a custom Field Type or Rule. Throw `TypeError` for an invalid registration.                      |
| `setRequiredMessage(message, lang?)`          | Sets the required message for a language, or with no language; `deleteRequiredMessage(lang?)` removes it. |
| `shownPages(compiled, input)`                 | The indexes of the Wizard Pages shown for `input`.                                                        |
| `pageOf(compiled, path)`                      | The index of the Page holding the Field at a data path.                                                   |
| `pageErrors(compiled, errors, pages)`         | The errors on those Pages, plus errors no Page holds.                                                     |
| `DefinitionError`, `LockError`                | Errors with `errors: { message, path }[]`.                                                                |

A `CompiledForm` has:

| Member              | What it is                                                                                                        |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `['~standard']`     | A Standard Schema. `validate(input)` is synchronous and returns `{ value }` or `{ issues: { message, path }[] }`. |
| `definition`        | The loaded Definition: a deep-frozen copy holding only the checked keys, in the author's order.                   |
| `schema`            | The Valibot schema, for Formisch. Validate with `validateForm` or `~standard`, never raw `v.safeParse` issues.    |
| `defaults`          | The input a new form starts with; a fresh copy on every read.                                                     |
| `normalize(record)` | `{ input, warnings }`: a record shaped for the form, as `initialInput` does it.                                   |
| `newRow(repeater)`  | A new row for a Repeater, from its Fields' defaults.                                                              |
| `conditions`        | The Condition evaluator the schema uses, for Renderers.                                                           |
| `locked`            | The Locked Fields and their values; empty unless the form came from `lock`.                                       |

Fluent Builder functions, each its own export:

- Components: `text`, `number`, `boolean`, `date`, `choice`, `multiChoice`, `object`, `repeater`, `section`, `grid` (a `section` with `columns`), `tabs`, `tab`, `page`, `content`, and the roots `form` and `wizard`.
- Metadata: `label`, `description`, `placeholder`, `widget`, `columns`, `colSpan`, `defaultValue`.
- Settings: `required()`, `required(message)`, `required(condition, message?)`, `visible(condition)`, `disabled()`, `disabled(condition)`.
- Rules: `email`, `url`, `minLength`, `maxLength`, `minValue`, `maxValue`, `integer`, `accepted`, `minItems`, `maxItems`, each with an optional `message`.
- Types: `InferOutput<typeof definition>`, `TypedDefinition`, `InferFieldValue` and `InferFieldNode` for custom types.

## React API

`<AutoForm>` props:

| Prop           | Value                                                                                                                                               |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `form`         | The result of `compile` or `lock`. Required. Change the React `key` to change it.                                                                   |
| `onSubmit`     | Called with the valid output. May return `{ errors: { message, path }[] }`, or a Promise of it. A thrown error's message shows in the error region. |
| `initialInput` | A record to edit, read at mount. Replaces every `default`.                                                                                          |
| `store`        | The store from `useAutoForm(form)`. Not with `initialInput`.                                                                                        |
| `widgets`      | Widgets by name, merged over the defaults.                                                                                                          |
| `layouts`      | `section`, `tabs`, `tab` and `page` Layouts, merged over the defaults.                                                                              |
| `fieldWrapper` | The Field Wrapper.                                                                                                                                  |
| `overrides`    | `widget`, `label`, `description` and `placeholder` by data path.                                                                                    |
| `labels`       | `submit`, `next`, `back`, `add`, `remove`, `moveUp`, `moveDown`.                                                                                    |
| `actions`      | `(props: ActionsProps) => ReactNode`, drawn in place of the default buttons.                                                                        |
| `id`           | Set on the `form` element, so buttons outside it can use `form="id"`.                                                                               |

- `useAutoForm(form, { initialInput }?)`: the Formisch store `<AutoForm>` would create, validating on submit and revalidating on input. A Wizard's store validates the whole form on every input, so its `isValid` and errors include Pages not reached yet.
- `useFormValue(path)`: inside a Widget, the value of another Field, `undefined` while Inactive.
- `AutoFormError`: thrown on mount for an unknown Widget, a wrong `appliesTo` or an unknown override, and when `form` changes without a remount.
- Contracts: `WidgetProps`, `InputProps`, `FieldWrapperProps`, `ObjectProps`, `RepeaterProps`, `RepeaterRow`, `ContentProps`, `LayoutProps`, `TabsLayoutProps`, `TabItem`, `PageLayoutProps`, `Wizard`, `WizardPage`, `ActionsProps`, `WidgetMap`, `WidgetEntry`, `WidgetDeclaration`, `WidgetPropsByType`, `Overrides`, `FieldOverride`, `Labels`, `SubmitResult`. The default Widgets and Layouts themselves are not exported.

## Errors

Every error is `{ message, path }`, where `path` is a list of keys and indexes.

| Error             | Thrown by                                                         | `path` points at                |
| ----------------- | ----------------------------------------------------------------- | ------------------------------- |
| `DefinitionError` | `compile`, `form`, `wizard`                                       | the key in the Definition       |
| `LockError`       | `lock`                                                            | the key of `values`             |
| `AutoFormError`   | `<AutoForm>`, `useAutoForm`                                       | the Definition location or prop |
| `TypeError`       | `defineFieldType`, `defineRule`, `compile` with bad registrations | (a plain message)               |

Validation issues from `~standard.validate` and the errors `onSubmit` returns use the same shape, with the data path of the Field: `['addresses', 1, 'street']`.
