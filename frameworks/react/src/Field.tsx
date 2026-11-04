import { useCallback, type ComponentType } from 'react';
import { useField } from '@formisch/react';
import type { PathKey, ValueField } from '@auto-formisch/core';
import type { InputProps, WidgetProps } from './contracts';
import { useRenderContext } from './context';
import { keyOf } from './submission';

interface FieldProps {
  readonly node: ValueField;
  /** The data path of the scope the Field sits in. Layouts add no segment. */
  readonly scope: readonly PathKey[];
}

/**
 * Renders one single-value Field: its Widget inside the Field Wrapper. A
 * disabled Field is Inactive, so it is never required.
 */
export function Field({ node: declared, scope }: FieldProps) {
  const {
    store,
    conditions,
    widgetOf,
    fieldWrapper: Wrapper,
    idPrefix,
    focusElements,
  } = useRenderContext();
  const path = [...scope, declared.name];
  // Paths come from a JSON Definition, so they cannot be typed against the schema.
  const field = useField(store, { path: path as [string] });
  const key = keyOf(path);
  const formischRef = field.props.ref;
  // Formisch keeps the element too; the Renderer's own copy lets a failed
  // submit focus the first error in Definition order.
  const ref = useCallback(
    (element: HTMLElement | null) => {
      if (element === null) return;
      formischRef(element as HTMLInputElement);
      focusElements.set(key, element);
      return () => {
        if (focusElements.get(key) === element) focusElements.delete(key);
      };
    },
    [formischRef, focusElements, key],
  );

  const { node, entry } = widgetOf(declared);
  const id = `${idPrefix}-${path.join('.')}`;
  const descriptionId = `${id}-description`;
  const errorsId = `${id}-errors`;
  const errors = field.errors ?? [];
  // The declared node, which the evaluator knows; `node` has the overrides.
  const disabled = conditions.isDisabled(declared, scope);
  const required = !disabled && conditions.isRequired(declared, scope);
  const describedBy = [
    node.description !== undefined ? descriptionId : undefined,
    errors.length > 0 ? errorsId : undefined,
  ].filter((value) => value !== undefined);

  const inputProps: InputProps = {
    id,
    name: field.props.name,
    ref,
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
    disabled,
    readOnly: false,
    required,
    node,
  };
  const Widget = entry.component as ComponentType<WidgetProps>;

  return (
    <Wrapper
      node={node}
      label={node.label ?? node.name}
      description={node.description}
      errors={errors}
      required={required}
      disabled={disabled}
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
