import * as v from 'valibot';
import type { Choice, ChoiceValue } from './definition';
import { isEmpty } from './empty';

/** The submitted value of a choice, whichever way it is written. */
export const choiceValue = (choice: Choice): ChoiceValue =>
  typeof choice === 'object' ? choice.value : choice;

const CHOICE_KEYS = new Set(['value', 'label']);

type Issue = { readonly message: string; readonly path: [v.IssuePathItem, ...v.IssuePathItem[]] };

/**
 * The `choices` key of `choice` and `multi_choice`: a non-empty list of
 * strings, finite numbers or `{value, label?}`, whose values are all of one
 * kind, are never empty and never repeat. Every problem is reported with its
 * own path.
 */
export const choicesSchema: v.GenericSchema<unknown, readonly Choice[]> = v.pipe(
  v.array(v.unknown(), 'Expected an array'),
  v.rawCheck(({ dataset, addIssue }) => {
    if (!dataset.typed) return;
    const list = dataset.value;
    if (list.length === 0) {
      addIssue({ message: 'Expected at least one choice' });
      return;
    }
    for (const issue of choiceIssues(list)) addIssue(issue);
  }),
  // A copy, so the loader freezes its own objects, never the caller's.
  v.transform((list) =>
    list.map((item): unknown => (typeof item === 'object' ? { ...item } : item)),
  ),
) as v.GenericSchema<unknown, readonly Choice[]>;

function* choiceIssues(list: readonly unknown[]): Generator<Issue> {
  const seen = new Set<unknown>();
  let kind: 'string' | 'number' | undefined;

  for (const [index, item] of list.entries()) {
    const itemPath: Issue['path'] = [
      { type: 'array', origin: 'value', input: list as unknown[], key: index, value: item },
    ];
    let value: unknown = item;
    let path = itemPath;

    if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
      const node = item as Record<string, unknown>;
      const at = (key: string): Issue['path'] => [
        ...itemPath,
        { type: 'object', origin: 'value', input: node, key, value: node[key] },
      ];
      for (const key of Object.keys(node)) {
        if (!CHOICE_KEYS.has(key))
          yield { message: `Unknown key ${JSON.stringify(key)}`, path: at(key) };
      }
      if (Object.hasOwn(node, 'label') && typeof node.label !== 'string') {
        yield { message: 'Expected a string', path: at('label') };
      }
      if (!Object.hasOwn(node, 'value')) {
        yield { message: 'Missing key "value"', path: at('value') };
        continue;
      }
      value = node.value;
      path = at('value');
      if (!isChoiceValue(value)) {
        yield { message: 'Expected a string or a finite number', path };
        continue;
      }
    } else if (!isChoiceValue(value)) {
      yield { message: 'Expected a string, a finite number or {value, label?}', path };
      continue;
    }

    const valueKind = typeof value as 'string' | 'number';
    if (isEmpty(value)) {
      yield { message: 'A choice value cannot be empty', path };
    } else if (kind !== undefined && valueKind !== kind) {
      yield { message: 'Choice values are all strings or all numbers', path };
    } else if (seen.has(value)) {
      yield { message: `Duplicate choice value ${JSON.stringify(value)}`, path };
    }
    kind ??= valueKind;
    seen.add(value);
  }
}

const isChoiceValue = (value: unknown): value is ChoiceValue =>
  typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));
