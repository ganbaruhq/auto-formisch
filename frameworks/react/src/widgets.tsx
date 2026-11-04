import type { TextField } from '@auto-formisch/core';
import type { WidgetEntry, WidgetProps } from './contracts';

/** `input[type=text]`. Emits `undefined` when emptied. */
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
      type="text"
      value={value ?? ''}
      placeholder={node.placeholder}
      disabled={disabled}
      readOnly={readOnly}
      onChange={(event) => onChange(event.currentTarget.value || undefined)}
    />
  );
}

/** The default Widget map. Keys are a Field's `widget ?? type`. */
export const defaultWidgets: Readonly<Record<string, WidgetEntry>> = {
  text: { component: TextInput, appliesTo: ['text'] },
};
