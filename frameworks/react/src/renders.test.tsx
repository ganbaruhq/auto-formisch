import { afterEach, describe, expect, it } from 'vite-plus/test';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AutoForm, compile, type WidgetProps } from './index';

// AF-36: a keystroke re-renders only what it changes, even in a form with
// Conditions, so typing stays fast in a large form on a slow phone.

afterEach(cleanup);

/** How often each Field's Widget rendered, by Field name. */
const renders = new Map<string, number>();

function CountingText({ value, onChange, inputProps, node }: WidgetProps<string>) {
  renders.set(node.name, (renders.get(node.name) ?? 0) + 1);
  return (
    <input
      {...inputProps}
      value={value ?? ''}
      onChange={(event) => onChange(event.currentTarget.value || undefined)}
    />
  );
}

const text = (name: string, extra: object = {}) => ({ type: 'text', name, label: name, ...extra });

/** Twenty Fields, two Conditions, a Section, Tabs, an object and a Repeater row. */
const large = compile({
  version: 1,
  components: [
    text('driver'),
    text('shown', { visible: { field: 'driver', operator: 'eq', value: 'show' } }),
    text('needed', { required: { field: 'driver', operator: 'not_empty' } }),
    ...Array.from({ length: 10 }, (_, index) => text(`plain${index}`)),
    { type: 'section', label: 'Section', components: [text('inSection')] },
    {
      type: 'tabs',
      components: [
        { type: 'tab', label: 'One', components: [text('inTab')] },
        { type: 'tab', label: 'Two', components: [text('inOtherTab')] },
      ],
    },
    { type: 'object', name: 'group', components: [text('inGroup')] },
    { type: 'repeater', name: 'rows', default: [{}], components: [text('inRow')] },
  ],
});

function setup() {
  renders.clear();
  render(<AutoForm form={large} widgets={{ text: CountingText }} onSubmit={() => {}} />);
  const user = userEvent.setup();
  const before = new Map(renders);
  /** The Fields whose Widget rendered since `setup` or the last call. */
  const rerendered = () => {
    const changed = [...renders].filter(([name, count]) => count !== before.get(name));
    for (const [name, count] of renders) before.set(name, count);
    return changed.map(([name]) => name).sort();
  };
  return { user, rerendered };
}

describe('AutoForm: re-renders on a keystroke', () => {
  it('only the Field typed into, in a form with Conditions', async () => {
    const { user, rerendered } = setup();
    await user.type(screen.getByLabelText('plain3'), 'abc');
    expect(rerendered()).toEqual(['plain3']);
    await user.type(screen.getByLabelText('inRow'), 'x');
    expect(rerendered()).toEqual(['inRow']);
  });

  it('a Field whose Condition result changed, besides the driver', async () => {
    const { user, rerendered } = setup();
    // `needed` turns required: its Condition result changed, nothing else did.
    await user.type(screen.getByLabelText('driver'), 's');
    expect(rerendered()).toEqual(['driver', 'needed']);
    // Typing on changes no Condition result until "show" is complete.
    await user.type(screen.getByLabelText('driver'), 'ho');
    expect(rerendered()).toEqual(['driver']);
    await user.type(screen.getByLabelText('driver'), 'w');
    expect(rerendered()).toEqual(['driver', 'shown']);
    expect(screen.getByLabelText('shown')).toBeTruthy();
  });
});
