import { describe, expect, it } from 'vite-plus/test';
import { compile, DefinitionError, type FormError } from './index';

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

const withField = (field: object) => ({
  version: 1,
  components: [{ type: 'text', name: 'value', ...field }],
});

describe('Form Definition: round trip', () => {
  const definition = {
    $schema: 'https://example.com/form-definition/v1.json',
    version: 1,
    components: [
      {
        type: 'text',
        name: 'email',
        label: 'Email address',
        description: 'We never share it.',
        placeholder: 'ada@example.com',
        widget: 'email',
        required: true,
        requiredMessage: 'Enter your email',
        rules: [
          { type: 'email', message: 'Enter a valid email' },
          { type: 'min_length', requirement: 3 },
          { type: 'max_length', requirement: 64, message: 'Too long' },
        ],
      },
    ],
  };

  it('keeps every key of a stored Definition unchanged', () => {
    const stored = JSON.stringify(definition);
    const compiled = compile(JSON.parse(stored));
    expect(JSON.stringify(compiled.definition)).toBe(stored);
  });

  it('validates the same way after a JSON round trip', () => {
    const original = compile(definition);
    const restored = compile(JSON.parse(JSON.stringify(original.definition)));
    for (const input of [{}, { email: 'ada' }, { email: 'ada@example.com' }, { email: 'a@b' }]) {
      expect(restored['~standard'].validate(input)).toEqual(original['~standard'].validate(input));
    }
  });

  it('is not affected by later changes to the input', () => {
    const input = JSON.parse(JSON.stringify(definition));
    const compiled = compile(input);
    input.components[0].required = false;
    input.components[0].rules.length = 0;
    expect(compiled.definition).toEqual(definition);
    expect(compiled['~standard'].validate({})).toEqual({
      issues: [{ message: 'Enter your email', path: ['email'] }],
    });
  });

  it('exposes a frozen Definition', () => {
    const compiled = compile(definition);
    expect(Object.isFrozen(compiled.definition)).toBe(true);
    expect(Object.isFrozen(compiled.definition.components[0])).toBe(true);
  });
});

describe('Form Definition: rejected on load', () => {
  it('throws an Error that lists each problem with its path', () => {
    expect(() => compile(withField({ requried: true }))).toThrow(
      /components\.0\.requried: Unknown key "requried"/,
    );
  });

  it('rejects a Definition that is not an object', () => {
    for (const definition of [null, 'form', [], 1]) {
      expect(loadErrors(definition)).toEqual([{ message: 'Expected an object', path: [] }]);
    }
  });

  it('rejects a missing version or any version other than 1', () => {
    expect(loadErrors({ components: [] })).toEqual([
      { message: 'Missing key "version"', path: ['version'] },
    ]);
    for (const version of [0, 2, '1', 1.5, null]) {
      expect(loadErrors({ version, components: [] })).toEqual([
        {
          message: `Unsupported version ${JSON.stringify(version)}; this package reads version 1`,
          path: ['version'],
        },
      ]);
    }
  });

  it('rejects an unknown key at the root', () => {
    expect(loadErrors({ version: 1, components: [], fields: {} })).toEqual([
      { message: 'Unknown key "fields"', path: ['fields'] },
    ]);
  });

  it('rejects missing or malformed components', () => {
    expect(loadErrors({ version: 1 })).toEqual([
      { message: 'Missing key "components"', path: ['components'] },
    ]);
    expect(loadErrors({ version: 1, components: {} })).toEqual([
      { message: 'Expected an array', path: ['components'] },
    ]);
    expect(loadErrors({ version: 1, components: ['text'] })).toEqual([
      { message: 'Expected an object', path: ['components', 0] },
    ]);
  });

  it('rejects a missing or unknown type', () => {
    expect(loadErrors({ version: 1, components: [{ name: 'value' }] })).toEqual([
      { message: 'Missing key "type"', path: ['components', 0, 'type'] },
    ]);
    expect(loadErrors({ version: 1, components: [{ type: 'txet', name: 'value' }] })).toEqual([
      { message: 'Unknown type "txet"', path: ['components', 0, 'type'] },
    ]);
  });

  it('rejects an unknown key on a Field, such as a typo of required', () => {
    expect(loadErrors(withField({ requried: true }))).toEqual([
      { message: 'Unknown key "requried"', path: ['components', 0, 'requried'] },
    ]);
  });

  it('rejects keys it cannot store safely', () => {
    const definition = JSON.parse(
      '{"version":1,"components":[{"type":"text","name":"value","__proto__":{"required":true}}]}',
    );
    expect(loadErrors(definition)).toEqual([
      { message: 'Unknown key "__proto__"', path: ['components', 0, '__proto__'] },
    ]);
  });

  it('rejects a Field without a safe, unique name', () => {
    expect(loadErrors({ version: 1, components: [{ type: 'text' }] })).toEqual([
      { message: 'Missing key "name"', path: ['components', 0, 'name'] },
    ]);
    for (const name of ['', '1st', 'first-name', 'a.b', '../a', 5]) {
      expect(loadErrors(withField({ name }))).toEqual([
        {
          message: 'A name is letters, digits and _, and does not start with a digit',
          path: ['components', 0, 'name'],
        },
      ]);
    }
    for (const name of ['__proto__', 'prototype', 'constructor']) {
      expect(loadErrors(withField({ name }))).toEqual([
        { message: `Reserved name "${name}"`, path: ['components', 0, 'name'] },
      ]);
    }
    expect(
      loadErrors({
        version: 1,
        components: [
          { type: 'text', name: 'value' },
          { type: 'text', name: 'value' },
        ],
      }),
    ).toEqual([{ message: 'Duplicate name "value"', path: ['components', 1, 'name'] }]);
  });

  it('rejects a key with a value of the wrong type', () => {
    expect(loadErrors(withField({ label: 5, required: 'yes' }))).toEqual([
      {
        message: 'Invalid type: Expected string but received 5',
        path: ['components', 0, 'label'],
      },
      {
        message: 'Invalid type: Expected boolean but received "yes"',
        path: ['components', 0, 'required'],
      },
    ]);
  });

  it('rejects malformed rules', () => {
    expect(loadErrors(withField({ rules: { type: 'email' } }))).toEqual([
      { message: 'Expected an array', path: ['components', 0, 'rules'] },
    ]);
    expect(loadErrors(withField({ rules: ['email'] }))).toEqual([
      { message: 'Expected an object', path: ['components', 0, 'rules', 0] },
    ]);
    expect(loadErrors(withField({ rules: [{ requirement: 1 }] }))).toEqual([
      { message: 'Missing key "type"', path: ['components', 0, 'rules', 0, 'type'] },
    ]);
    expect(loadErrors(withField({ rules: [{ type: 'email', messgae: 'x' }] }))).toEqual([
      { message: 'Unknown key "messgae"', path: ['components', 0, 'rules', 0, 'messgae'] },
    ]);
    expect(loadErrors(withField({ rules: [{ type: 'email', message: 5 }] }))).toEqual([
      {
        message: 'Invalid type: Expected string but received 5',
        path: ['components', 0, 'rules', 0, 'message'],
      },
    ]);
  });

  it('rejects an unknown Rule, including regex', () => {
    for (const type of ['regex', 'minLength']) {
      expect(loadErrors(withField({ rules: [{ type, requirement: 'a' }] }))).toEqual([
        { message: `Unknown Rule "${type}"`, path: ['components', 0, 'rules', 0, 'type'] },
      ]);
    }
  });

  it('rejects a missing, malformed or unexpected requirement', () => {
    const at = ['components', 0, 'rules', 0, 'requirement'];
    expect(loadErrors(withField({ rules: [{ type: 'min_length' }] }))).toEqual([
      { message: 'Missing key "requirement"', path: at },
    ]);
    for (const requirement of ['3', -1, 1.5]) {
      const errors = loadErrors(withField({ rules: [{ type: 'max_length', requirement }] }));
      expect(errors.map((error) => error.path)).toEqual([at]);
    }
    expect(loadErrors(withField({ rules: [{ type: 'email', requirement: true }] }))).toEqual([
      { message: 'Rule "email" takes no requirement', path: at },
    ]);
  });

  it('reports every problem at once', () => {
    expect(
      loadErrors({
        version: 1,
        components: [
          { type: 'text', name: 'a', requried: true },
          { type: 'txet', name: 'b' },
          { type: 'text', name: '1c', rules: [{ type: 'regex', requirement: '.*' }] },
        ],
        extra: true,
      }),
    ).toEqual([
      { message: 'Unknown key "extra"', path: ['extra'] },
      { message: 'Unknown key "requried"', path: ['components', 0, 'requried'] },
      { message: 'Unknown type "txet"', path: ['components', 1, 'type'] },
      {
        message: 'A name is letters, digits and _, and does not start with a digit',
        path: ['components', 2, 'name'],
      },
      { message: 'Unknown Rule "regex"', path: ['components', 2, 'rules', 0, 'type'] },
    ]);
  });
});
