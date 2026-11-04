import { useField } from '@formisch/react';
import type { FieldNode, PathKey } from '@auto-formisch/core';
import type { InputProps, WidgetProps } from './contracts';
import { useRenderContext } from './context';

interface FieldProps {
  readonly node: FieldNode;
  /** The Field's data path. Layouts add no segment. */
  readonly path: readonly PathKey[];
}

/** Renders one single-value Field: its Widget inside the Field Wrapper. */
export function Field({ node, path }: FieldProps) {
  const { store, widgets, fieldWrapper: Wrapper, idPrefix } = useRenderContext();
  // Paths come from a JSON Definition, so they cannot be typed against the schema.
  const field = useField(store, { path: path as [string] });

  const key = node.widget ?? node.type;
  const entry = widgets[key];
  if (entry === undefined) {
    throw new Error(`No Widget "${key}" for the Field at "${path.join('.')}"`);
  }

  const id = `${idPrefix}-${path.join('.')}`;
  const descriptionId = `${id}-description`;
  const errorsId = `${id}-errors`;
  const errors = field.errors ?? [];
  const required = node.required === true;
  const describedBy = [
    node.description !== undefined ? descriptionId : undefined,
    errors.length > 0 ? errorsId : undefined,
  ].filter((value) => value !== undefined);

  const inputProps: InputProps = {
    id,
    name: field.props.name,
    ref: field.props.ref,
    onFocus: field.props.onFocus,
    onBlur: field.props.onBlur,
    'aria-invalid': errors.length > 0 || undefined,
    'aria-describedby': describedBy.length > 0 ? describedBy.join(' ') : undefined,
    'aria-required': required || undefined,
  };
  const widgetProps: WidgetProps = {
    value: field.input,
    onChange: field.onChange,
    inputProps,
    errors,
    disabled: false,
    readOnly: false,
    required,
    node,
  };
  const Widget = entry.component;

  return (
    <Wrapper
      node={node}
      label={node.label ?? node.name}
      description={node.description}
      errors={errors}
      required={required}
      disabled={false}
      readOnly={false}
      group={entry.group === true}
      labelFor={id}
      descriptionId={descriptionId}
      errorsId={errorsId}
    >
      <Widget {...widgetProps} />
    </Wrapper>
  );
}
