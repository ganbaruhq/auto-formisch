import { describe, expect, it } from 'vite-plus/test';
import {
  columns,
  compile,
  DefinitionError,
  description,
  label,
  notEmpty,
  page as buildPage,
  pageErrors,
  pageOf,
  required,
  shownPages,
  text as buildText,
  visible,
  wizard as buildWizard,
  type FormError,
} from './index';

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

const wizard = (...pages: unknown[]) => ({ version: 1, pages });
const page = (components: unknown[], extra: object = {}) => ({
  type: 'page',
  ...extra,
  components,
});
const text = (name: string, extra: object = {}) => ({ type: 'text', name, ...extra });

const contactAndAddress = wizard(
  page([text('name', { required: true })], { label: 'Contact' }),
  page([text('city', { required: true }), text('zip')], { label: 'Address' }),
);

describe('a Wizard Definition', () => {
  it('loads root pages and survives a JSON round trip unchanged', () => {
    const definition = wizard(
      page([text('name')], { label: 'Contact', description: 'Who you are', columns: 2 }),
      page([text('city')], { visible: { field: 'name', operator: 'not_empty' } }),
    );
    const loaded = compile(definition).definition;
    expect(loaded).toEqual(definition);
    expect(JSON.parse(JSON.stringify(loaded))).toEqual(definition);
  });

  it('has "components" or "pages" at the root, never both and never neither', () => {
    expect(loadErrors({ version: 1 })).toEqual([
      { message: 'Missing key "components" or "pages"', path: ['components'] },
    ]);
    expect(loadErrors({ version: 1, components: [text('a')], pages: [page([text('b')])] })).toEqual(
      [{ message: 'A Definition has "components" or "pages", not both', path: ['pages'] }],
    );
  });

  it('needs at least one Page, and nothing but Pages in "pages"', () => {
    expect(loadErrors(wizard())).toEqual([
      { message: 'A Wizard needs at least one "page"', path: ['pages'] },
    ]);
    expect(loadErrors({ version: 1, pages: {} })).toEqual([
      { message: 'Expected an array', path: ['pages'] },
    ]);
    expect(loadErrors(wizard(page([text('a')]), text('b')))).toEqual([
      { message: 'Expected "page" inside "pages", not "text"', path: ['pages', 1, 'type'] },
    ]);
    expect(loadErrors(wizard({ type: 'section', components: [] }, page([text('a')])))).toEqual([
      { message: 'Expected "page" inside "pages", not "section"', path: ['pages', 0, 'type'] },
    ]);
  });

  it('allows a Page only directly in the root "pages"', () => {
    const misplaced = [
      { version: 1, components: [page([text('a')])] },
      { version: 1, components: [{ type: 'section', components: [page([text('a')])] }] },
      { version: 1, components: [{ type: 'object', name: 'o', components: [page([text('a')])] }] },
      wizard(page([page([text('a')])])),
    ];
    const paths = [
      ['components', 0, 'type'],
      ['components', 0, 'components', 0, 'type'],
      ['components', 0, 'components', 0, 'type'],
      ['pages', 0, 'components', 0, 'type'],
    ];
    misplaced.forEach((definition, index) => {
      expect(loadErrors(definition)).toEqual([
        { message: 'A "page" goes directly inside "pages"', path: paths[index] },
      ]);
    });
  });

  it('rejects unknown and mistyped Page keys, and colSpan on a Page', () => {
    expect(
      loadErrors(
        wizard(page([text('a')], { label: 1, name: 'p', colSpan: 1, disabled: true, columns: 0 })),
      ),
    ).toEqual([
      { message: 'Unknown key "name"', path: ['pages', 0, 'name'] },
      { message: 'Unknown key "colSpan"', path: ['pages', 0, 'colSpan'] },
      { message: 'Unknown key "disabled"', path: ['pages', 0, 'disabled'] },
      { message: 'Invalid type: Expected string but received 1', path: ['pages', 0, 'label'] },
      { message: 'Invalid value: Expected >=1 but received 0', path: ['pages', 0, 'columns'] },
    ]);
    expect(loadErrors(wizard({ type: 'page' }))).toEqual([
      { message: 'Missing key "components"', path: ['pages', 0, 'components'] },
    ]);
  });

  it('shares one data scope across Pages, so a name is unique in the whole Wizard', () => {
    expect(loadErrors(wizard(page([text('a')]), page([text('a')])))).toEqual([
      { message: 'Duplicate name "a"', path: ['pages', 1, 'components', 0, 'name'] },
    ]);
  });

  it('checks Conditions across Pages, a Page’s own included', () => {
    expect(
      loadErrors(
        wizard(
          page([text('a')], { visible: { field: 'nope', operator: 'empty' } }),
          page([text('b', { visible: { field: 'a', operator: 'gt', value: 1 } })]),
        ),
      ),
    ).toEqual([
      { message: 'No Field "nope"', path: ['pages', 0, 'visible', 'field'] },
      {
        message: 'Operator "gt" does not apply to a "text" Field',
        path: ['pages', 1, 'components', 0, 'visible', 'operator'],
      },
    ]);
  });

  it('validates as one whole form: every Page at once, with no step logic', () => {
    expect(validate(contactAndAddress, {})).toEqual({
      issues: [
        { message: 'Required', path: ['name'] },
        { message: 'Required', path: ['city'] },
      ],
    });
    expect(validate(contactAndAddress, { name: 'Ada', city: 'Hanoi', zip: ' ' })).toEqual({
      value: { name: 'Ada', city: 'Hanoi' },
    });
  });
});

describe('the Fluent Builder', () => {
  it('writes Pages as the same plain Definition as JSON', () => {
    const built = buildWizard([
      buildPage('Contact', [buildText('name', [required()])], [description('Who you are')]),
      buildPage([buildText('city')], [visible(notEmpty('name')), columns(2), label('Address')]),
    ]);
    const json = wizard(
      page([text('name', { required: true })], { label: 'Contact', description: 'Who you are' }),
      page([text('city')], {
        visible: { field: 'name', operator: 'not_empty' },
        columns: 2,
        label: 'Address',
      }),
    );
    expect(JSON.parse(JSON.stringify(built))).toEqual(json);
    expect(compile(built).definition).toEqual(compile(json).definition);
    for (const input of [{}, { name: 'Ada' }, { name: 'Ada', city: 'Hanoi' }]) {
      expect(compile(built)['~standard'].validate(input)).toEqual(validate(json, input));
    }
  });

  it('checks a built Wizard like JSON', () => {
    expect(() => buildWizard([])).toThrow(DefinitionError);
    try {
      buildWizard([buildPage([buildText('a')], [visible(notEmpty('nope'))])]);
      expect.unreachable();
    } catch (error) {
      expect((error as DefinitionError).errors).toEqual([
        { message: 'No Field "nope"', path: ['pages', 0, 'visible', 'field'] },
      ]);
    }
  });
});

describe('a hidden Page', () => {
  const company = wizard(
    page([text('kind', { required: true })]),
    page([text('taxId', { required: true }), text('vat')], {
      visible: { field: 'kind', operator: 'eq', value: 'company' },
    }),
    page([text('email', { required: true })]),
  );

  it('makes its Fields Inactive: not validated and not in the output', () => {
    expect(validate(company, { kind: 'person', taxId: 5, vat: 'x', email: 'a@b.c' })).toEqual({
      value: { kind: 'person', email: 'a@b.c' },
    });
    expect(validate(company, { kind: 'company', email: 'a@b.c' })).toEqual({
      issues: [{ message: 'Required', path: ['taxId'] }],
    });
  });

  it('leaves the shown Pages, listed by their index in "pages"', () => {
    const compiled = compile(company);
    expect(shownPages(compiled, {})).toEqual([0, 2]);
    expect(shownPages(compiled, { kind: 'company' })).toEqual([0, 1, 2]);
    expect(shownPages(compile({ version: 1, components: [text('a')] }), {})).toEqual([]);
  });
});

describe('the Page of a path', () => {
  const compiled = compile(
    wizard(
      page([{ type: 'section', components: [text('name')] }]),
      page([
        { type: 'object', name: 'address', components: [text('city')] },
        { type: 'repeater', name: 'rows', components: [text('street')] },
      ]),
    ),
  );

  it('is the Page holding the Field its first segment names', () => {
    expect(pageOf(compiled, ['name'])).toBe(0);
    expect(pageOf(compiled, ['address', 'city'])).toBe(1);
    expect(pageOf(compiled, ['rows', 2, 'street'])).toBe(1);
  });

  it('is undefined for a path no Page holds', () => {
    expect(pageOf(compiled, [])).toBeUndefined();
    expect(pageOf(compiled, ['other'])).toBeUndefined();
    expect(pageOf(compile({ version: 1, components: [text('name')] }), ['name'])).toBeUndefined();
  });

  it('filters errors to some Pages, keeping those no Page holds', () => {
    const errors = [
      { message: 'A', path: ['rows', 0, 'street'] },
      { message: 'B', path: ['name'] },
      { message: 'C', path: [] },
    ];
    expect(pageErrors(compiled, errors, [0])).toEqual([errors[1], errors[2]]);
    expect(pageErrors(compiled, errors, [1])).toEqual([errors[0], errors[2]]);
  });

  it('lets a server check one step: validate the whole form, then keep its Pages’ errors', () => {
    const steps = compile(contactAndAddress);
    const issues = steps['~standard'].validate({ name: 'Ada' }).issues ?? [];
    expect(pageErrors(steps, issues, [0])).toEqual([]);
    expect(pageErrors(steps, issues, [0, 1])).toEqual([{ message: 'Required', path: ['city'] }]);
  });
});
