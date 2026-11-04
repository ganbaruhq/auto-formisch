import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AutoForm, compile } from '@auto-formisch/react';
import { saved, type Company, type Customer } from './app';
import repeaterJson from './repeater.json';
import { ContactForm as JsonContactForm } from './contact-form';
import { ContactForm as BuilderContactForm } from './contact-builder';
import { handleContact } from './contact-server';
import { EditCustomer, EditWithWarning, NewCustomer } from './edit-record';
import { EditCompany } from './lock';
import { ProfileForm } from './widgets';
import { ReviewForm } from './extensions';
import { SignupWizard } from './wizard';

// The client-side doc examples, rendered and used like a person would.

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const field = <E extends HTMLElement = HTMLInputElement>(label: string) =>
  screen.getByLabelText<E>(label);
const click = (name: string) => userEvent.click(screen.getByRole('button', { name }));
const step = () =>
  screen.getByRole('navigation', { name: 'Pages' }).querySelector('p')!.textContent;
const errorsOf = (element: HTMLElement) =>
  (element.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .filter((id) => id.endsWith('-errors'))
    .map((id) => document.getElementById(id)!.textContent);

describe('getting started', () => {
  it('sends the JSON form to the server and shows its errors on the Fields', async () => {
    // The server says no, which the browser alone wouldn't: this address is taken.
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      const response = await handleContact(new Request('https://example.com', init));
      if (response.status !== 204) return response;
      return Response.json(
        { errors: [{ message: 'This address is blocked', path: ['email'] }] },
        { status: 422 },
      );
    });
    render(<JsonContactForm />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(errorsOf(field('Name'))).toEqual(['Required']));

    await user.type(field('Name'), 'Ada');
    await user.type(field('Email address'), 'ada@example.com');
    await user.selectOptions(field('Topic'), 'Support');
    await user.type(field('Message'), 'Hello');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() =>
      expect(errorsOf(field('Email address'))).toEqual(['This address is blocked']),
    );
    expect(saved.at(-1)).toEqual({
      name: 'Ada',
      email: 'ada@example.com',
      topic: 'support',
      message: 'Hello',
    });
  });

  it('shows a thrown error in the general error region', async () => {
    vi.stubGlobal('fetch', async () => new Response(null, { status: 500 }));
    render(<JsonContactForm />);
    const user = userEvent.setup();
    await user.type(field('Name'), 'Ada');
    await user.type(field('Email address'), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        'Your message could not be sent. Try again later.',
      ),
    );
  });

  it('renders the Fluent Builder form with a typed onSubmit', async () => {
    const onSend = vi.fn();
    render(<BuilderContactForm onSend={onSend} />);
    const user = userEvent.setup();
    expect(field('Email address').type).toBe('email');
    await user.type(field('Name'), 'Ada');
    await user.type(field('Email address'), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() =>
      expect(onSend).toHaveBeenCalledWith({ name: 'Ada', email: 'ada@example.com' }),
    );
  });
});

describe('Repeaters', () => {
  it('starts with one row, and adds rows up to max_items', async () => {
    render(<AutoForm form={compile(repeaterJson)} onSubmit={() => {}} />);
    const user = userEvent.setup();
    expect(screen.getAllByLabelText('Street')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getAllByLabelText('Street')).toHaveLength(3);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Add' }).disabled).toBe(true);
    expect(screen.queryByLabelText('Ward')).toBeNull();
    await user.selectOptions(field('Country'), 'VN');
    expect(screen.getAllByLabelText('Ward')).toHaveLength(3);
  });
});

describe('Wizard', () => {
  it('steps through the shown Pages with the custom actions', async () => {
    const onDone = vi.fn();
    render(<SignupWizard onDone={onDone} />);
    const user = userEvent.setup();
    expect(step()).toBe('Page 1 of 2');
    await click('Continue');
    await waitFor(() => expect(errorsOf(field('Email'))).toEqual(['Required']));
    await user.type(field('Email'), 'ada@example.com');
    await user.selectOptions(field('Plan'), 'team');
    expect(step()).toBe('Page 1 of 3');
    await user.selectOptions(field('Plan'), 'free');
    expect(step()).toBe('Page 1 of 2');
    await click('Continue');
    await waitFor(() => expect(screen.getByRole('group', { name: 'Confirm' })).toBeTruthy());
    await click('Back');
    await waitFor(() => expect(screen.getByRole('group', { name: 'Account' })).toBeTruthy());
    await click('Continue');
    await waitFor(() => expect(screen.getByRole('group', { name: 'Confirm' })).toBeTruthy());
    await click('Sign up');
    await waitFor(() =>
      expect(errorsOf(field('I accept the terms'))).toEqual(['Accept the terms to continue']),
    );
    await user.click(field('I accept the terms'));
    await click('Sign up');
    await waitFor(() =>
      expect(onDone).toHaveBeenCalledWith({ email: 'ada@example.com', plan: 'free', terms: true }),
    );
  });
});

describe('Widgets', () => {
  it('uses the custom Widget, Field Wrapper, overrides and labels', async () => {
    const onSave = vi.fn();
    render(<ProfileForm onSave={onSave} />);
    const user = userEvent.setup();
    expect(field('Town').className).toBe('input');
    expect(field('Town').placeholder).toBe('Hà Nội');
    expect(screen.getByText('Name *')).toBeTruthy();
    await click('Lưu');
    await waitFor(() => expect(errorsOf(field('Name *'))).toEqual(['Required']));
    await user.type(field('Name *'), 'Ada');
    await user.type(field('Town'), 'Huế');
    await user.clear(field('Town'));
    await click('Lưu');
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ name: 'Ada', address: {} }));
  });
});

describe('editing a record', () => {
  const record: Customer = {
    id: 'c1',
    createdAt: '2026-01-01',
    name: 'Ada',
    contacts: [{ id: 'k1', email: 'ada@example.com' }],
  };

  it('starts from the record, with no defaults, and keeps the hidden row id', async () => {
    const onSave = vi.fn();
    render(<EditCustomer record={record} onSave={onSave} />);
    expect(field('Name').value).toBe('Ada');
    expect(field<HTMLSelectElement>('Country').value).toBe('');
    await click('Submit');
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        name: 'Ada',
        contacts: [{ id: 'k1', email: 'ada@example.com' }],
      }),
    );
  });

  it('prefills a new record over the defaults', async () => {
    const onSave = vi.fn();
    render(<NewCustomer prefill={{ name: 'Ada' }} onSave={onSave} />);
    await click('Submit');
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ name: 'Ada', country: 'VN', contacts: [] }),
    );
  });

  it('reads isDirty from the store', async () => {
    render(<EditWithWarning record={record} onSave={() => {}} />);
    const user = userEvent.setup();
    expect(screen.queryByRole('status')).toBeNull();
    await user.type(field('Name'), '!');
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('You have unsaved changes.'),
    );
  });
});

describe('Locked Fields', () => {
  it('shows the Locked value read-only, and Conditions follow it', async () => {
    const onSave = vi.fn();
    const company: Company = { id: 'c1', type: 'company', name: 'Acme', taxId: 'T1' };
    const { rerender } = render(<EditCompany company={company} onSave={onSave} />);
    expect(field<HTMLSelectElement>('Type').disabled).toBe(true);
    expect(field('Tax ID').value).toBe('T1');
    await click('Submit');
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ type: 'company', name: 'Acme', taxId: 'T1' }),
    );
    rerender(<EditCompany company={{ id: 'p1', type: 'person', name: 'Ada' }} onSave={onSave} />);
    expect(field('Name').value).toBe('Ada');
    expect(screen.queryByLabelText('Tax ID')).toBeNull();
  });
});

describe('custom Field Types', () => {
  it('renders the custom Widget and submits its value', async () => {
    const onSave = vi.fn();
    render(<ReviewForm onSave={onSave} />);
    await click('Submit');
    await waitFor(() => expect(errorsOf(screen.getByRole('radiogroup'))).toEqual(['Required']));
    await userEvent.click(screen.getByRole('radio', { name: '4 stars' }));
    await click('Submit');
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ score: 4 }));
  });
});
