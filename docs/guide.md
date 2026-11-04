# Guide

This guide takes you from an empty project to a working form, rendered in React and validated on a server, then through each part of Auto Formisch. The words with capitals, such as Field, Layout or Inactive, have one meaning each, given in [`GLOSSARY.md`](../GLOSSARY.md). Every key, type and function is listed in the [reference](reference.md).

1. [Install](#install)
2. [A first form](#a-first-form)
3. [Fields and Rules](#fields-and-rules)
4. [Layouts and Content](#layouts-and-content)
5. [Conditions](#conditions)
6. [Repeaters](#repeaters)
7. [Wizards](#wizards)
8. [Widgets and the Renderer](#widgets-and-the-renderer)
9. [Defaults and editing a record](#defaults-and-editing-a-record)
10. [Locked Fields](#locked-fields)
11. [Validation messages](#validation-messages)
12. [Custom Field Types and Rules](#custom-field-types-and-rules)
13. [Before you ship](#before-you-ship)

## Install

A React application installs the Renderer, which re-exports all of the core package, and its peers:

```sh
pnpm add @auto-formisch/react @formisch/react valibot react react-dom
```

A server or Worker that only validates installs the core package and Valibot. It loads no React, DOM, Node API or Formisch:

```sh
pnpm add @auto-formisch/core valibot
```

Both packages are ESM only, with one entry point. The peer ranges are `valibot ^1.5.0`, `@formisch/react ^1.2.0` and `react`/`react-dom ^19.2.0`.

## A first form

A form starts as a **Form Definition**: one versioned JSON document holding every Field, Layout, Rule and Condition of the form. You can store it in a database, write it by hand, or build it in TypeScript with the **Fluent Builder**. The same Definition drives the form in the browser and the validation on the server.

### Write the Form Definition

<!-- example: docs/examples/contact.json -->

```json
{
  "$schema": "https://cdn.jsdelivr.net/npm/@auto-formisch/core/schema/v1.json",
  "version": 1,
  "components": [
    { "type": "text", "name": "name", "label": "Name", "required": true },
    {
      "type": "text",
      "name": "email",
      "label": "Email address",
      "widget": "email",
      "required": true,
      "rules": [{ "type": "email", "message": "Enter a valid email address" }]
    },
    {
      "type": "choice",
      "name": "topic",
      "label": "Topic",
      "choices": [
        { "value": "sales", "label": "Sales" },
        { "value": "support", "label": "Support" }
      ]
    },
    {
      "type": "text",
      "name": "message",
      "label": "Message",
      "widget": "textarea",
      "rules": [{ "type": "max_length", "requirement": 2000 }]
    }
  ]
}
```

- `version` is the format version; this package reads `1`. See the [version policy](../README.md#versions).
- `components` is the tree of Components. Each has a `type`; a Field also has a `name`, which is its key in the submitted data.
- `type` says what data a Field holds and how it is validated. `widget` only says how the Renderer draws it: `"widget": "email"` draws an email input but checks nothing, and the `email` Rule checks the address.
- A Field is optional unless it says `"required": true`.
- `$schema` is optional. It points an editor at the published JSON Schema, for autocomplete and errors as you type (see [Editor support](reference.md#editor-support)).

### Render it with `<AutoForm>`

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

`compile` checks the Definition and builds its validation once; call it outside render, or memoize it. `<AutoForm>` renders native HTML with no stylesheet. It validates when the user submits, then revalidates as they correct their input, and after a failed submit it focuses the first Field with an error. `onSubmit` runs only with valid output.

`onSubmit` may return `{ errors }`, each `{ message, path }`: an error shows on the Field its `path` names when that Field is shown and active, and every other one in the general error region at the top of the form, including one for a hidden or disabled Field, which is Inactive. These server errors disappear at the next input anywhere in the form, because Formisch then revalidates the whole form and replaces them.

### Validate on the server

<!-- example: docs/examples/contact-server.ts#server -->

```ts
import { compile } from '@auto-formisch/core';
import definition from './contact.json';
import { saveContact } from './app';

const form = compile(definition);

export async function handleContact(request: Request): Promise<Response> {
  const result = form['~standard'].validate(await request.json());
  if (result.issues) return Response.json({ errors: result.issues }, { status: 422 });
  await saveContact(result.value);
  return new Response(null, { status: 204 });
}
```

A compiled form is a [Standard Schema](https://standardschema.dev/). `form['~standard'].validate(input)` is synchronous and returns `{ value }` or `{ issues }`, where each issue is `{ message, path }` with a plain key path such as `['contacts', 1, 'email']`. The server runs the same checks as the form, Conditions included, so for the same input both give the same result.

`value` holds only the keys the Definition declares, so an extra key in the body, such as `isAdmin`, never reaches your database. An empty optional Field has no key at all.

### The same form with the Fluent Builder

<!-- example: docs/examples/contact-builder.tsx#builder -->

```tsx
import {
  AutoForm,
  choice,
  compile,
  email,
  form,
  label,
  maxLength,
  required,
  text,
  widget,
  type InferOutput,
} from '@auto-formisch/react';

export const contact = form([
  text('name', [label('Name'), required()]),
  text('email', [label('Email address'), required(), email('Enter a valid email address')]),
  choice(
    'topic',
    [
      { value: 'sales', label: 'Sales' },
      { value: 'support', label: 'Support' },
    ],
    [label('Topic')],
  ),
  text('message', [label('Message'), widget('textarea'), maxLength(2000)]),
]);

export type Contact = InferOutput<typeof contact>;
// { name: string; email: string; topic?: 'sales' | 'support'; message?: string }

const contactForm = compile(contact);

export function ContactForm({ onSend }: { onSend: (contact: Contact) => void }) {
  return <AutoForm form={contactForm} onSubmit={(output) => onSend(output)} />;
}
```

The Fluent Builder is written like Valibot: a function per Component, and a pipe of items for Rules (`email`, `maxLength`), metadata (`label`, `widget`) and Conditions. `form()` returns the plain Definition data, deep-equal to the JSON above without `$schema`, so you can store it or send it to a Worker as is. It runs the same loader as JSON and throws the same errors.

What the Builder adds is types. `compile` infers the output, and `onSubmit` receives it: a Field is optional unless it is `required()` with no Condition on it or on a Component around it. A pipe item only fits the Fields it applies to, so `boolean('agree', [email()])` fails to compile. `email()` also sets the `email` Widget unless the pipe names another.

### When a Definition is wrong

<!-- check: invalid -->

```json
{ "version": 1, "components": [{ "type": "text", "name": "email", "requried": true }] }
```

`compile` throws a `DefinitionError` whose `errors` lists every problem at once, each `{ message, path }`, here `Unknown key "requried"` at `['components', 0, 'requried']`. Unknown keys, types, Rules and versions are always errors, so a typo can never silently turn validation off. Loading never evaluates code: a Definition holds data only, never functions or regular expressions.

## Fields and Rules

The built-in Field Types are `text`, `number`, `boolean`, `choice`, `multi_choice` and `date`, which each hold one value, and `object` and `repeater`, which hold other Fields. Each has a default Widget, and some have others you pick with `widget`, such as `textarea` or `radio`; the [reference](reference.md#field-types) lists them.

**Empty** means `undefined`, `null`, `''`, a string of only whitespace, or `[]`; `0` and `false` are values. An empty Field has no key in the output and skips its Rules. If it is required, it reports `Required` (or its `requiredMessage`) instead.

A **Rule** is a constraint on a Field's value: `{ "type": "min_length", "requirement": 3, "message": "Too short" }`. The built-in Rules are `email`, `url`, `min_length`, `max_length`, `min_value`, `max_value`, `integer`, `accepted`, `min_items` and `max_items`, each for some Field Types only. There is no `regex` Rule, so that a stored Definition can never make a server run a slow regular expression; write a [custom Rule](#custom-field-types-and-rules) for a pattern.

A Field's Rules run in Definition order and stop at the first that fails: a Field shows one Rule error at a time, and a Rule after a failed one never runs.

Two Rules need care:

- Rules skip empty values, so `accepted` alone lets an unticked checkbox through. Use it with `required`, as the [Wizard example](#wizards) does.
- `url` accepts any scheme the platform's URL parser accepts, `javascript:` included. Check the scheme yourself before you render a submitted URL as a link.

## Layouts and Content

<!-- check: components -->

```json
[
  {
    "type": "section",
    "label": "Delivery",
    "columns": 2,
    "components": [
      { "type": "text", "name": "street", "label": "Street", "colSpan": 2 },
      { "type": "text", "name": "city", "label": "City" },
      { "type": "text", "name": "zip", "label": "Postcode" }
    ]
  },
  {
    "type": "tabs",
    "components": [
      { "type": "tab", "label": "Card", "components": [{ "type": "text", "name": "card" }] },
      { "type": "tab", "label": "Invoice", "components": [{ "type": "text", "name": "vat" }] }
    ]
  },
  { "type": "content", "text": "We deliver on weekdays only." }
]
```

A Layout (`section`, `tabs`, `tab`, and `page` for Wizards) arranges Components and adds nothing to the data: `street` above is submitted as `street`, not `delivery.street`, so you can move a Field in or out of a Layout without changing what is stored. A Field's `name` therefore has to be unique across all the Layouts of its data scope.

`columns` on a `section`, `tab` or `page` lays its children out in a grid, and `colSpan` widens one child. The default grid reads its column count from the CSS variable `--af-columns` when set, so a media query can change it. The default Tabs keep every panel mounted, so the Fields of a closed Tab are still validated, and a Tab's name shows how many Fields in it have errors, such as `Invoice (1)`. Content shows its `text` as plain text, never as HTML.

## Conditions

A **Condition** decides whether a Component is visible, or whether a Field is required or disabled, from the values of other Fields:

<!-- example: docs/examples/conditions.json -->

```json
{
  "version": 1,
  "components": [
    {
      "type": "choice",
      "name": "kind",
      "label": "I am",
      "choices": ["person", "company"],
      "required": true
    },
    { "type": "choice", "name": "country", "label": "Country", "choices": ["VN", "US"] },
    {
      "type": "text",
      "name": "taxId",
      "label": "Tax ID",
      "required": true,
      "visible": {
        "all": [
          { "field": "kind", "operator": "eq", "value": "company" },
          { "field": "country", "operator": "eq", "value": "VN" }
        ]
      }
    },
    {
      "type": "text",
      "name": "email",
      "label": "Email",
      "required": { "field": "phone", "operator": "empty" }
    },
    {
      "type": "text",
      "name": "phone",
      "label": "Phone",
      "required": { "field": "email", "operator": "empty" }
    }
  ]
}
```

The same form with the Fluent Builder, whose Condition helpers return the same JSON:

<!-- example: docs/examples/conditions.ts#builder -->

```ts
import {
  all,
  choice,
  compile,
  eq,
  form,
  isEmpty,
  label,
  required,
  text,
  visible,
} from '@auto-formisch/core';

export const signup = form([
  choice('kind', ['person', 'company'], [label('I am'), required()]),
  choice('country', ['VN', 'US'], [label('Country')]),
  text('taxId', [
    label('Tax ID'),
    required(),
    visible(all(eq('kind', 'company'), eq('country', 'VN'))),
  ]),
  text('email', [label('Email'), required(isEmpty('phone'))]),
  text('phone', [label('Phone'), required(isEmpty('email'))]),
]);
// { kind: 'person' | 'company'; country?: 'VN' | 'US'; taxId?: string; email?: string; phone?: string }
```

- A Condition is a leaf `{ field, operator, value }`, or a group `{ all: [...] }`, `{ any: [...] }` or `{ not: ... }`, nested at most 8 levels. Which operators a leaf may use depends on the Field it reads; the [operator table](reference.md#conditions) lists them.
- `visible` works on every Component, `disabled` on every Field, and `required` on value Fields. `disabled` and `required` also take `true` or `false`.
- A Field that is hidden or disabled, itself or through a Component around it, is **Inactive**. An Inactive Field is not validated, is left out of the output, and reads as empty to every Condition. Its value stays in the form, so it comes back when the Field reappears.
- `email` and `phone` above require each other only while the other is empty: "at least one of the two". `required` only reads values, so this is not a cycle. A cycle through `visible` or `disabled`, a Condition reading a Field that doesn't exist, and an operator or value that doesn't fit the Field are load errors.

Because the server evaluates the same Conditions, a value a client forges into an Inactive Field changes nothing:

<!-- example: docs/examples/conditions.ts#forged -->

```ts
const signupForm = compile(signup);

export const forged = signupForm['~standard'].validate({
  kind: 'person',
  taxId: 'forged',
  email: 'ada@example.com',
});
// { value: { kind: 'person', email: 'ada@example.com' } }: taxId is Inactive, so it is dropped.
```

## Repeaters

A **Repeater** is a Field holding a list of rows, each an object built from the same template of Components:

<!-- example: docs/examples/repeater.json -->

```json
{
  "version": 1,
  "components": [
    { "type": "choice", "name": "country", "label": "Country", "choices": ["VN", "US"] },
    {
      "type": "repeater",
      "name": "addresses",
      "label": "Addresses",
      "default": [{}],
      "rules": [
        { "type": "min_items", "requirement": 1, "message": "Add at least one address" },
        { "type": "max_items", "requirement": 3 }
      ],
      "components": [
        { "type": "text", "name": "street", "label": "Street", "required": true },
        {
          "type": "text",
          "name": "ward",
          "label": "Ward",
          "visible": { "field": "../country", "operator": "eq", "value": "VN" }
        },
        { "type": "boolean", "name": "billing", "label": "Use for invoices" },
        {
          "type": "text",
          "name": "vatNumber",
          "label": "VAT number",
          "required": true,
          "visible": { "field": "billing", "operator": "eq", "value": true }
        }
      ]
    }
  ]
}
```

- Each row is its own data scope. Inside it, `billing` is the same row's Field, and `../country` steps out of the row to the Field beside the Repeater. A Condition can never reach into another row.
- `default: [{}]` starts the form with one empty row. A row added later starts from its Fields' own `default`s.
- `min_items` and `max_items` count rows. The default Widget disables Add at `max_items`, and never blocks Remove; `min_items` reports on validation instead. `max_items` is only reported once every row is valid.
- Errors carry the row index, such as `['addresses', 1, 'street']`. Values and errors stay with their row when it moves.
- A Repeater is never `required` and always keeps its key: an empty list outputs `addresses: []`. The same goes for `object`, which nests its Fields under its `name` and outputs at least `{}`.
- Repeaters nest: a row's template can hold another Repeater.

## Wizards

A **Wizard** is a form whose root holds `pages` instead of `components`, shown one **Page** at a time:

<!-- example: docs/examples/wizard.tsx#builder -->

```tsx
import {
  accepted,
  boolean,
  choice,
  compile,
  email,
  eq,
  label,
  page,
  required,
  text,
  visible,
  wizard,
} from '@auto-formisch/react';

export const signup = wizard([
  page('Account', [
    text('email', [label('Email'), required(), email()]),
    choice('plan', ['free', 'team'], [label('Plan'), required()]),
  ]),
  page('Team', [text('team', [label('Team name'), required()])], [visible(eq('plan', 'team'))]),
  page('Confirm', [
    boolean('terms', [
      label('I accept the terms'),
      required('Accept the terms to continue'),
      accepted('Accept the terms to continue'),
    ]),
  ]),
]);

export const signupForm = compile(signup);
```

- **Next** validates and stops on the open Page if it has errors; **Back** keeps every value and validates nothing. Only Pages the user has tried to leave show their errors.
- A Page hidden by a Condition leaves the navigation, and its Fields are Inactive. Choosing `free` above skips `Team`.
- Only the open Page is mounted. On a Page change, focus moves to the Page's group, named by its label. A failed final submit opens the first Page with an error.
- All Pages share one data scope, so a `name` is unique across Pages. On the server a Wizard is one whole form: `signupForm['~standard'].validate(body)` checks every Page, so skipping a Page in the client gains nothing.
- There is no stepper and no way to open the form on a later Page: it always starts on the first one, even when editing a record. Formisch's `reset` doesn't touch the Wizard's state; change the `key` of `<AutoForm>` to start again.

The `actions` slot draws the buttons, and gets the Wizard's navigation:

<!-- example: docs/examples/wizard.tsx#actions -->

```tsx
import { AutoForm, type ActionsProps, type FormOutput } from '@auto-formisch/react';

function Navigation({ wizard, isSubmitting }: ActionsProps) {
  if (wizard === null) return <button type="submit">Send</button>;
  const position = wizard.pages.findIndex((page) => page.isCurrent) + 1;
  return (
    <nav aria-label="Pages">
      <p>
        Page {position} of {wizard.pages.length}
      </p>
      {!wizard.isFirst && (
        <button type="button" onClick={wizard.back}>
          Back
        </button>
      )}
      {/* A native submit before the last Page runs "Next". */}
      <button type="submit" disabled={isSubmitting}>
        {wizard.isLast ? 'Sign up' : 'Continue'}
      </button>
    </nav>
  );
}

export function SignupWizard({ onDone }: { onDone: (output: FormOutput) => void }) {
  return (
    <AutoForm form={signupForm} actions={(props) => <Navigation {...props} />} onSubmit={onDone} />
  );
}
```

`wizard.pages` holds only the shown Pages, each with its `index` in the Definition, `label`, `errorCount` and `isCurrent`. `wizard.goTo(index)` moves to any shown Page, validating the Pages on the way when it moves forward. The `page` Layout gets the same `wizard` object, for a stepper drawn above the Fields. The core functions `shownPages`, `pageOf` and `pageErrors` let a server check one Page of a Wizard, for a draft saved Page by Page.

## Widgets and the Renderer

The **Renderer** is `<AutoForm>` and the parts it draws with: a **Widget** per Field, a **Field Wrapper** around each Widget for its label, description and errors, and a Layout per `section`, `tabs`, `tab` and `page`. Each can be replaced on its own without touching the Definition or its validation.

A Widget draws only the control:

<!-- example: docs/examples/widgets.tsx#widget -->

```tsx
import type { TextField, WidgetProps } from '@auto-formisch/react';

export function TextInput({
  value,
  onChange,
  inputProps,
  disabled,
  readOnly,
  node,
}: WidgetProps<string, TextField>) {
  return (
    <input
      {...inputProps}
      className="input"
      placeholder={node.placeholder}
      value={value ?? ''}
      disabled={disabled}
      readOnly={readOnly}
      // Emit `undefined` when empty; the Renderer never sees an empty string.
      onChange={(event) => onChange(event.currentTarget.value || undefined)}
    />
  );
}
```

- `inputProps` goes on the focusable control. It carries the `id` the label points at, the ref used to focus the Field after a failed submit, and the ARIA state: `aria-invalid`, `aria-required` and `aria-describedby`.
- `value` is the Field's value or `undefined`. A Widget converts its own values, such as a string to a number, and calls `onChange(undefined)` when it is empty.
- `errors` are ready to show, `disabled` means Inactive, and `readOnly` means [Locked](#locked-fields). `node` is the Field from the Definition, after `overrides`.

A Field Wrapper draws the frame:

<!-- example: docs/examples/widgets.tsx#wrapper -->

```tsx
import type { FieldWrapperProps } from '@auto-formisch/react';

export function Wrapper(props: FieldWrapperProps) {
  const { label, description, errors, required, group, children } = props;
  const title = required ? `${label} *` : label;
  const rest = (
    <>
      {description !== undefined && <p id={props.descriptionId}>{description}</p>}
      {/* Always rendered, so that new errors are announced. */}
      <div id={props.errorsId} aria-live="polite" className="errors">
        {errors.map((error, index) => (
          <p key={index}>{error}</p>
        ))}
      </div>
    </>
  );
  return group ? (
    <fieldset className="field">
      <legend>{title}</legend>
      {children}
      {rest}
    </fieldset>
  ) : (
    <div className="field">
      <label htmlFor={props.labelFor}>{title}</label>
      {children}
      {rest}
    </div>
  );
}
```

`group` is set for Widgets made of several controls, such as radios or checkboxes, which need a `fieldset` and `legend` rather than `label for`. Keep `descriptionId` and `errorsId` on the elements they name, since the control's `aria-describedby` points at them.

Pass them to `<AutoForm>`:

<!-- example: docs/examples/widgets.tsx#autoform -->

```tsx
import { AutoForm, compile, form, label, object, required, text } from '@auto-formisch/react';

const profile = compile(
  form([
    text('name', [label('Name'), required()]),
    object('address', [text('city', [label('City')])], [label('Address')]),
  ]),
);

export function ProfileForm({ onSave }: { onSave: (output: object) => void }) {
  return (
    <AutoForm
      form={profile}
      widgets={{ text: TextInput }}
      fieldWrapper={Wrapper}
      overrides={{ 'address.city': { label: 'Town', placeholder: 'Hà Nội' } }}
      labels={{ submit: 'Lưu' }}
      onSubmit={onSave}
    />
  );
}
```

- `widgets` merges over the default Widgets. A Field uses the entry named by its `widget`, or else its `type`, so `{ text: TextInput }` replaces every text input, and `{ stars: Stars }` adds a Widget a Field picks with `"widget": "stars"`. An entry is a component, or `{ component, group, appliesTo }`, where `appliesTo` lists the Field Types it can draw. In TypeScript, an entry named after a built-in type must take that type's props.
- `layouts` merges over the default `section`, `tabs`, `tab` and `page` Layouts, and `fieldWrapper` replaces the default Field Wrapper.
- `overrides` changes a Field's `widget`, `label`, `description` or `placeholder` on this screen only, by data path without Repeater indices (`'pets.kind'` is every row's `kind`). It never changes validation, so the server's result stays the same.
- `labels` sets the text of the default buttons (`submit`, `next`, `back`, `add`, `remove`, `moveUp`, `moveDown`) and `invalidNumber`, the error of a number input holding text the browser can't read as a number, such as `1e` (default `Enter a number`). `actions` replaces the action area.
- On mount, `<AutoForm>` checks the whole tree, including Fields that are hidden or on other Pages, and throws an `AutoFormError` listing every unknown Widget name, Widget whose `appliesTo` leaves out the Field's type, and unknown `overrides` path, as `{ message, path }`. A mistake shows the first time the form renders, not when a user first reveals the Field.
- `useAutoForm(form)` returns the Formisch store `<AutoForm>` would create, for calling Formisch's own functions such as `reset`, `setInput` or `submit`; pass it back as `<AutoForm store>`. Formisch's `focus` does nothing on it: the Renderer keeps the Fields' elements itself, so that a failed submit moves focus once, to the first error in Definition order.
- `useFormValue(path)` lets a Widget read another Field, with the path syntax of Conditions, such as `useFormValue('../country')` in a Repeater row. Like a Condition, it reads an Inactive Field as `undefined`, a Locked Field as its Locked value, and a whole `object` or Repeater without its Inactive Fields. The Widget re-renders on every input of the form, so use it where it is needed.

## Defaults and editing a record

<!-- example: docs/examples/edit-record.tsx#form -->

```tsx
import {
  AutoForm,
  choice,
  compile,
  defaultValue,
  form,
  label,
  repeater,
  required,
  text,
  useAutoForm,
  widget,
  type InferOutput,
} from '@auto-formisch/react';
import { customers, type Customer } from './app';

const customer = form([
  text('name', [label('Name'), required()]),
  choice('country', ['VN', 'US'], [label('Country'), defaultValue('VN')]),
  repeater('contacts', [
    // Keeps each row's id with no UI, so the server can match rows after a reorder.
    text('id', [widget('hidden')]),
    text('email', [label('Email'), required()]),
  ]),
]);
export type CustomerOutput = InferOutput<typeof customer>;

export const customerForm = compile(customer);
```

A `default` (`defaultValue` in the Builder) only fills in a new form. The server never fills one in, and a value the user clears stays empty. A `default` must be a valid value: non-empty, of the Field's type and passing its Rules, or loading fails. `compiled.defaults` is the input a new form starts with, a fresh copy on every read.

To edit a stored record, pass it as `initialInput`:

<!-- example: docs/examples/edit-record.tsx#edit -->

```tsx
// Edit a stored record. `initialInput` is read only at mount, so a new key switches record.
export function EditCustomer(props: {
  record: Customer;
  onSave: (output: CustomerOutput) => void;
}) {
  return (
    <AutoForm
      key={props.record.id}
      form={customerForm}
      initialInput={props.record}
      onSubmit={props.onSave}
    />
  );
}

// A new record with some values known in advance, such as from the URL.
export function NewCustomer(props: {
  prefill: Partial<CustomerOutput>;
  onSave: (output: CustomerOutput) => void;
}) {
  const initialInput = { ...customerForm.defaults, ...props.prefill };
  return <AutoForm form={customerForm} initialInput={initialInput} onSubmit={props.onSave} />;
}
```

- `initialInput` replaces every `default`: a key the record lacks starts empty, since the user may have cleared it on purpose. A Repeater row added later still starts from its Fields' defaults.
- It is read only when the form mounts. Change the React `key` to switch record, and likewise to switch form: a new `form` without a remount throws an `AutoFormError`.
- A record saved under an older Definition still opens. Every `object` and Repeater gets its full shape, keys with no Field are dropped, and a value of the wrong JavaScript type for its Field, such as a number in a `text`, starts empty with a `console.warn`. For a custom Field Type, the type is what passes its schema's type checks, leaving out constraints such as `v.maxValue`. A value of the right type is kept even when it is outside `choices` or breaks a Rule, so that submitting reports it. The accepted cost: an optional Field whose stored value had the wrong type silently loses it on the next save.
- The `hidden` Widget keeps a value with no UI and no Field Wrapper, such as a row's `id`. The Field stays active and in the output, and its errors show in the general error region, named by the Field's label or name, such as `id: Required`. A required `hidden`-Widget Field with no `default` logs a `console.warn` on mount, since a user can never fill it in: one outside a Repeater only while the starting input has no value for it, one in a Repeater's rows always, as Add starts a row without it. The client can still change it, so check on the server that the `id` belongs to the record.
- `useAutoForm(form, { initialInput })` takes it too; passing both `store` and `initialInput` to `<AutoForm>` throws.

### Replace, don't merge

`onSubmit`, like `validate` on the server, gets the full new state of every active Field. A cleared Field has no key, so the server must **replace** the keys the Definition manages rather than merge the output into the stored record. Merging, as a PATCH would, means a user can never clear a value.

<!-- example: docs/examples/edit-record.tsx#replace -->

```tsx
export function updateCustomer(id: string, body: unknown) {
  const stored = customers.get(id);
  if (stored === undefined) return { status: 404 };
  const result = customerForm['~standard'].validate(body);
  if (result.issues) return { status: 422, errors: result.issues };
  // Replace every key the Definition manages; keep only the application's own keys.
  customers.set(id, { id: stored.id, createdAt: stored.createdAt, ...result.value });
  return { status: 204 };
}
```

Keys outside the Definition, such as `id` and `createdAt` here, are the application's to keep. An Inactive Field is missing from the output too, so replacing erases the stored value of a `disabled` Field: to keep a value the user may not change, [lock](#locked-fields) it instead.

### Unsaved changes

Auto Formisch has no dirty-tracking API of its own. Read Formisch's `isDirty` from the store:

<!-- example: docs/examples/edit-record.tsx#dirty -->

```tsx
// The parent gives this component `key={record.id}`: `useAutoForm` reads `initialInput` once.
export function EditWithWarning(props: {
  record: Customer;
  onSave: (output: CustomerOutput) => void;
}) {
  const store = useAutoForm(customerForm, { initialInput: props.record });
  return (
    <>
      {store.isDirty && <p role="status">You have unsaved changes.</p>}
      <AutoForm form={customerForm} store={store} onSubmit={props.onSave} />
    </>
  );
}
```

`isDirty` can report a change where there is none, so use it for an "unsaved changes" warning, not to decide what to save:

- A value that is an object, such as a custom Field Type's, compares by reference: putting back an equal copy still counts as a change.
- A row removed and added again stays dirty.
- Formisch's `getDirtyPaths` names a whole list, never a row or an item: an edit to `contacts[1].email` gives `['contacts']`, and an edit to a `multi_choice` gives its own path. It cannot drive a diff of the output.

Formisch's `reset(store, { initialInput })` also works on the store, but skips the normalization above: an `object` or Repeater missing from the record becomes `undefined` rather than `{}` or `[]`.

## Locked Fields

A value the server knows for one record, such as whether a customer is a person or a company, can be **Locked**: the user sees it read-only and cannot change it, yet it still drives Conditions and appears in the output. Lock it with `lock(compiled, values)`, in one function the client and the server share:

<!-- example: docs/examples/lock.tsx#shared -->

```tsx
// company-form.ts: used by both the client and the server.
import {
  choice,
  compile,
  eq,
  form,
  label,
  lock,
  required,
  text,
  visible,
} from '@auto-formisch/core';
import type { Company } from './app';

const companyForm = compile(
  form([
    choice('type', ['person', 'company'], [label('Type')]),
    text('name', [label('Name'), required()]),
    text('taxId', [label('Tax ID'), required(), visible(eq('type', 'company'))]),
  ]),
);

// `company` comes from the database, never from the request or the URL.
export const formFor = (company: Company) => lock(companyForm, { type: company.type });
```

**The server must call `lock` too.** The client's lock only stops the Widget from changing the value; anyone can still send a request with another one. On the server, `lock` replaces whatever the body holds before Conditions run, so a forged `type` cannot hide or reveal `taxId`. A server that validates with the plain compiled form gets no protection.

<!-- example: docs/examples/lock.tsx#server -->

```tsx
import { companies } from './app';

export function updateCompany(id: string, body: unknown) {
  const stored = companies.get(id);
  if (stored === undefined) return { status: 404 };
  // The stored `type` replaces whatever the body holds, before Conditions run.
  const result = formFor(stored)['~standard'].validate(body);
  if (result.issues) return { status: 422, errors: result.issues };
  companies.set(id, { id: stored.id, ...result.value, type: stored.type });
  return { status: 204 };
}
```

**Never pass a value from client input to `lock`**, such as the request body, a URL parameter or a hidden Field: the lock would then trust exactly what it should guard against. Lock values the server has from its own data.

<!-- example: docs/examples/lock.tsx#client -->

```tsx
import { useMemo } from 'react';
import { AutoForm, type FormOutput } from '@auto-formisch/react';

export function EditCompany(props: { company: Company; onSave: (output: FormOutput) => void }) {
  const { company } = props;
  // A new lock result needs a new key, so both follow the record's id.
  const form = useMemo(() => formFor(company), [company.id]);
  return <AutoForm key={company.id} form={form} initialInput={company} onSubmit={props.onSave} />;
}
```

- Keys are data paths such as `'address.country'`, to value Fields outside Repeaters; there is no per-row lock. An empty value locks the Field empty. The Locked value beats `initialInput` and `default`.
- `lock` throws a `LockError` of `{ message, path }` for a path to an `object`, a Repeater or a Field inside one, an unknown path, a value of the wrong JavaScript type for its Field, or a form that is already Locked. Only the JavaScript type counts, the one its Widget relies on: a string for a `choice` or `date`, a finite number for a `number`, a list for a `multi_choice`, and for a custom Field Type whatever passes its schema's type checks. A record whose choice was later removed from the Definition, or whose value a newer Rule rejects, still locks to its value, which the output then holds as it is.
- A Locked Field skips `required` and its Rules: the application answers for the value, so an old record never blocks a user on a Field they cannot fix. A Condition can still make it Inactive, and it is then missing from the output like any Inactive Field.
- The default Widgets show it with native `readonly` (text, number, date) or, where HTML has none, native `disabled` (select, radio, checkbox, multi-choice), which also takes it out of the tab order. Widgets and the Field Wrapper get `readOnly: true`. A Widget that ignores `readOnly` still cannot change the value: the Renderer gives it the Locked value and drops its `onChange`.

## Validation messages

Messages go through Valibot; Auto Formisch has no catalog of its own. From highest priority:

1. A Rule's `message` and a Field's `requiredMessage` in the Definition.
2. Valibot's `setSpecificMessage`, then `setSchemaMessage`, then `setGlobalMessage`.
3. Valibot's defaults.

**Valibot's default messages are technical English**, such as `Invalid length: Expected >=3 but received 2` or `Invalid type: Expected string but received 5`. A form for end users should register its own messages, or install [`@valibot/i18n`](https://github.com/open-circle/valibot/tree/main/packages/i18n).

<!-- example: docs/examples/messages.ts#setup -->

```ts
import * as v from 'valibot';
import '@valibot/i18n/de';
import { setRequiredMessage } from '@auto-formisch/core';

// Once, at startup, on the client and on the server.
setRequiredMessage('This field is required'); // when no language is set
setRequiredMessage('Pflichtfeld', 'de');
v.setSpecificMessage(v.minLength, (issue) => `Tối thiểu ${issue.requirement} ký tự`, 'vi');

// In the browser, Formisch reads the global language.
v.setGlobalConfig({ lang: 'de' });
```

The required error is the exception: it resolves through `requiredMessage`, then `setRequiredMessage`, then `Required`, so `setGlobalMessage` and messages for `v.check` never reach it. Like Valibot's own, a message set for one language never falls back to another, nor to the one set with no language: with `lang: 'en'` and no English message registered, users see `Required`. `deleteRequiredMessage(lang?)` removes one.

`~standard.validate` takes no language and uses the global one. A server answering each request in its own language calls `validateForm(form, input, { lang })`, which returns `{ value }` or `{ errors }` of `{ message, path }`, the shape `onSubmit` may return. Never read raw issues from `v.safeParse(form.schema, ...)`: a required issue carries an internal value.

<!-- example: docs/examples/messages.ts#per-request -->

```ts
import { validateForm, type CompiledForm } from '@auto-formisch/core';

// On the server, each request in its own language.
export function validateIn(form: CompiledForm, input: unknown, lang: string) {
  return validateForm(form, input, { lang }); // { value } or { errors: [{ message, path }] }
}
```

## Custom Field Types and Rules

For values the built-in Field Types don't cover, register your own with `defineFieldType`, and for constraints the built-in Rules don't cover, `defineRule`. Neither touches React, so the server imports the same file:

<!-- example: docs/examples/extensions.tsx#define -->

```tsx
// extensions.ts: no React, so the server imports it too.
import * as v from 'valibot';
import { defineFieldType, defineRule } from '@auto-formisch/core';

export const rating = defineFieldType({
  type: 'rating',
  options: { max: v.pipe(v.number(), v.integer(), v.minValue(1)) },
  schema: (node) => v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(node.max)),
  conditionAs: 'number',
});

export const startsWith = defineRule({
  type: 'starts_with',
  appliesTo: ['text'],
  requirement: v.string(),
  check: (value, requirement) => value.startsWith(requirement),
  message: 'Wrong prefix',
});

export const extensions = { fieldTypes: [rating], rules: [startsWith] };
```

There is no global registry: pass the registrations to `compile`, and to `form` or `wizard` in the Builder. A Definition that uses a type or Rule you didn't pass throws on load, so a Rule is never silently skipped.

<!-- example: docs/examples/extensions.tsx#use -->

```tsx
import { compile, form, label, required, text } from '@auto-formisch/core';

export const review = compile(
  form(
    [
      rating('score', { max: 5 }, [label('Score'), required()]),
      text('code', [label('Voucher'), startsWith('VN')]),
    ],
    extensions,
  ),
  extensions,
);
// { score: number; code?: string }

// A stored JSON Definition needs the same registrations.
export const stored = compile(
  {
    version: 1,
    components: [
      { type: 'rating', name: 'score', label: 'Score', max: 5, required: true },
      { type: 'text', name: 'code', rules: [{ type: 'starts_with', requirement: 'VN' }] },
    ],
  },
  extensions,
);
```

The custom type's Widget goes to `<AutoForm widgets>` under the type's name, typed from the registration:

<!-- example: docs/examples/extensions.tsx#widget -->

```tsx
import type { Ref } from 'react';
import {
  AutoForm,
  type FormOutput,
  type InferFieldNode,
  type InferFieldValue,
  type WidgetProps,
} from '@auto-formisch/react';

type StarsProps = WidgetProps<InferFieldValue<typeof rating>, InferFieldNode<typeof rating>>;

function Stars({ value, onChange, inputProps, node, disabled, readOnly }: StarsProps) {
  const { id, ref, ...aria } = inputProps;
  const stars = Array.from({ length: node.max }, (_, index) => index + 1);
  return (
    <div role="radiogroup" id={id} aria-label={node.label ?? node.name} {...aria}>
      {stars.map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={value === star}
          disabled={disabled || readOnly}
          ref={star === 1 ? (ref as Ref<HTMLButtonElement>) : undefined}
          onClick={() => onChange(value === star ? undefined : star)}
        >
          {star} {star === 1 ? 'star' : 'stars'}
        </button>
      ))}
    </div>
  );
}

export function ReviewForm({ onSave }: { onSave: (output: FormOutput) => void }) {
  return <AutoForm form={review} widgets={{ rating: Stars }} onSubmit={onSave} />;
}
```

A custom Field Type:

- holds one JSON value (a string, number, boolean, list or object; no `Date` or `File`). Its options sit flat on the node, like `max` above, and are checked by their schemas on load; an option whose schema rejects `undefined` must be present.
- takes the shared Field keys (`label`, `description`, `placeholder`, `widget`, `colSpan`, `visible`, `disabled`, `required`, `requiredMessage`, `default`) but no `rules`.
- validates only. Its schema's output is ignored, so `v.trim()` changes nothing, and a schema that changes its value's type fails to compile. It never sees an empty or Inactive value, and all its errors show on the Field's own path. `schema` can be a function of the node, built once per node on load.
- picks a row of the [operator table](reference.md#conditions) with `conditionAs`. Without it, Conditions on the Field can only use `empty` and `not_empty`.

A custom Rule keeps the JSON shape `{ type, requirement, message }`. Its `check` runs only on a non-empty value of a Field Type in `appliesTo` (built-in value Field Types only), and its Builder item only fits those.

Registration throws a `TypeError` at once for a name that is not `^[a-z][a-z0-9_]*$` or that a built-in Field Type, Component or Rule already uses, for an option key that a built-in key already uses, for an async schema, requirement or `check`, for an `async` function in a sync check such as `v.check` or `v.custom`, for `v.lazy` anywhere in a schema, and for a name passed twice. A schema built from a node is checked the same way when the Definition loads. A built-in added in a later release under your custom name would be a breaking change for you, so pick distinctive names.

**Your code runs on every server that validates the form.** That is what makes custom Rules safe to store and dangerous to write:

- **ReDoS.** A custom Rule is the way to check a pattern, and a regular expression open to catastrophic backtracking, such as `/^(a+)+$/`, lets one crafted value block a server for seconds or more. Prefer simple, anchored patterns, and put a `max_length` Rule before yours: a Field's Rules run in order and stop at the first that fails, so your `check` never sees a value longer than that.
- **Async is caught before it runs where it can be seen.** An async schema or action anywhere inside, such as `v.pipe(v.string(), v.checkAsync(...))`, and an `async` function passed to a sync check such as `v.check` or `v.custom`, are rejected at registration. `v.lazy` is rejected too, since its schema can't be checked before it runs. A plain function that returns a Promise can't be told apart until it runs: in a Field Type schema Valibot takes its Promise as valid, while a Rule's `check` that returns anything but a boolean throws.
- **A throw is a bug, never a validation result.** Custom code that throws while validating makes `~standard.validate` throw. In `<AutoForm>`, every path that validates treats it the same way: a submit, revalidation on input and a Wizard's Next, Back or `goTo` rethrow it during render, so the nearest error boundary shows it, and the form never submits. It is never shown as an error message, `next` and `goTo` resolve `false` rather than reject, and no Promise is left rejected. Put an error boundary around the form.
- **No versions.** Custom Field Types and Rules have no version of their own. Rename one, change its options or drop it, and a stored Definition that uses it throws on load until you migrate that Definition yourself.

## Before you ship

The behaviours most likely to surprise you in production, in one place:

- **Output replaces; it doesn't merge.** `onSubmit` and `validate` give the full new state of the active Fields, and a cleared Field has no key. Replace the keys the Definition manages on save. A `disabled` Field is Inactive and missing from the output, so replacing erases its stored value; lock it instead. See [Replace, don't merge](#replace-dont-merge).
- **The server must call `lock`.** Validating with the plain compiled form ignores the lock, and a forged value then drives Conditions. Build the form in one `formFor(record)` used on both sides. See [Locked Fields](#locked-fields).
- **Never pass a value from client input to `lock`**: not the body, the URL, nor a hidden Field.
- **`isDirty` is approximate.** Object values compare by reference, a removed and re-added row stays dirty, and `getDirtyPaths` names a whole list. Use it for an "unsaved changes" warning only. See [Unsaved changes](#unsaved-changes).
- **Valibot's default messages are technical.** Users see `Invalid length: Expected >=3 but received 2` unless you register messages or use `@valibot/i18n`. See [Validation messages](#validation-messages).
- **Custom Rules run on your server.** A regular expression open to ReDoS there is a denial-of-service hole, and an async check Valibot can't see counts as valid. See [Custom Field Types and Rules](#custom-field-types-and-rules).
- **`url` accepts any scheme**, `javascript:` included. Check it before rendering a link.
- **`accepted` needs `required`**, since Rules skip an empty value.
- **Server errors from `onSubmit` clear at the next input** anywhere in the form, not only in their own Field.
- **`lock` checks only the JavaScript type.** A choice since removed from `choices` locks as it is and reaches the output; check the value yourself if that matters.
- **A `hidden` Widget's errors go to the general error region**, named by the Field, such as `id: Required`. On a Wizard Page, such an error blocks Next with a message the user can't act on, so make sure the value is valid before the form opens; a required one with no `default` warns on mount.
- **Bundle size.** Unused Fluent Builder functions are left out of a bundle, but the loader always includes every built-in Field Type and Rule, since a stored JSON Definition may use any of them.
