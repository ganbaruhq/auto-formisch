// #region builder
import {
  accepted,
  boolean,
  choice,
  compile,
  email,
  eq,
  label,
  page,
  required,
  text,
  visible,
  wizard,
} from '@auto-formisch/react';

export const signup = wizard([
  page('Account', [
    text('email', [label('Email'), required(), email()]),
    choice('plan', ['free', 'team'], [label('Plan'), required()]),
  ]),
  page('Team', [text('team', [label('Team name'), required()])], [visible(eq('plan', 'team'))]),
  page('Confirm', [
    boolean('terms', [
      label('I accept the terms'),
      required('Accept the terms to continue'),
      accepted('Accept the terms to continue'),
    ]),
  ]),
]);

export const signupForm = compile(signup);
// #endregion builder

// #region actions
import { AutoForm, type ActionsProps, type FormOutput } from '@auto-formisch/react';

function Navigation({ wizard, isSubmitting }: ActionsProps) {
  if (wizard === null) return <button type="submit">Send</button>;
  const position = wizard.pages.findIndex((page) => page.isCurrent) + 1;
  return (
    <nav aria-label="Pages">
      <p>
        Page {position} of {wizard.pages.length}
      </p>
      {!wizard.isFirst && (
        <button type="button" onClick={wizard.back}>
          Back
        </button>
      )}
      {/* A native submit before the last Page runs "Next". */}
      <button type="submit" disabled={isSubmitting}>
        {wizard.isLast ? 'Sign up' : 'Continue'}
      </button>
    </nav>
  );
}

export function SignupWizard({ onDone }: { onDone: (output: FormOutput) => void }) {
  return (
    <AutoForm form={signupForm} actions={(props) => <Navigation {...props} />} onSubmit={onDone} />
  );
}
// #endregion actions
