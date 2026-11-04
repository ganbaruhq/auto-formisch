import { describe, expect, it } from 'vite-plus/test';
import { compile, DefinitionError, type FormError } from './index';

// `default` of a single-value Field. Seeding the store and Repeater rows are
// the Renderer's and AF-26's part; here only loading and the schema.

function loadErrors(definition: unknown): readonly FormError[] {
  try {
    compile(definition);
  } catch (error) {
    expect(error).toBeInstanceOf(DefinitionError);
    return (error as DefinitionError).errors;
  }
  throw new Error('Expected the Definition to be rejected');
}

const one = (field: object) => ({ version: 1, components: [{ name: 'value', ...field }] });

describe('default', () => {
  it('loads a default of the Field type and round-trips through JSON', () => {
    const definitions = [
      one({ type: 'text', default: 'Ada' }),
      one({ type: 'number', default: 0 }),
      one({ type: 'boolean', default: false }),
      one({ type: 'choice', choices: ['VN', 'US'], default: 'VN' }),
      one({ type: 'multi_choice', choices: [1, 2], default: [2] }),
      one({ type: 'date', default: '2024-02-29' }),
    ];
    for (const definition of definitions) {
      const loaded = compile(definition).definition;
      expect(loaded).toEqual(definition);
      expect(JSON.stringify(loaded)).toBe(JSON.stringify(definition));
    }
  });

  it('stays out of the schema: an empty submission stays empty', () => {
    const compiled = compile(one({ type: 'text', default: 'Ada', required: true }));
    expect(compiled['~standard'].validate({})).toEqual({
      issues: [{ message: 'Required', path: ['value'] }],
    });
  });

  it('never freezes the caller input', () => {
    const list = [2];
    compile(one({ type: 'multi_choice', choices: [1, 2], default: list }));
    expect(Object.isFrozen(list)).toBe(false);
  });

  it('rejects a default of the wrong type, outside the choices, or breaking a Rule', () => {
    expect(loadErrors(one({ type: 'text', default: 5 }))).toEqual([
      {
        message: 'Invalid type: Expected string but received 5',
        path: ['components', 0, 'default'],
      },
    ]);
    expect(loadErrors(one({ type: 'choice', choices: ['VN'], default: 'FR' }))).toEqual([
      {
        message: 'Invalid type: Expected "VN" but received "FR"',
        path: ['components', 0, 'default'],
      },
    ]);
    expect(
      loadErrors(
        one({ type: 'text', default: 'Al', rules: [{ type: 'min_length', requirement: 3 }] }),
      ),
    ).toEqual([
      {
        message: 'Invalid length: Expected >=3 but received 2',
        path: ['components', 0, 'default'],
      },
    ]);
  });

  it('rejects an empty default', () => {
    for (const field of [
      { type: 'text', default: '  ' },
      { type: 'text', default: null },
      { type: 'multi_choice', choices: ['a'], default: [] },
    ]) {
      expect(loadErrors(one(field))).toEqual([
        { message: 'A default cannot be empty', path: ['components', 0, 'default'] },
      ]);
    }
  });

  it('is reported with the other load errors', () => {
    expect(loadErrors(one({ type: 'number', default: 'x', label: 1 }))).toEqual([
      { message: 'Invalid type: Expected string but received 1', path: ['components', 0, 'label'] },
      {
        message: 'Invalid type: Expected number but received "x"',
        path: ['components', 0, 'default'],
      },
    ]);
  });

  it('is not a key of an object, and a Repeater default waits for its rows', () => {
    const child = [{ type: 'text', name: 'x' }];
    expect(loadErrors(one({ type: 'object', components: child, default: {} }))).toEqual([
      { message: 'Unknown key "default"', path: ['components', 0, 'default'] },
    ]);
    expect(loadErrors(one({ type: 'repeater', components: child, default: [{}] }))).toEqual([
      { message: 'Unknown key "default"', path: ['components', 0, 'default'] },
    ]);
  });
});
