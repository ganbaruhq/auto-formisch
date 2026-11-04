import { describe, expect, it } from 'vite-plus/test';
import { compile, DefinitionError, type FormError, type SectionLayout } from './index';

const validate = (definition: unknown, input: unknown) =>
  compile(definition)['~standard'].validate(input);

/** Compiles a Definition that must fail, and returns its load errors. */
function loadErrors(definition: unknown): readonly FormError[] {
  try {
    compile(definition);
  } catch (error) {
    expect(error).toBeInstanceOf(DefinitionError);
    return (error as DefinitionError).errors;
  }
  throw new Error('Expected the Definition to be rejected');
}

const root = (...components: unknown[]) => ({ version: 1, components });
const text = (name: string, extra: object = {}) => ({ type: 'text', name, ...extra });

const flat = root(text('email', { required: true, rules: [{ type: 'email' }] }), text('city'));
const [email, city] = flat.components;

// Inputs with both outcomes, extra keys and empty values.
const inputs = [
  {},
  { email: 'ada@example.com' },
  { email: 'ada', city: 'Hanoi' },
  { email: 'ada@example.com', city: ' ', other: 1 },
  { email: 5 },
];

describe('Layouts add no data path', () => {
  it('a Field inside a section validates and outputs as if it were at the root', () => {
    const nested = root({ type: 'section', label: 'Contact', components: [email] }, city);
    for (const input of inputs) {
      expect(validate(nested, input)).toEqual(validate(flat, input));
    }
  });

  it('Fields in Tabs validate and output as if they were at the root', () => {
    const nested = root({
      type: 'tabs',
      components: [
        { type: 'tab', label: 'Account', components: [email] },
        { type: 'tab', label: 'Address', components: [city] },
      ],
    });
    for (const input of inputs) {
      expect(validate(nested, input)).toEqual(validate(flat, input));
    }
  });

  it('keeps output the same however deeply the Fields are nested', () => {
    const nested = root(
      {
        type: 'section',
        components: [
          { type: 'content', text: 'Contact details' },
          {
            type: 'tabs',
            components: [
              {
                type: 'tab',
                label: 'Account',
                components: [{ type: 'section', components: [email] }],
              },
            ],
          },
        ],
      },
      city,
    );
    for (const input of inputs) {
      expect(validate(nested, input)).toEqual(validate(flat, input));
    }
  });

  it('shares one data scope across Layouts, so a name is unique across Tabs', () => {
    expect(
      loadErrors(
        root({
          type: 'tabs',
          components: [
            { type: 'tab', label: 'One', components: [text('city')] },
            { type: 'tab', label: 'Two', components: [text('city')] },
          ],
        }),
      ),
    ).toEqual([
      {
        message: 'Duplicate name "city"',
        path: ['components', 0, 'components', 1, 'components', 0, 'name'],
      },
    ]);
  });
});

describe('Content', () => {
  it('adds nothing to the output and takes no input', () => {
    const definition = root({ type: 'content', text: 'Read this first.' }, text('name'));
    expect(validate(definition, { name: 'Ada', text: 'x' })).toEqual({ value: { name: 'Ada' } });
    expect(validate(root({ type: 'content', text: 'Only text' }), { a: 1 })).toEqual({
      value: {},
    });
  });

  it('keeps markup in its text as plain text', () => {
    const compiled = compile(root({ type: 'content', text: '<b>Bold</b> & <script>' }));
    expect(compiled.definition.components![0]).toEqual({
      type: 'content',
      text: '<b>Bold</b> & <script>',
    });
  });
});

describe('Layouts and Content: round trip', () => {
  const definition = root(
    {
      type: 'section',
      label: 'Contact',
      description: 'How we reach you.',
      columns: 2,
      components: [
        text('email', { required: true, colSpan: 2 }),
        { type: 'content', text: 'Optional:', widget: 'note', colSpan: 1 },
        {
          type: 'tabs',
          colSpan: 1,
          components: [
            {
              type: 'tab',
              label: 'Home',
              description: 'Where you live.',
              columns: 3,
              components: [text('city', { colSpan: 2 })],
            },
            { type: 'tab', label: 'Work', components: [text('office')] },
          ],
        },
        { type: 'section', colSpan: 2, components: [] },
      ],
    },
    { type: 'content', text: 'Thanks.' },
  );

  it('keeps every key of a stored Definition unchanged', () => {
    const stored = JSON.stringify(definition);
    expect(JSON.stringify(compile(JSON.parse(stored)).definition)).toBe(stored);
  });

  it('validates the same way after a JSON round trip', () => {
    const original = compile(definition);
    const restored = compile(JSON.parse(JSON.stringify(original.definition)));
    for (const input of [{}, { email: 'a' }, { email: 'a', city: 'Hue', office: ' ', x: 1 }]) {
      expect(restored['~standard'].validate(input)).toEqual(original['~standard'].validate(input));
    }
    expect(original['~standard'].validate({ email: 'a', city: 'Hue', office: ' ' })).toEqual({
      value: { email: 'a', city: 'Hue' },
    });
  });

  it('freezes Layouts and their children', () => {
    const section = compile(definition).definition.components![0] as SectionLayout;
    expect(Object.isFrozen(section)).toBe(true);
    expect(Object.isFrozen(section.components)).toBe(true);
    expect(Object.isFrozen(section.components[0])).toBe(true);
  });
});

describe('Layouts and Content: rejected on load', () => {
  const tab = (label: string, components: unknown[] = []) => ({ type: 'tab', label, components });

  it('rejects a tab anywhere but directly inside tabs', () => {
    expect(loadErrors(root(tab('A')))).toEqual([
      { message: 'A "tab" goes directly inside "tabs"', path: ['components', 0, 'type'] },
    ]);
    expect(loadErrors(root({ type: 'section', components: [tab('A')] }))).toEqual([
      {
        message: 'A "tab" goes directly inside "tabs"',
        path: ['components', 0, 'components', 0, 'type'],
      },
    ]);
    expect(loadErrors(root({ type: 'tabs', components: [tab('Outer', [tab('A')])] }))).toEqual([
      {
        message: 'A "tab" goes directly inside "tabs"',
        path: ['components', 0, 'components', 0, 'components', 0, 'type'],
      },
    ]);
  });

  it('rejects anything but a tab directly inside tabs, and still checks it', () => {
    expect(
      loadErrors(
        root({
          type: 'tabs',
          components: [
            text('city', { requried: true }),
            { type: 'section', components: [] },
            { type: 'content', text: 'x' },
          ],
        }),
      ),
    ).toEqual([
      {
        message: 'Expected "tab" inside "tabs", not "text"',
        path: ['components', 0, 'components', 0, 'type'],
      },
      { message: 'Unknown key "requried"', path: ['components', 0, 'components', 0, 'requried'] },
      {
        message: 'Expected "tab" inside "tabs", not "section"',
        path: ['components', 0, 'components', 1, 'type'],
      },
      {
        message: 'Expected "tab" inside "tabs", not "content"',
        path: ['components', 0, 'components', 2, 'type'],
      },
    ]);
  });

  it('rejects tabs without a tab', () => {
    expect(loadErrors(root({ type: 'tabs', components: [] }))).toEqual([
      { message: 'A "tabs" needs at least one "tab"', path: ['components', 0, 'components'] },
    ]);
  });

  it('rejects a Layout without components, or with malformed ones', () => {
    for (const type of ['section', 'tabs']) {
      expect(loadErrors(root({ type }))).toEqual([
        { message: 'Missing key "components"', path: ['components', 0, 'components'] },
      ]);
    }
    expect(loadErrors(root({ type: 'section', components: {} }))).toEqual([
      { message: 'Expected an array', path: ['components', 0, 'components'] },
    ]);
    expect(loadErrors(root({ type: 'section', components: ['text'] }))).toEqual([
      { message: 'Expected an object', path: ['components', 0, 'components', 0] },
    ]);
    expect(loadErrors(root({ type: 'tabs', components: [{ type: 'tab', label: 'A' }] }))).toEqual([
      {
        message: 'Missing key "components"',
        path: ['components', 0, 'components', 0, 'components'],
      },
    ]);
  });

  it('rejects a tab without a label and Content without text', () => {
    expect(
      loadErrors(root({ type: 'tabs', components: [{ type: 'tab', components: [] }] })),
    ).toEqual([
      { message: 'Missing key "label"', path: ['components', 0, 'components', 0, 'label'] },
    ]);
    expect(loadErrors(root({ type: 'content' }))).toEqual([
      { message: 'Missing key "text"', path: ['components', 0, 'text'] },
    ]);
  });

  it('rejects keys a Layout or Content does not take, such as a name', () => {
    expect(
      loadErrors(
        root(
          { type: 'section', name: 'contact', components: [] },
          { type: 'tabs', label: 'Tabs', components: [tab('A')] },
          { type: 'content', text: 'x', html: '<b>x</b>', label: 'Note' },
        ),
      ),
    ).toEqual([
      { message: 'Unknown key "name"', path: ['components', 0, 'name'] },
      { message: 'Unknown key "label"', path: ['components', 1, 'label'] },
      { message: 'Unknown key "html"', path: ['components', 2, 'html'] },
      { message: 'Unknown key "label"', path: ['components', 2, 'label'] },
    ]);
  });

  it('rejects keys with a value of the wrong type', () => {
    expect(
      loadErrors(
        root(
          { type: 'section', label: 1, description: true, components: [] },
          { type: 'content', text: ['x'], widget: 2 },
        ),
      ),
    ).toEqual([
      {
        message: 'Invalid type: Expected string but received 1',
        path: ['components', 0, 'label'],
      },
      {
        message: 'Invalid type: Expected string but received true',
        path: ['components', 0, 'description'],
      },
      {
        message: 'Invalid type: Expected string but received Array',
        path: ['components', 1, 'text'],
      },
      {
        message: 'Invalid type: Expected string but received 2',
        path: ['components', 1, 'widget'],
      },
    ]);
  });

  it('rejects a page outside the root "pages" (see wizard.test.ts)', () => {
    expect(loadErrors(root({ type: 'page', label: 'Step', components: [] }))).toEqual([
      { message: 'A "page" goes directly inside "pages"', path: ['components', 0, 'type'] },
    ]);
  });
});

describe('columns and colSpan', () => {
  const grid = (columns: unknown, ...components: unknown[]) =>
    root({ type: 'section', columns, components });
  const at = (...path: (string | number)[]) => ['components', 0, ...path];

  it('take a positive integer', () => {
    for (const size of [0, -1, 1.5, '2', null]) {
      expect(loadErrors(grid(size)).map((error) => error.path)).toEqual([at('columns')]);
      expect(loadErrors(grid(2, text('a', { colSpan: size }))).map((error) => error.path)).toEqual([
        at('components', 0, 'colSpan'),
      ]);
    }
  });

  it('accept colSpan up to the number of columns', () => {
    expect(() =>
      compile(grid(2, text('a', { colSpan: 2 }), text('b', { colSpan: 1 }))),
    ).not.toThrow();
  });

  it('reject colSpan wider than the grid', () => {
    expect(loadErrors(grid(2, text('a', { colSpan: 3 })))).toEqual([
      { message: '"colSpan" 3 is wider than the 2 columns', path: at('components', 0, 'colSpan') },
    ]);
  });

  it('reject colSpan where the parent sets no columns', () => {
    const message = '"colSpan" needs "columns" on its parent';
    expect(loadErrors(root(text('a', { colSpan: 1 })))).toEqual([{ message, path: at('colSpan') }]);
    expect(
      loadErrors(
        root({ type: 'section', components: [{ type: 'content', text: 'x', colSpan: 1 }] }),
      ),
    ).toEqual([{ message, path: at('components', 0, 'colSpan') }]);
  });

  it('reject colSpan on a tab, and columns on tabs or Content', () => {
    expect(
      loadErrors(
        grid(
          2,
          {
            type: 'tabs',
            columns: 2,
            components: [{ type: 'tab', label: 'A', colSpan: 1, components: [] }],
          },
          { type: 'content', text: 'x', columns: 2 },
        ),
      ),
    ).toEqual([
      { message: 'Unknown key "columns"', path: at('components', 0, 'columns') },
      {
        message: 'Unknown key "colSpan"',
        path: at('components', 0, 'components', 0, 'colSpan'),
      },
      { message: 'Unknown key "columns"', path: at('components', 1, 'columns') },
    ]);
  });
});
