/**
 * Shared valid and invalid Form Definitions, as plain JSON, for checking that
 * the published JSON Schema (`schema/v1.json`) agrees with the loader.
 *
 * Every valid Definition must pass both. Every invalid one must fail the
 * loader, and the JSON Schema too unless `loaderOnly` says why it cannot see
 * that mistake. Add a fixture here with every new key, `type` or Rule.
 */

import * as v from 'valibot';
import * as b from '../builder';
import { defineFieldType, defineRule } from '../extensions';
import type { LoadOptions } from '../registry';

/** A Definition the loader rejects with `error` among its messages. */
export interface InvalidDefinition {
  readonly name: string;
  readonly definition: unknown;
  readonly error: string;
  /**
   * Why the JSON Schema cannot see this mistake, when only the loader rejects
   * it. Without it, the JSON Schema must reject the Definition too.
   */
  readonly loaderOnly?: string;
}

/** The published location a stored Definition references through `$schema`. */
export const SCHEMA_URL = 'https://cdn.jsdelivr.net/npm/@auto-formisch/core/schema/v1.json';

type Node = Record<string, unknown>;

/**
 * The custom Field Types and Rules every fixture is loaded with. The JSON
 * Schema knows none of them: it takes their names loosely.
 */
export const extensions: LoadOptions = {
  fieldTypes: [
    defineFieldType({
      type: 'rating',
      options: { max: v.pipe(v.number(), v.integer(), v.minValue(1)) },
      schema: (node) => v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(node.max)),
      conditionAs: 'number',
    }),
    defineFieldType({
      type: 'place',
      schema: v.object({ lat: v.number(), lng: v.number() }),
    }),
  ],
  rules: [
    defineRule({
      type: 'starts_with',
      appliesTo: ['text', 'choice'],
      requirement: v.string(),
      check: (value, requirement) => String(value).startsWith(requirement),
    }),
  ],
};

const root = (...components: unknown[]) => ({ version: 1, components });
const text = (name: string, extra: Node = {}) => ({ type: 'text', name, ...extra });
const field = (type: string, extra: Node = {}) => root({ type, name: 'value', ...extra });
const choices = ['a', 'b'];
const leaf = (field: string, operator: string, value?: unknown) =>
  value === undefined ? { field, operator } : { field, operator, value };
/** A Condition `levels` deep, its leaf included. */
const nested = (levels: number): unknown =>
  levels === 1 ? leaf('driver', 'not_empty') : { not: nested(levels - 1) };
/** One `text` Field `shown` whose `visible` is `condition`, read from a `driver` Field. */
const visibleWhen = (condition: unknown, driver: Node = { type: 'text' }) =>
  root({ ...driver, name: 'driver' }, text('shown', { visible: condition }));

/**
 * One node of every built-in `type`, each with every key it takes. The schema
 * test checks each built-in type's keys in the JSON Schema against these.
 */
const everyKey = {
  $schema: SCHEMA_URL,
  version: 1,
  components: [
    { type: 'boolean', name: 'flag' },
    text('contact', { rules: [{ type: 'email', message: 'Not an email' }, { type: 'url' }] }),
    {
      type: 'section',
      visible: leaf('flag', 'eq', true),
      label: 'Grid',
      description: 'Two columns',
      columns: 2,
      components: [
        {
          type: 'text',
          name: 'title',
          label: 'Title',
          description: 'A short title',
          placeholder: 'Title',
          widget: 'textarea',
          required: leaf('flag', 'eq', true),
          requiredMessage: 'Enter a title',
          disabled: false,
          visible: leaf('flag', 'not_empty'),
          colSpan: 2,
          default: 'Hello',
          rules: [
            { type: 'min_length', requirement: 2, message: 'Too short' },
            { type: 'max_length', requirement: 80 },
          ],
        },
        {
          type: 'number',
          name: 'count',
          label: 'Count',
          description: 'How many',
          placeholder: '1',
          widget: 'number',
          required: true,
          requiredMessage: 'Enter a count',
          disabled: leaf('flag', 'eq', false),
          visible: leaf('flag', 'neq', false),
          colSpan: 1,
          default: 3,
          rules: [
            { type: 'integer' },
            { type: 'min_value', requirement: 1 },
            { type: 'max_value', requirement: 10 },
          ],
        },
        {
          type: 'boolean',
          name: 'agree',
          label: 'Agree',
          description: 'You must agree',
          widget: 'toggle',
          required: false,
          requiredMessage: 'Agree first',
          disabled: { not: leaf('flag', 'empty') },
          visible: leaf('flag', 'not_empty'),
          colSpan: 1,
          default: true,
          rules: [{ type: 'accepted', message: 'Please agree' }],
        },
        {
          type: 'choice',
          name: 'country',
          label: 'Country',
          description: 'Where you live',
          placeholder: 'Pick one',
          widget: 'radio',
          required: true,
          requiredMessage: 'Pick a country',
          disabled: false,
          visible: leaf('flag', 'eq', true),
          colSpan: 1,
          default: 'VN',
          choices: ['US', { value: 'VN', label: 'Viet Nam' }],
          rules: [],
        },
        {
          type: 'multi_choice',
          name: 'sizes',
          label: 'Sizes',
          description: 'Any number of sizes',
          widget: 'multi_select',
          required: { any: [leaf('flag', 'eq', true), leaf('country', 'in', ['VN'])] },
          requiredMessage: 'Pick a size',
          disabled: false,
          visible: leaf('country', 'not_in', ['US']),
          colSpan: 1,
          default: [1, 2],
          choices: [{ value: 1, label: 'Small' }, 2, 3],
          rules: [
            { type: 'min_items', requirement: 1 },
            { type: 'max_items', requirement: 2 },
          ],
        },
        {
          type: 'date',
          name: 'start',
          label: 'Start',
          description: 'First day',
          widget: 'date',
          required: true,
          requiredMessage: 'Pick a day',
          disabled: false,
          visible: { all: [leaf('flag', 'eq', true), leaf('sizes', 'contains', 2)] },
          colSpan: 1,
          default: '2024-02-29',
          rules: [
            { type: 'min_value', requirement: '2024-01-01' },
            { type: 'max_value', requirement: '2024-12-31' },
          ],
        },
        {
          type: 'object',
          name: 'address',
          label: 'Address',
          description: 'Where to send it',
          widget: 'fieldset',
          disabled: leaf('flag', 'eq', false),
          visible: leaf('flag', 'eq', true),
          colSpan: 2,
          components: [text('street', { visible: leaf('../flag', 'eq', true) })],
        },
        {
          type: 'repeater',
          name: 'items',
          label: 'Items',
          description: 'One row per item',
          widget: 'list',
          disabled: false,
          visible: leaf('count', 'gt', 0),
          colSpan: 2,
          default: [{ sku: 'A1' }, {}],
          rules: [
            { type: 'min_items', requirement: 1 },
            { type: 'max_items', requirement: 5, message: 'At most 5' },
          ],
          components: [text('sku'), text('note', { visible: leaf('sku', 'not_empty') })],
        },
        {
          type: 'section',
          visible: leaf('start', 'gte', '2024-01-01'),
          label: 'Inner',
          description: 'A Section in a grid',
          columns: 1,
          colSpan: 2,
          components: [],
        },
        {
          type: 'tabs',
          visible: leaf('count', 'lte', 9),
          colSpan: 2,
          components: [
            {
              type: 'tab',
              visible: leaf('count', 'lt', 9),
              label: 'First',
              description: 'The first Tab',
              columns: 2,
              components: [text('first', { colSpan: 2 })],
            },
          ],
        },
        {
          type: 'content',
          visible: leaf('flag', 'eq', true),
          text: 'Read this first',
          widget: 'callout',
          colSpan: 2,
        },
      ],
    },
  ],
};

/** A Wizard whose `page` takes every key a Page takes. */
const everyPageKey = {
  $schema: SCHEMA_URL,
  version: 1,
  pages: [
    { type: 'page', components: [{ type: 'boolean', name: 'more' }] },
    {
      type: 'page',
      visible: leaf('more', 'eq', true),
      label: 'More',
      description: 'Only when asked',
      columns: 2,
      components: [text('extra', { colSpan: 2 })],
    },
  ],
};

export const validDefinitions: Readonly<Record<string, unknown>> = {
  'with no Components': root(),
  'that references the published schema': { $schema: SCHEMA_URL, ...root(text('name')) },
  'that references another schema location': {
    $schema: './node_modules/@auto-formisch/core/schema/v1.json',
    ...root(),
  },
  'with every key of every built-in type': everyKey,
  'with every key of a page': everyPageKey,
  'with an empty Section, Tab and Page': {
    version: 1,
    pages: [
      {
        type: 'page',
        components: [
          { type: 'section', components: [] },
          { type: 'tabs', components: [{ type: 'tab', label: 'Empty', components: [] }] },
        ],
      },
      { type: 'page', components: [] },
    ],
  },
  'with nested Repeaters and objects': root(
    {
      type: 'repeater',
      name: 'orders',
      default: [{ lines: [{ qty: 1 }], meta: { note: 'x' } }],
      components: [
        {
          type: 'repeater',
          name: 'lines',
          components: [{ type: 'number', name: 'qty', visible: leaf('../../vip', 'eq', true) }],
        },
        { type: 'object', name: 'meta', components: [text('note')] },
      ],
    },
    { type: 'boolean', name: 'vip' },
  ),
  'with Fields of the same name in different data scopes': root(
    text('name'),
    { type: 'object', name: 'owner', components: [text('name')] },
    { type: 'repeater', name: 'pets', components: [text('name')] },
  ),
  'with choices of numbers': field('choice', { choices: [1, { value: 2 }, 3.5], default: 2 }),
  'with a whitespace-padded text default': field('text', { default: '  padded  ' }),
  'with a negative and fractional number Rule': field('number', {
    rules: [
      { type: 'min_value', requirement: -1.5 },
      { type: 'max_value', requirement: 0 },
    ],
  }),
  'with a Condition 8 levels deep': visibleWhen(nested(8)),
  'with every Condition group': visibleWhen({
    all: [
      { any: [leaf('driver', 'eq', 'a'), leaf('driver', 'neq', 'b')] },
      { not: { all: [leaf('driver', 'in', ['c', 'd']), leaf('driver', 'not_in', ['e'])] } },
    ],
  }),
  'with an ordered Condition on a number': visibleWhen(
    { any: [leaf('driver', 'gt', 1), leaf('driver', 'gte', 2), leaf('driver', 'lt', 3)] },
    { type: 'number' },
  ),
  'with "at least one of two" through required': root(
    text('phone', { required: leaf('email', 'empty') }),
    text('email', { required: leaf('phone', 'empty') }),
  ),
  'with a widget name the Renderer defines': field('text', { widget: 'my_rich_editor' }),
  'with registered custom Field Types and Rules': root(
    {
      type: 'section',
      columns: 2,
      components: [
        {
          type: 'rating',
          name: 'score',
          max: 5,
          label: 'Score',
          description: 'From 1 to 5',
          placeholder: 'Pick',
          widget: 'stars',
          required: true,
          requiredMessage: 'Rate it',
          disabled: false,
          colSpan: 2,
          default: 3,
        },
      ],
    },
    { type: 'place', name: 'where', default: { lat: 1, lng: 2 }, visible: leaf('score', 'gt', 3) },
    text('code', {
      rules: [{ type: 'starts_with', requirement: 'VN', message: 'Starts with VN' }],
    }),
    {
      type: 'choice',
      name: 'plan',
      choices: ['basic', 'business'],
      rules: [{ type: 'starts_with', requirement: 'b' }],
    },
  ),
  'built with the Fluent Builder': b.form([
    b.section('Contact', [
      b.grid(2, [
        b.text('name', [b.label('Full name'), b.required('Enter a name')]),
        b.text('email', [b.email(), b.colSpan(2)]),
      ]),
    ]),
    b.choice('country', ['VN', { value: 'US', label: 'United States' }], [b.widget('radio')]),
    b.number('age', [b.integer(), b.minValue(0), b.visible(b.eq('country', 'VN'))]),
    b.multiChoice('tags', ['a', 'b'], [b.maxItems(1), b.defaultValue(['a'])]),
    b.repeater('pets', [b.text('kind', [b.required(b.notEmpty('../name'))])], [b.minItems(1)]),
    b.tabs([b.tab('More', [b.date('born', [b.maxValue('2024-12-31')])])]),
    b.content('Thanks', [b.visible(b.not(b.isEmpty('name')))]),
  ]),
  'built as a Wizard with the Fluent Builder': b.wizard([
    b.page('One', [b.boolean('more', [b.accepted()])]),
    b.page('Two', [b.text('extra')], [b.visible(b.eq('more', true)), b.columns(2)]),
  ]),
};

export const invalidDefinitions: readonly InvalidDefinition[] = [
  // The root.
  { name: 'that is not an object', definition: [], error: 'Expected an object' },
  { name: 'that is null', definition: null, error: 'Expected an object' },
  { name: 'with no version', definition: { components: [] }, error: 'Missing key "version"' },
  {
    name: 'with version 2',
    definition: { version: 2, components: [] },
    error: 'Unsupported version 2; this package reads version 1',
  },
  {
    name: 'with version "1"',
    definition: { version: '1', components: [] },
    error: 'Unsupported version "1"; this package reads version 1',
  },
  {
    name: 'with an unknown root key',
    definition: { ...root(), fields: {} },
    error: 'Unknown key "fields"',
  },
  {
    name: 'with a $schema that is not a string',
    definition: { $schema: 1, ...root() },
    error: 'Invalid type: Expected string but received 1',
  },
  {
    name: 'with neither components nor pages',
    definition: { version: 1 },
    error: 'Missing key "components" or "pages"',
  },
  {
    name: 'with both components and pages',
    definition: { version: 1, components: [], pages: [{ type: 'page', components: [] }] },
    error: 'A Definition has "components" or "pages", not both',
  },
  {
    name: 'with no pages in a Wizard',
    definition: { version: 1, pages: [] },
    error: 'A Wizard needs at least one "page"',
  },
  {
    name: 'with components that are not a list',
    definition: { version: 1, components: {} },
    error: 'Expected an array',
  },
  {
    name: 'with a Component that is not an object',
    definition: root('text'),
    error: 'Expected an object',
  },
  {
    name: 'with a Component with no type',
    definition: root({ name: 'x' }),
    error: 'Missing key "type"',
  },
  {
    name: 'with a type that is not a string',
    definition: root({ type: 5, name: 'x' }),
    error: 'Unknown type 5',
  },

  // Keys of a Component.
  {
    name: 'with a mistyped key',
    definition: field('text', { requried: true }),
    error: 'Unknown key "requried"',
  },
  {
    name: 'with a Field with no name',
    definition: root({ type: 'text' }),
    error: 'Missing key "name"',
  },
  {
    name: 'with a name that starts with a digit',
    definition: field('text', { name: '1st' }),
    error: 'A name is letters, digits and _, and does not start with a digit',
  },
  {
    name: 'with a name that holds a dot',
    definition: field('text', { name: 'a.b' }),
    error: 'A name is letters, digits and _, and does not start with a digit',
  },
  {
    name: 'with a reserved name',
    definition: field('text', { name: 'constructor' }),
    error: 'Reserved name "constructor"',
  },
  {
    name: 'with a label that is not a string',
    definition: field('text', { label: 1 }),
    error: 'Invalid type: Expected string but received 1',
  },
  {
    name: 'with a placeholder on a boolean',
    definition: field('boolean', { placeholder: 'x' }),
    error: 'Unknown key "placeholder"',
  },
  {
    name: 'with a placeholder on a date',
    definition: field('date', { placeholder: 'x' }),
    error: 'Unknown key "placeholder"',
  },
  {
    name: 'with a placeholder on a multi_choice',
    definition: field('multi_choice', { choices, placeholder: 'x' }),
    error: 'Unknown key "placeholder"',
  },
  {
    name: 'with choices on a text Field',
    definition: field('text', { choices }),
    error: 'Unknown key "choices"',
  },
  {
    name: 'with required on an object',
    definition: root({ type: 'object', name: 'o', required: true, components: [text('x')] }),
    error: 'Unknown key "required"',
  },
  {
    name: 'with required on a Repeater',
    definition: root({ type: 'repeater', name: 'r', required: true, components: [text('x')] }),
    error: 'Unknown key "required"',
  },
  {
    name: 'with rules on an object',
    definition: root({ type: 'object', name: 'o', rules: [], components: [text('x')] }),
    error: 'Unknown key "rules"',
  },
  {
    name: 'with a default on an object',
    definition: root({ type: 'object', name: 'o', default: { x: 'a' }, components: [text('x')] }),
    error: 'Unknown key "default"',
  },
  {
    name: 'with a name on a Section',
    definition: root({ type: 'section', name: 's', components: [] }),
    error: 'Unknown key "name"',
  },
  {
    name: 'with disabled on a Section',
    definition: root({ type: 'section', disabled: true, components: [] }),
    error: 'Unknown key "disabled"',
  },
  {
    name: 'with columns on tabs',
    definition: root({
      type: 'tabs',
      columns: 2,
      components: [{ type: 'tab', label: 'A', components: [] }],
    }),
    error: 'Unknown key "columns"',
  },
  {
    name: 'with components on Content',
    definition: root({ type: 'content', text: 'Hi', components: [] }),
    error: 'Unknown key "components"',
  },
  {
    name: 'with no text on Content',
    definition: root({ type: 'content' }),
    error: 'Missing key "text"',
  },
  {
    name: 'with no label on a Tab',
    definition: root({ type: 'tabs', components: [{ type: 'tab', components: [] }] }),
    error: 'Missing key "label"',
  },
  {
    name: 'with no components on a Section',
    definition: root({ type: 'section' }),
    error: 'Missing key "components"',
  },
  {
    name: 'with no components on an object',
    definition: root({ type: 'object', name: 'o' }),
    error: 'Missing key "components"',
  },
  {
    name: 'with no choices on a choice',
    definition: field('choice'),
    error: 'Missing key "choices"',
  },
  {
    name: 'with no choices on a multi_choice',
    definition: field('multi_choice'),
    error: 'Missing key "choices"',
  },

  // Where a Component may sit.
  {
    name: 'with a Tab outside tabs',
    definition: root({ type: 'tab', label: 'A', components: [] }),
    error: 'A "tab" goes directly inside "tabs"',
  },
  {
    name: 'with a Field directly inside tabs',
    definition: root({ type: 'tabs', components: [text('x')] }),
    error: 'Expected "tab" inside "tabs", not "text"',
  },
  {
    name: 'with a Page in components',
    definition: root({ type: 'page', components: [] }),
    error: 'A "page" goes directly inside "pages"',
  },
  {
    name: 'with a Page inside a Section',
    definition: root({ type: 'section', components: [{ type: 'page', components: [] }] }),
    error: 'A "page" goes directly inside "pages"',
  },
  {
    name: 'with a Field directly in pages',
    definition: { version: 1, pages: [text('x')] },
    error: 'Expected "page" inside "pages", not "text"',
  },
  {
    name: 'with empty tabs',
    definition: root({ type: 'tabs', components: [] }),
    error: 'A "tabs" needs at least one "tab"',
  },
  {
    name: 'with an empty object',
    definition: root({ type: 'object', name: 'o', components: [] }),
    error: 'A "object" needs at least one Component',
  },
  {
    name: 'with an empty Repeater',
    definition: root({ type: 'repeater', name: 'r', components: [] }),
    error: 'A "repeater" needs at least one Component',
  },
  {
    name: 'with Fields of the same name across Tabs',
    definition: root({
      type: 'tabs',
      components: [
        { type: 'tab', label: 'A', components: [text('x')] },
        { type: 'tab', label: 'B', components: [text('x')] },
      ],
    }),
    error: 'Duplicate name "x"',
    loaderOnly: 'a JSON Schema cannot compare names across a tree',
  },
  {
    name: 'with Fields of the same name across Pages',
    definition: {
      version: 1,
      pages: [
        { type: 'page', components: [text('x')] },
        { type: 'page', components: [text('x')] },
      ],
    },
    error: 'Duplicate name "x"',
    loaderOnly: 'a JSON Schema cannot compare names across a tree',
  },

  // The grid.
  {
    name: 'with colSpan and no columns on the parent',
    definition: root({ type: 'section', components: [text('x', { colSpan: 1 })] }),
    error: '"colSpan" needs "columns" on its parent',
  },
  {
    name: 'with colSpan at the root',
    definition: field('text', { colSpan: 1 }),
    error: '"colSpan" needs "columns" on its parent',
  },
  {
    name: 'with colSpan inside an object',
    definition: root({ type: 'object', name: 'o', components: [text('x', { colSpan: 1 })] }),
    error: '"colSpan" needs "columns" on its parent',
  },
  {
    name: 'with colSpan on a Tab',
    definition: root({
      type: 'section',
      columns: 2,
      components: [
        { type: 'tabs', components: [{ type: 'tab', label: 'A', colSpan: 1, components: [] }] },
      ],
    }),
    error: 'Unknown key "colSpan"',
  },
  {
    name: 'with colSpan on a Page',
    definition: { version: 1, pages: [{ type: 'page', colSpan: 1, components: [] }] },
    error: 'Unknown key "colSpan"',
  },
  {
    name: 'with columns of 0',
    definition: root({ type: 'section', columns: 0, components: [] }),
    error: 'Invalid value: Expected >=1 but received 0',
  },
  {
    name: 'with fractional columns',
    definition: root({ type: 'section', columns: 1.5, components: [] }),
    error: 'Invalid integer: Received 1.5',
  },
  {
    name: 'with colSpan wider than the columns',
    definition: root({ type: 'section', columns: 2, components: [text('x', { colSpan: 3 })] }),
    error: '"colSpan" 3 is wider than the 2 columns',
    loaderOnly: "a JSON Schema cannot compare a key with its parent's",
  },

  // Rules.
  {
    name: 'with a Rule on the wrong type',
    definition: field('number', { rules: [{ type: 'email' }] }),
    error: 'Rule "email" does not apply to a "number" Field',
  },
  {
    name: 'with a built-in Rule on a choice',
    definition: field('choice', { choices, rules: [{ type: 'min_items', requirement: 1 }] }),
    error: 'Rule "min_items" does not apply to a "choice" Field',
  },
  {
    name: 'with a length Rule on a Repeater',
    definition: root({
      type: 'repeater',
      name: 'r',
      rules: [{ type: 'min_length', requirement: 1 }],
      components: [text('x')],
    }),
    error: 'Rule "min_length" does not apply to a "repeater" Field',
  },
  {
    name: 'with a regex Rule',
    definition: field('text', { rules: [{ type: 'regex', requirement: '^a+$' }] }),
    error: 'Unknown Rule "regex"',
    loaderOnly: 'the JSON Schema takes an unknown Rule as a custom Rule',
  },
  {
    name: 'with a Rule that is not an object',
    definition: field('text', { rules: ['email'] }),
    error: 'Expected an object',
  },
  {
    name: 'with rules that are not a list',
    definition: field('text', { rules: { type: 'email' } }),
    error: 'Expected an array',
  },
  {
    name: 'with an unknown key on a Rule',
    definition: field('text', { rules: [{ type: 'email', messag: 'x' }] }),
    error: 'Unknown key "messag"',
  },
  {
    name: 'with an unknown key on a custom Rule',
    definition: field('text', { rules: [{ type: 'starts_with', requirement: 'a', messag: 'x' }] }),
    error: 'Unknown key "messag"',
  },
  {
    name: 'with a Rule with no type',
    definition: field('text', { rules: [{ requirement: 1 }] }),
    error: 'Missing key "type"',
  },
  {
    name: 'with a length Rule with no requirement',
    definition: field('text', { rules: [{ type: 'min_length' }] }),
    error: 'Missing key "requirement"',
  },
  {
    name: 'with a requirement on email',
    definition: field('text', { rules: [{ type: 'email', requirement: true }] }),
    error: 'Rule "email" takes no requirement',
  },
  {
    name: 'with a negative length',
    definition: field('text', { rules: [{ type: 'max_length', requirement: -1 }] }),
    error: 'Invalid value: Expected >=0 but received -1',
  },
  {
    name: 'with a fractional item count',
    definition: field('multi_choice', {
      choices,
      rules: [{ type: 'max_items', requirement: 1.5 }],
    }),
    error: 'Invalid integer: Received 1.5',
  },
  {
    name: 'with a date bound on a number',
    definition: field('number', { rules: [{ type: 'min_value', requirement: '2024-01-01' }] }),
    error: 'Invalid type: Expected number but received "2024-01-01"',
  },
  {
    name: 'with a number bound on a date',
    definition: field('date', { rules: [{ type: 'max_value', requirement: 1 }] }),
    error: 'Invalid type: Expected string but received 1',
  },
  {
    name: 'with a date bound that is not a date',
    definition: field('date', { rules: [{ type: 'max_value', requirement: '2024-13-01' }] }),
    error: 'Invalid date: Received "2024-13-01"',
  },
  {
    name: 'with a date bound on a day that does not exist',
    definition: field('date', { rules: [{ type: 'max_value', requirement: '2023-02-29' }] }),
    error: 'Invalid date: Received "2023-02-29"',
    loaderOnly: 'a pattern cannot know the days of each month',
  },
  {
    name: 'with a Rule message that is not a string',
    definition: field('boolean', { rules: [{ type: 'accepted', message: 1 }] }),
    error: 'Invalid type: Expected string but received 1',
  },

  // Choices.
  {
    name: 'with no choices in the list',
    definition: field('choice', { choices: [] }),
    error: 'Expected at least one choice',
  },
  {
    name: 'with choices that are not a list',
    definition: field('choice', { choices: 'a' }),
    error: 'Expected an array',
  },
  {
    name: 'with strings and numbers in one choices list',
    definition: field('choice', { choices: ['a', 1] }),
    error: 'Choice values are all strings or all numbers',
  },
  {
    name: 'with an empty choice value',
    definition: field('choice', { choices: ['a', ' '] }),
    error: 'A choice value cannot be empty',
  },
  {
    name: 'with a repeated choice',
    definition: field('choice', { choices: ['a', 'a'] }),
    error: 'Duplicate choice value "a"',
  },
  {
    name: 'with a choice repeated in another form',
    definition: field('choice', { choices: ['a', { value: 'a' }] }),
    error: 'Duplicate choice value "a"',
    loaderOnly: 'a JSON Schema compares whole items, not their values',
  },
  {
    name: 'with a choice object with no value',
    definition: field('choice', { choices: [{ label: 'A' }] }),
    error: 'Missing key "value"',
  },
  {
    name: 'with an unknown key on a choice object',
    definition: field('choice', { choices: [{ value: 'a', title: 'A' }] }),
    error: 'Unknown key "title"',
  },
  {
    name: 'with a choice that is a boolean',
    definition: field('choice', { choices: [true] }),
    error: 'Expected a string, a finite number or {value, label?}',
  },

  // Defaults.
  {
    name: 'with an empty text default',
    definition: field('text', { default: ' ' }),
    error: 'A default cannot be empty',
  },
  {
    name: 'with a null default',
    definition: field('number', { default: null }),
    error: 'A default cannot be empty',
  },
  {
    name: 'with a text default of the wrong type',
    definition: field('text', { default: 1 }),
    error: 'Invalid type: Expected string but received 1',
  },
  {
    name: 'with a boolean default of the wrong type',
    definition: field('boolean', { default: 'yes' }),
    error: 'Invalid type: Expected boolean but received "yes"',
  },
  {
    name: 'with a date default that is not a date',
    definition: field('date', { default: '1 May 2024' }),
    error: 'Invalid date: Received "1 May 2024"',
  },
  {
    name: 'with an empty multi_choice default',
    definition: field('multi_choice', { choices, default: [] }),
    error: 'A default cannot be empty',
  },
  {
    name: 'with a repeated multi_choice default',
    definition: field('multi_choice', { choices, default: ['a', 'a'] }),
    error: 'Duplicate value "a"',
  },
  {
    name: 'with a choice default outside the choices',
    definition: field('choice', { choices, default: 'z' }),
    error: 'Invalid type: Expected ("a" | "b") but received "z"',
    loaderOnly: "a JSON Schema cannot read the Field's own choices",
  },
  {
    name: 'with a default that fails its Rules',
    definition: field('text', { default: 'a', rules: [{ type: 'min_length', requirement: 2 }] }),
    error: 'Invalid length: Expected >=2 but received 1',
    loaderOnly: "a JSON Schema cannot apply the Field's own Rules",
  },
  {
    name: 'with a date default on a day that does not exist',
    definition: field('date', { default: '2024-02-30' }),
    error: 'Invalid date: Received "2024-02-30"',
    loaderOnly: 'a pattern cannot know the days of each month',
  },
  {
    name: 'with an empty Repeater default',
    definition: root({ type: 'repeater', name: 'r', default: [], components: [text('x')] }),
    error: 'A default cannot be empty',
  },
  {
    name: 'with a Repeater default row that is not an object',
    definition: root({ type: 'repeater', name: 'r', default: ['a'], components: [text('x')] }),
    error: 'Expected an object',
  },
  {
    name: 'with a Repeater default row with a key no Field has',
    definition: root({
      type: 'repeater',
      name: 'r',
      default: [{ y: 'a' }],
      components: [text('x')],
    }),
    error: 'Unknown key "y"',
    loaderOnly: "a JSON Schema cannot read the Repeater's own template",
  },
  {
    name: 'with more Repeater default rows than max_items',
    definition: root({
      type: 'repeater',
      name: 'r',
      default: [{}, {}],
      rules: [{ type: 'max_items', requirement: 1 }],
      components: [text('x')],
    }),
    error: 'Invalid length: Expected <=1 but received 2',
    loaderOnly: "a JSON Schema cannot apply the Repeater's own Rules",
  },

  // Conditions.
  {
    name: 'with visible set to true',
    definition: field('text', { visible: true }),
    error: 'Expected a Condition',
  },
  {
    name: 'with disabled set to a string',
    definition: field('text', { disabled: 'yes' }),
    error: 'Expected true, false or a Condition',
  },
  {
    name: 'with an unknown key on a Condition leaf',
    definition: visibleWhen({ ...leaf('driver', 'eq', 'a'), op: 'eq' }),
    error: 'Unknown key "op"',
  },
  {
    name: 'with two groups in one Condition',
    definition: visibleWhen({ all: [leaf('driver', 'empty')], any: [leaf('driver', 'empty')] }),
    error: 'A Condition has one of "all", "any" and "not", not 2',
  },
  {
    name: 'with a group and a leaf key in one Condition',
    definition: visibleWhen({ all: [leaf('driver', 'empty')], field: 'driver' }),
    error: 'Unknown key "field"',
  },
  {
    name: 'with an empty group',
    definition: visibleWhen({ any: [] }),
    error: '"any" needs at least one Condition',
  },
  {
    name: 'with a group that is not a list',
    definition: visibleWhen({ all: leaf('driver', 'empty') }),
    error: 'Expected an array',
  },
  {
    name: 'with a Condition 9 levels deep',
    definition: visibleWhen(nested(9)),
    error: 'A Condition nests at most 8 levels',
  },
  {
    name: 'with a Condition leaf with no operator',
    definition: visibleWhen({ field: 'driver' }),
    error: 'Missing key "operator"',
  },
  {
    name: 'with an unknown operator',
    definition: visibleWhen(leaf('driver', 'equals', 'a')),
    error: 'Unknown operator "equals"',
  },
  {
    name: 'with a reference with an index',
    definition: visibleWhen(leaf('driver.0', 'eq', 'a')),
    error: 'A reference is "../" steps, then names joined by "."',
  },
  {
    name: 'with a value on empty',
    definition: visibleWhen(leaf('driver', 'empty', 'a')),
    error: 'Operator "empty" takes no value',
  },
  {
    name: 'with no value on eq',
    definition: visibleWhen(leaf('driver', 'eq')),
    error: 'Missing key "value"',
  },
  {
    name: 'with no value on contains',
    definition: visibleWhen(leaf('driver', 'contains'), { type: 'multi_choice', choices }),
    error: 'Missing key "value"',
  },
  {
    name: 'with an empty list on in',
    definition: visibleWhen(leaf('driver', 'in', [])),
    error: 'Expected at least one value',
  },
  {
    name: 'with a value that is not a list on not_in',
    definition: visibleWhen(leaf('driver', 'not_in', 'a')),
    error: 'Expected a list',
  },
  {
    name: 'with a reference to no Field',
    definition: visibleWhen(leaf('nobody', 'eq', 'a')),
    error: 'No Field "nobody"',
    loaderOnly: 'a JSON Schema cannot resolve a reference',
  },
  {
    name: 'with a reference above the root',
    definition: visibleWhen(leaf('../driver', 'eq', 'a')),
    error: '"../driver" goes above the root',
    loaderOnly: 'a JSON Schema cannot resolve a reference',
  },
  {
    name: 'with an operator that does not apply to the Field',
    definition: visibleWhen(leaf('driver', 'gt', 'a')),
    error: 'Operator "gt" does not apply to a "text" Field',
    loaderOnly: 'a JSON Schema cannot know the type of the Field a reference reads',
  },
  {
    name: 'with a value of the wrong type for the Field',
    definition: visibleWhen(leaf('driver', 'eq', 'a'), { type: 'number' }),
    error: 'Invalid type: Expected number but received "a"',
    loaderOnly: 'a JSON Schema cannot know the type of the Field a reference reads',
  },
  {
    name: 'with a cycle through visible',
    definition: root(
      text('a', { visible: leaf('b', 'not_empty') }),
      text('b', { visible: leaf('a', 'not_empty') }),
    ),
    error: 'A Condition cycle through "visible" or "disabled": "a" -> "b" -> "a"',
    loaderOnly: 'a JSON Schema cannot follow references',
  },

  // Custom Field Types and Rules: `extensions` registers `rating`, `place` and `starts_with`.
  {
    name: 'with an unregistered custom Field Type',
    definition: root({ type: 'stars', name: 'score', max: 5 }),
    error: 'Unknown type "stars"',
    loaderOnly: 'the JSON Schema takes an unknown type as a custom Field Type',
  },
  {
    name: 'with a mistyped built-in type',
    definition: root({ type: 'txet', name: 'title' }),
    error: 'Unknown type "txet"',
    loaderOnly: 'the JSON Schema takes an unknown type as a custom Field Type',
  },
  {
    name: 'with an unregistered custom Rule',
    definition: field('text', { rules: [{ type: 'ends_with', requirement: 'VN' }] }),
    error: 'Unknown Rule "ends_with"',
    loaderOnly: 'the JSON Schema takes an unknown Rule as a custom Rule',
  },
  {
    name: 'with an unknown option on a custom Field Type',
    definition: root({ type: 'rating', name: 'score', max: 5, maxx: 5 }),
    error: 'Unknown key "maxx"',
    loaderOnly: "a custom Field Type's options belong to the application",
  },
  {
    name: 'with an option of the wrong type on a custom Field Type',
    definition: root({ type: 'rating', name: 'score', max: '5' }),
    error: 'Invalid type: Expected number but received "5"',
    loaderOnly: "a custom Field Type's options belong to the application",
  },
  {
    name: 'with a custom Field Type default its schema rejects',
    definition: root({ type: 'rating', name: 'score', max: 5, default: 9 }),
    error: 'Invalid value: Expected <=5 but received 9',
    loaderOnly: "a custom Field Type's schema belongs to the application",
  },
  {
    name: 'with a custom Rule on a Field Type it does not apply to',
    definition: field('number', { rules: [{ type: 'starts_with', requirement: 'VN' }] }),
    error: 'Rule "starts_with" does not apply to a "number" Field',
    loaderOnly: "a custom Rule's appliesTo belongs to the application",
  },
  {
    name: 'with a custom Rule requirement its schema rejects',
    definition: field('text', { rules: [{ type: 'starts_with', requirement: 1 }] }),
    error: 'Invalid type: Expected string but received 1',
    loaderOnly: "a custom Rule's requirement belongs to the application",
  },
  {
    name: 'with a custom Rule on a Repeater',
    definition: root({
      type: 'repeater',
      name: 'r',
      rules: [{ type: 'starts_with', requirement: 'VN' }],
      components: [text('x')],
    }),
    error: 'Rule "starts_with" does not apply to a "repeater" Field',
  },
  {
    name: 'with a type no custom Field Type can have',
    definition: root({ type: 'Rating', name: 'score' }),
    error: 'Unknown type "Rating"',
  },
  {
    name: 'with a custom Field Type with no name',
    definition: root({ type: 'rating', max: 5 }),
    error: 'Missing key "name"',
  },
  {
    name: 'with a bad name on a custom Field Type',
    definition: root({ type: 'rating', name: 'my score', max: 5 }),
    error: 'A name is letters, digits and _, and does not start with a digit',
  },
  {
    name: 'with rules on a custom Field Type',
    definition: root({ type: 'rating', name: 'score', max: 5, rules: [] }),
    error: 'Unknown key "rules"',
  },
  {
    name: 'with a label that is not a string on a custom Field Type',
    definition: root({ type: 'rating', name: 'score', max: 5, label: 1 }),
    error: 'Invalid type: Expected string but received 1',
  },
  {
    name: 'with visible set to true on a custom Field Type',
    definition: root({ type: 'rating', name: 'score', max: 5, visible: true }),
    error: 'Expected a Condition',
  },
  {
    name: 'with a custom Field Type inside tabs',
    definition: root({ type: 'tabs', components: [{ type: 'rating', name: 'score', max: 5 }] }),
    error: 'Expected "tab" inside "tabs", not "rating"',
  },
  {
    name: 'with colSpan on a custom Field Type outside a grid',
    definition: root({ type: 'rating', name: 'score', max: 5, colSpan: 1 }),
    error: '"colSpan" needs "columns" on its parent',
  },
];
