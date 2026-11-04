import axe from 'axe-core';
import { afterEach, describe, expect, it } from 'vite-plus/test';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AutoForm, compile, type AutoFormProps } from './index';

// The accessibility rules of the default Renderer (AF-9), checked on a form
// that uses every default Widget and Layout, before and after a failed submit.

afterEach(cleanup);

const choices = ['One', 'Two'];

/** One required Field per default Widget, each with a description. */
const widgets = [
  { label: 'Text', type: 'text' },
  { label: 'Textarea', type: 'text', widget: 'textarea' },
  { label: 'Email', type: 'text', widget: 'email' },
  { label: 'Url', type: 'text', widget: 'url' },
  { label: 'Password', type: 'text', widget: 'password' },
  { label: 'Number', type: 'number' },
  { label: 'Checkbox', type: 'boolean' },
  { label: 'Toggle', type: 'boolean', widget: 'toggle' },
  { label: 'Select', type: 'choice', choices },
  { label: 'Radio', type: 'choice', widget: 'radio', choices },
  { label: 'Checkboxes', type: 'multi_choice', choices },
  { label: 'Multi select', type: 'multi_choice', widget: 'multi_select', choices },
  { label: 'Date', type: 'date' },
] as const;

const fields = widgets.map(({ label, ...rest }, index) => ({
  ...rest,
  name: `field${index}`,
  label,
  description: `About ${label}`,
  required: true,
}));

const form = compile({
  version: 1,
  components: [
    { type: 'content', text: 'Fill in every Field.' },
    {
      type: 'section',
      label: 'Widgets',
      description: 'Every default Widget.',
      columns: 2,
      components: fields,
    },
    {
      type: 'tabs',
      components: [
        {
          type: 'tab',
          label: 'Address',
          components: [
            {
              type: 'object',
              name: 'address',
              label: 'Address',
              description: 'Where you live.',
              components: [{ type: 'text', name: 'city', label: 'City', required: true }],
            },
          ],
        },
        {
          type: 'tab',
          label: 'Pets',
          components: [
            {
              type: 'repeater',
              name: 'pets',
              label: 'Pets',
              description: 'At least one.',
              rules: [{ type: 'min_items', requirement: 1, message: 'Add a pet' }],
              components: [{ type: 'text', name: 'kind', label: 'Kind' }],
            },
          ],
        },
      ],
    },
    { type: 'text', name: 'locked', label: 'Locked', disabled: true },
  ],
});

const small = compile({ version: 1, components: [{ type: 'text', name: 'a', label: 'A' }] });

function setup(onSubmit: AutoFormProps['onSubmit'] = () => {}, compiled = form) {
  const { container } = render(<AutoForm form={compiled} onSubmit={onSubmit} />);
  const user = userEvent.setup();
  return {
    user,
    container,
    submit: () => user.click(screen.getByRole('button', { name: 'Submit' })),
  };
}

const byLabel = (label: string) => screen.getByLabelText<HTMLElement>(label, { selector: '*' });

/** The element of a Field that carries its state, by the Field's label. */
function control(label: string): HTMLElement {
  if (label === 'Radio') return screen.getByRole('radiogroup', { name: 'Radio' });
  if (label === 'Checkboxes') {
    return within(screen.getByRole('group', { name: 'Checkboxes' })).getAllByRole('checkbox')[0];
  }
  return screen.getByLabelText(label, { selector: 'input, select, textarea' });
}

const describedBy = (element: Element) =>
  (element.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);

const textsOf = (ids: readonly string[]) =>
  ids.map((id) => document.getElementById(id)?.textContent);

/** axe-core's WCAG 2.x A and AA rules. jsdom has no layout, so no color contrast. */
async function axeViolations(container: Element) {
  const results = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    rules: { 'color-contrast': { enabled: false } },
  });
  return results.violations.map((violation) => ({
    id: violation.id,
    nodes: violation.nodes.map((node) => node.html),
  }));
}

/** Rules that hold in every state of the form. */
function expectStructuralRules(container: HTMLElement) {
  // Native `required` would show the browser's bubble and block schema validation.
  expect(container.querySelectorAll('[required]')).toHaveLength(0);
  // `aria-describedby` points only at elements that exist.
  for (const element of container.querySelectorAll('[aria-describedby]')) {
    for (const id of describedBy(element)) expect(document.getElementById(id)).not.toBeNull();
  }
  // `aria-invalid` is only ever present as "true".
  for (const element of container.querySelectorAll('[aria-invalid]')) {
    expect(element.getAttribute('aria-invalid')).toBe('true');
  }
}

const generalError = () => ({ errors: [{ message: 'Try later', path: [] }] });

describe('Accessibility of the default Renderer', () => {
  it('runs axe-core for real in jsdom: it reports an unnamed input', async () => {
    const { container } = render(<input type="text" />);
    expect((await axeViolations(container)).map((violation) => violation.id)).toContain('label');
  });

  it('passes axe-core before and after a failed submit', async () => {
    const { container, submit } = setup();
    expect(await axeViolations(container)).toEqual([]);
    await submit();
    await waitFor(() => expect(control('Text').getAttribute('aria-invalid')).toBe('true'));
    expect(await axeViolations(container)).toEqual([]);
  });

  it('passes axe-core with a general error', async () => {
    const { container, submit } = setup(generalError, small);
    await submit();
    await screen.findByText('Try later');
    expect(await axeViolations(container)).toEqual([]);
  });

  it('names every Field, Layout and Repeater row', async () => {
    const { user } = setup();
    expect(screen.getByRole('textbox', { name: 'Text' }).tagName).toBe('INPUT');
    expect(screen.getByRole('textbox', { name: 'Textarea' }).tagName).toBe('TEXTAREA');
    expect(screen.getByRole('textbox', { name: 'Email' }).getAttribute('type')).toBe('email');
    expect(screen.getByRole('textbox', { name: 'Url' }).getAttribute('type')).toBe('url');
    expect(byLabel('Password').getAttribute('type')).toBe('password');
    expect(screen.getByRole('spinbutton', { name: 'Number' })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Checkbox' })).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Toggle' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Select' })).toBeTruthy();
    const radios = screen.getByRole('radiogroup', { name: 'Radio' });
    expect(
      within(radios)
        .getAllByRole('radio')
        .map((radio) => radio.id),
    ).toHaveLength(2);
    expect(within(radios).getByRole('radio', { name: 'One' })).toBeTruthy();
    const checkboxes = screen.getByRole('group', { name: 'Checkboxes' });
    expect(within(checkboxes).getByRole('checkbox', { name: 'Two' })).toBeTruthy();
    expect(screen.getByRole('listbox', { name: 'Multi select' })).toBeTruthy();
    expect(byLabel('Date').getAttribute('type')).toBe('date');
    expect(screen.getByRole('group', { name: 'Widgets' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Address' })).toBeTruthy();
    expect(screen.getByRole('tabpanel', { name: 'Address' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Address' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'City' })).toBeTruthy();

    await user.click(screen.getByRole('tab', { name: 'Pets' }));
    await user.click(screen.getByRole('button', { name: 'Add' }));
    const row = screen.getByRole('group', { name: 'Pets 1' });
    expect(within(row).getByRole('textbox', { name: 'Kind' })).toBeTruthy();
    expect(within(row).getByRole('button', { name: 'Remove' })).toBeTruthy();
  });

  it('marks required Fields with aria-required, never native required', () => {
    const { container } = setup();
    for (const { label } of widgets) {
      expect([label, control(label).getAttribute('aria-required')]).toEqual([label, 'true']);
    }
    expect(screen.getByRole('textbox', { name: 'City', hidden: true }).ariaRequired).toBe('true');
    expect(control('Locked').hasAttribute('aria-required')).toBe(false);
    expectStructuralRules(container);
  });

  it('links each description, and no error region until there are errors', () => {
    const { container } = setup();
    for (const { label } of widgets) {
      expect([label, textsOf(describedBy(control(label)))]).toEqual([label, [`About ${label}`]]);
      expect(control(label).hasAttribute('aria-invalid')).toBe(false);
    }
    const section = screen.getByRole('group', { name: 'Widgets' });
    expect(textsOf(describedBy(section))).toEqual(['Every default Widget.']);
    const address = screen.getByRole('group', { name: 'Address' });
    expect(textsOf(describedBy(address))).toEqual(['Where you live.']);
    expectStructuralRules(container);
  });

  it('after a failed submit, marks each invalid Field and links its errors in a polite live region', async () => {
    const { user, container, submit } = setup();
    await submit();
    await waitFor(() => expect(control('Text').getAttribute('aria-invalid')).toBe('true'));
    for (const { label } of widgets) {
      const element = control(label);
      expect([label, element.getAttribute('aria-invalid')]).toEqual([label, 'true']);
      const [description, errors, ...rest] = describedBy(element);
      expect(rest).toEqual([]);
      expect(textsOf([description, errors])).toEqual([`About ${label}`, 'Required']);
      expect(document.getElementById(errors)!.getAttribute('aria-live')).toBe('polite');
    }
    expect(control('Locked').hasAttribute('aria-invalid')).toBe(false);
    expectStructuralRules(container);

    // The Repeater names its own errors from its group, in a polite live region.
    await user.click(screen.getByRole('tab', { name: /^Pets/ }));
    const pets = screen.getByRole('group', { name: 'Pets' });
    const [petsDescription, petsErrors] = describedBy(pets);
    expect(textsOf([petsDescription, petsErrors])).toEqual(['At least one.', 'Add a pet']);
    expect(document.getElementById(petsErrors)!.getAttribute('aria-live')).toBe('polite');

    // Fixing a Field drops its invalid state and the link to its errors.
    await user.type(control('Text'), 'x');
    await waitFor(() => expect(control('Text').hasAttribute('aria-invalid')).toBe(false));
    expect(textsOf(describedBy(control('Text')))).toEqual(['About Text']);
    expectStructuralRules(container);
  });

  it('focuses the first invalid Field in Definition order after a failed submit', async () => {
    const { submit } = setup();
    await submit();
    await waitFor(() => expect(document.activeElement).toBe(control('Text')));
  });

  it('shows general errors in a role="alert" region', async () => {
    const { submit } = setup(generalError, small);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('');
    await submit();
    await waitFor(() => expect(alert.textContent).toBe('Try later'));
  });

  it('disables a disabled Field natively', () => {
    setup();
    const locked = control('Locked') as HTMLInputElement;
    expect(locked.disabled).toBe(true);
    expect(locked.hasAttribute('aria-disabled')).toBe(false);
  });
});

describe('Accessibility of a Wizard', () => {
  const wizard = compile({
    version: 1,
    pages: [
      { type: 'page', label: 'Widgets', description: 'Every default Widget.', components: fields },
      { type: 'page', label: 'End', components: [{ type: 'text', name: 'end', label: 'End' }] },
    ],
  });

  it('passes axe-core on a Page, after a blocked "Next" and on the next Page', async () => {
    const { container } = render(<AutoForm form={wizard} onSubmit={() => {}} />);
    const user = userEvent.setup();
    const page = screen.getByRole('group', { name: 'Widgets' });
    expect(page.tabIndex).toBe(-1);
    expect(await axeViolations(container)).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(document.activeElement).toBe(control('Text')));
    expectStructuralRules(container);
    expect(await axeViolations(container)).toEqual([]);
  });

  it('passes axe-core on a later Page, with its "Back" button', async () => {
    const short = compile({
      version: 1,
      pages: [
        { type: 'page', label: 'Start', components: [{ type: 'text', name: 'a', label: 'A' }] },
        { type: 'page', components: [{ type: 'text', name: 'b', label: 'B', required: true }] },
      ],
    });
    const { container } = render(<AutoForm form={short} onSubmit={() => {}} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    // A Page without a label is an unnamed group, which axe accepts.
    await waitFor(() => expect(document.activeElement?.getAttribute('role')).toBe('group'));
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });
});
