// Type tests: `pnpm typecheck` checks the `@ts-expect-error` lines; the
// runtime test only keeps this file in the suite.
import type { ComponentType } from 'react';
import { describe, expect, it } from 'vite-plus/test';
import type {
  AutoFormProps,
  BooleanField,
  ChoiceValue,
  NumberField,
  RepeaterProps,
  TextField,
  WidgetMap,
  WidgetProps,
} from './index';

/** A Widget that renders nothing, typed by its props. */
const widget = <P,>() => (() => null) as ComponentType<P>;

const TextWidget = widget<WidgetProps<string, TextField>>();
const NumberWidget = widget<WidgetProps<number, NumberField>>();
const UnknownWidget = widget<WidgetProps>();
const ListWidget = widget<RepeaterProps>();

describe('WidgetMap types', () => {
  it('checks the Widget of a built-in type against its value and node', () => {
    const fine: WidgetMap[] = [
      { text: TextWidget, number: NumberWidget, repeater: ListWidget },
      { number: { component: NumberWidget, group: false, appliesTo: ['number'] } },
      // Any other name takes any Widget; `appliesTo` is checked on mount.
      { 'city-picker': TextWidget, stars: NumberWidget, list: ListWidget, any: UnknownWidget },
    ];
    // @ts-expect-error a text Widget can't present `number`
    const wrongValue: WidgetMap = { number: TextWidget };
    // @ts-expect-error nor in an entry
    const wrongEntry: WidgetMap = { number: { component: TextWidget } };
    // @ts-expect-error a value Widget can't present a Repeater
    const wrongProps: WidgetMap = { repeater: TextWidget };
    // @ts-expect-error a Widget that may emit any value can't present `boolean`
    const wrongEmit: WidgetMap = { boolean: UnknownWidget };
    expect([fine, wrongValue, wrongEntry, wrongProps, wrongEmit]).toHaveLength(5);
  });

  it('gives every Widget readOnly, for Locked Fields', () => {
    const readOnly = (props: WidgetProps<boolean, BooleanField>): boolean => props.readOnly;
    const value = (props: WidgetProps<readonly ChoiceValue[]>) => props.value;
    expect([readOnly, value]).toHaveLength(2);
  });
});

describe('AutoFormProps types', () => {
  it('lets onSubmit return errors as {message, path}, in sync or async', () => {
    const fine: AutoFormProps['onSubmit'][] = [
      () => {},
      async () => {},
      () => ({ errors: [{ message: 'Taken', path: ['email'] }] }),
      async () => ({ errors: [{ message: 'No row', path: ['pets', 0, 'kind'] }] }),
      () => ({}),
    ];
    // @ts-expect-error an error needs a message
    const noMessage: AutoFormProps['onSubmit'] = () => ({ errors: [{ path: ['email'] }] });
    // @ts-expect-error a path is a list of keys
    const stringPath: AutoFormProps['onSubmit'] = () => ({ errors: [{ message: 'x', path: 'a' }] });
    expect([fine, noMessage, stringPath]).toHaveLength(3);
  });
});
