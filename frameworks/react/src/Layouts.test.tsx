import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AutoForm, compile, type CompiledForm, type FormOutput } from './index';

afterEach(cleanup);

function setup(form: CompiledForm) {
  const onSubmit = vi.fn<(output: FormOutput) => void>();
  render(<AutoForm form={form} onSubmit={onSubmit} />);
  return {
    user: userEvent.setup(),
    onSubmit,
    input: (label: string) => screen.getByLabelText<HTMLInputElement>(label),
    submit: () => screen.getByRole('button', { name: 'Submit' }),
  };
}

const root = (...components: unknown[]) => compile({ version: 1, components });
const text = (name: string, label: string, extra: object = {}) => ({
  type: 'text',
  name,
  label,
  ...extra,
});

describe('AutoForm: section', () => {
  it('renders a labelled section as a named group with its description', () => {
    setup(
      root({
        type: 'section',
        label: 'Contact',
        description: 'How we reach you.',
        components: [text('email', 'Email')],
      }),
    );
    const group = screen.getByRole('group', { name: 'Contact' });
    expect(within(group).getByLabelText('Email').tagName).toBe('INPUT');
    expect(group.getAttribute('aria-describedby')).not.toBeNull();
    const description = document.getElementById(group.getAttribute('aria-describedby')!);
    expect(description?.textContent).toBe('How we reach you.');
  });

  it('renders a section without label or description as no group', () => {
    setup(root({ type: 'section', components: [text('email', 'Email')] }));
    expect(screen.queryByRole('group')).toBeNull();
    expect(screen.getByLabelText('Email').tagName).toBe('INPUT');
  });
});

describe('AutoForm: Layouts add no data path', () => {
  const flat = [text('email', 'Email', { required: true }), text('city', 'City')];
  const nested = root(
    {
      type: 'section',
      label: 'Contact',
      components: [
        {
          type: 'tabs',
          components: [
            { type: 'tab', label: 'Account', components: [flat[0]] },
            {
              type: 'tab',
              label: 'Address',
              components: [{ type: 'section', components: [flat[1]] }],
            },
          ],
        },
      ],
    },
    { type: 'content', text: 'Thanks.' },
  );

  it('submits the same output with the Fields inside Layouts as at the root', async () => {
    const outputs: FormOutput[] = [];
    for (const form of [root(...flat), nested]) {
      const { user, onSubmit, input, submit } = setup(form);
      await user.type(input('Email'), 'ada@example.com');
      await user.type(input('City'), 'Hue');
      await user.click(submit());
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      outputs.push(onSubmit.mock.calls[0][0]);
      cleanup();
    }
    expect(outputs).toEqual([
      { email: 'ada@example.com', city: 'Hue' },
      { email: 'ada@example.com', city: 'Hue' },
    ]);
  });
});

describe('AutoForm: tabs', () => {
  const form = root({
    type: 'tabs',
    components: [
      {
        type: 'tab',
        label: 'Account',
        description: 'Sign-in details.',
        components: [text('email', 'Email')],
      },
      { type: 'tab', label: 'Address', components: [text('city', 'City', { required: true })] },
      { type: 'tab', label: 'Notes', components: [text('note', 'Note')] },
    ],
  });

  const tab = (name: string) => screen.getByRole('tab', { name });
  const panelOf = (element: HTMLElement) => element.closest<HTMLElement>('[role="tabpanel"]')!;

  it('renders a tab list whose first Tab is selected and shown', () => {
    const { input } = setup(form);
    const tabs = within(screen.getByRole('tablist')).getAllByRole('tab');
    expect(tabs.map((element) => element.textContent)).toEqual(['Account', 'Address', 'Notes']);
    expect(tabs.map((element) => element.getAttribute('aria-selected'))).toEqual([
      'true',
      'false',
      'false',
    ]);
    expect(tabs.map((element) => element.tabIndex)).toEqual([0, -1, -1]);
    const panel = panelOf(input('Email'));
    expect(panel.hidden).toBe(false);
    expect(panel.getAttribute('aria-labelledby')).toBe(tab('Account').id);
    expect(tab('Account').getAttribute('aria-controls')).toBe(panel.id);
    expect(within(panel).getByText('Sign-in details.')).toBeTruthy();
  });

  it('keeps inactive Tabs mounted but hidden', () => {
    const { input } = setup(form);
    expect(panelOf(input('City')).hidden).toBe(true);
    expect(panelOf(input('Note')).hidden).toBe(true);
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
  });

  it('shows a Tab when it is clicked', async () => {
    const { user, input } = setup(form);
    await user.click(tab('Address'));
    expect(tab('Address').getAttribute('aria-selected')).toBe('true');
    expect(tab('Account').getAttribute('aria-selected')).toBe('false');
    expect(panelOf(input('City')).hidden).toBe(false);
    expect(panelOf(input('Email')).hidden).toBe(true);
  });

  it('moves between Tabs with the arrow, Home and End keys', async () => {
    const { user } = setup(form);
    await user.click(tab('Account'));
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(tab('Address'));
    expect(tab('Address').getAttribute('aria-selected')).toBe('true');
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(tab('Notes'));
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(tab('Account'));
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(tab('Notes'));
    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(tab('Account'));
    expect(tab('Account').getAttribute('aria-selected')).toBe('true');
  });

  it('keeps the values of a Tab after switching away and back', async () => {
    const { user, input } = setup(form);
    await user.type(input('Email'), 'ada@example.com');
    await user.click(tab('Notes'));
    await user.click(tab('Account'));
    expect(input('Email').value).toBe('ada@example.com');
  });

  it('validates and submits the Fields of inactive Tabs', async () => {
    const { user, onSubmit, input, submit } = setup(form);
    await user.type(input('Email'), 'ada@example.com');
    await user.click(submit());
    await waitFor(() => expect(input('City').getAttribute('aria-invalid')).toBe('true'));
    expect(onSubmit).not.toHaveBeenCalled();

    // The failed submit opened the Tab with the error, which counts it.
    expect(tab('Address (1)').getAttribute('aria-selected')).toBe('true');
    await user.type(input('City'), 'Hue');
    await user.click(tab('Notes'));
    await user.click(submit());
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toEqual({ email: 'ada@example.com', city: 'Hue' });
  });

  it('gives each form its own Tab ids', () => {
    render(
      <>
        <AutoForm form={form} onSubmit={() => {}} />
        <AutoForm form={form} onSubmit={() => {}} />
      </>,
    );
    const ids = screen.getAllByRole('tab').map((element) => element.id);
    expect(new Set(ids).size).toBe(6);
  });
});

describe('AutoForm: columns and colSpan', () => {
  it('lays out the children of a Layout with columns in a CSS grid', () => {
    const { input } = setup(
      root({
        type: 'section',
        label: 'Name',
        columns: 3,
        components: [text('first', 'First', { colSpan: 2 }), text('last', 'Last')],
      }),
    );
    const firstCell = input('First').parentElement!.parentElement!;
    const grid = firstCell.parentElement!;
    expect(grid.style.display).toBe('grid');
    expect(grid.style.gridTemplateColumns).toBe('repeat(var(--af-columns, 3), minmax(0, 1fr))');
    expect(firstCell.style.gridColumn).toBe('span 2');
    const lastCell = input('Last').parentElement!.parentElement!;
    expect(lastCell.parentElement).toBe(grid);
    expect(lastCell.style.gridColumn).toBe('');
  });

  it('lays out a Tab with columns', () => {
    const { input } = setup(
      root({
        type: 'tabs',
        components: [
          {
            type: 'tab',
            label: 'Name',
            columns: 2,
            components: [text('first', 'First'), text('last', 'Last', { colSpan: 2 })],
          },
        ],
      }),
    );
    const lastCell = input('Last').parentElement!.parentElement!;
    expect(lastCell.style.gridColumn).toBe('span 2');
    expect(lastCell.parentElement!.style.display).toBe('grid');
  });

  it('adds no grid where no columns are set', () => {
    const { input } = setup(root({ type: 'section', components: [text('first', 'First')] }));
    const container = input('First').closest('form')!;
    expect(container.querySelector('[style]')).toBeNull();
  });
});

describe('AutoForm: Content', () => {
  it('renders its text as plain text, never as HTML', () => {
    setup(root({ type: 'content', text: 'Read <b>this</b> & <img src=x onerror=alert(1)>' }));
    const content = screen.getByText('Read <b>this</b> & <img src=x onerror=alert(1)>');
    expect(content.tagName).toBe('P');
    expect(document.querySelector('form b, form img')).toBeNull();
  });

  it('renders in Definition order among Fields', () => {
    setup(
      root({ type: 'content', text: 'Before' }, text('a', 'A'), { type: 'content', text: 'After' }),
    );
    const form = document.querySelector('form')!;
    const order = [...form.querySelectorAll('p, input')].map(
      (element) => element.textContent || element.tagName,
    );
    expect(order).toEqual(['Before', 'INPUT', 'After']);
  });

  it('throws for a widget name it has no Widget for', () => {
    const form = root({ type: 'content', text: 'Hi', widget: 'markdown' });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<AutoForm form={form} onSubmit={() => {}} />)).toThrow(
      'No Widget "markdown" for a Content Component',
    );
    consoleError.mockRestore();
  });
});
