import type { TextField } from '@auto-formisch/core';
import type { ContentProps, WidgetEntry, WidgetProps } from './contracts';

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

/** Content's text in a paragraph. React escapes it, so markup shows as text. */
export function ContentText({ node }: ContentProps) {
  return <p>{node.text}</p>;
}

/** The default Widget map. Keys are a Field's or Content's `widget ?? type`. */
export const defaultWidgets: Readonly<Record<string, WidgetEntry>> = {
  text: { component: TextInput, appliesTo: ['text'] },
  content: { component: ContentText, appliesTo: ['content'] },
};
