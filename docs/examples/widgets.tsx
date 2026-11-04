// #region widget
import type { TextField, WidgetProps } from '@auto-formisch/react';

export function TextInput({
  value,
  onChange,
  inputProps,
  disabled,
  readOnly,
  node,
}: WidgetProps<string, TextField>) {
  return (
    <input
      {...inputProps}
      className="input"
      placeholder={node.placeholder}
      value={value ?? ''}
      disabled={disabled}
      readOnly={readOnly}
      // Emit `undefined` when empty; the Renderer never sees an empty string.
      onChange={(event) => onChange(event.currentTarget.value || undefined)}
    />
  );
}
// #endregion widget

// #region wrapper
import type { FieldWrapperProps } from '@auto-formisch/react';

export function Wrapper(props: FieldWrapperProps) {
  const { label, description, errors, required, group, children } = props;
  const title = required ? `${label} *` : label;
  const rest = (
    <>
      {description !== undefined && <p id={props.descriptionId}>{description}</p>}
      {/* Always rendered, so that new errors are announced. */}
      <div id={props.errorsId} aria-live="polite" className="errors">
        {errors.map((error, index) => (
          <p key={index}>{error}</p>
        ))}
      </div>
    </>
  );
  return group ? (
    <fieldset className="field">
      <legend>{title}</legend>
      {children}
      {rest}
    </fieldset>
  ) : (
    <div className="field">
      <label htmlFor={props.labelFor}>{title}</label>
      {children}
      {rest}
    </div>
  );
}
// #endregion wrapper

// #region autoform
import { AutoForm, compile, form, label, object, required, text } from '@auto-formisch/react';

const profile = compile(
  form([
    text('name', [label('Name'), required()]),
    object('address', [text('city', [label('City')])], [label('Address')]),
  ]),
);

export function ProfileForm({ onSave }: { onSave: (output: object) => void }) {
  return (
    <AutoForm
      form={profile}
      widgets={{ text: TextInput }}
      fieldWrapper={Wrapper}
      overrides={{ 'address.city': { label: 'Town', placeholder: 'Hà Nội' } }}
      labels={{ submit: 'Lưu' }}
      onSubmit={onSave}
    />
  );
}
// #endregion autoform
