import { useCallback, useContext, type ComponentType } from 'react';
import { useField } from '@formisch/react';
import type { PathKey, ValueField } from '@auto-formisch/core';
import type { InputProps, WidgetProps } from './contracts';
import { useCondition, useRenderContext } from './context';
import { storePath } from './paths';
import { isHiddenWidget, keyOf } from './submission';
import { ShowErrorsContext } from './Wizard';

interface FieldProps {
  readonly node: ValueField;
  /** The data path of the scope the Field sits in. Layouts add no segment. */
  readonly scope: readonly PathKey[];
}

/**
 * Renders one single-value Field: its Widget inside the Field Wrapper. A
 * disabled Field is Inactive, so it is never required. A Locked Field is
 * read-only: its Widget gets the Locked value, and its changes go nowhere,
 * whether or not the Widget honours `readOnly`.
 */
export function Field({ node: declared, scope }: FieldProps) {
  const {
    form,
    store,
    widgetOf,
    fieldWrapper: Wrapper,
    labels,
    idPrefix,
    focusElements,
  } = useRenderContext();
  const path = [...scope, declared.name];
  const field = useField(store, { path: storePath(path) });
  const key = keyOf(path);
  // Only the Renderer keeps the element, not Formisch, so that a failed
  // submit moves focus once, to the first error in Definition order (AF-34):
  // Formisch's own submit focuses the first focusable element in store order,
  // which skips a closed Tab or another Wizard Page.
  const ref = useCallback(
    (element: HTMLElement | null) => {
      if (element === null) return;
      focusElements.set(key, element);
      return () => {
        if (focusElements.get(key) === element) focusElements.delete(key);
      };
    },
    [focusElements, key],
  );

  const { node, entry } = widgetOf(declared);
  const id = `${idPrefix}-${path.join('.')}`;
  const descriptionId = `${id}-description`;
  const errorsId = `${id}-errors`;
  // A Wizard Page not attempted yet keeps its errors to itself.
  const shown = (useContext(ShowErrorsContext) && field.errors) || [];
  // `NaN` is text the Widget could not read as a number: the type error that
  // it fails with would read "Expected number but received NaN".
  const errors = shown.length > 0 && Number.isNaN(field.input) ? [labels.invalidNumber] : shown;
  // The declared node, which the evaluator knows; `node` has the overrides.
  const disabled = useCondition((state) => state.isDisabled(declared, scope));
  // Locks never reach into Repeater rows, so the declared node is enough.
  const readOnly = form.locked.has(declared);
  const requiredHere = useCondition((state) => state.isRequired(declared, scope));
  const required = !disabled && !readOnly && requiredHere;
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
    value: readOnly ? form.locked.get(declared) : field.input,
    onChange: readOnly ? ignore : field.onChange,
    inputProps,
    errors,
    disabled,
    readOnly,
    required,
    node,
  };
  const Widget = entry.component as ComponentType<WidgetProps>;
  // The one Widget with no Field Wrapper: its errors show in the general
  // error region instead.
  if (isHiddenWidget(node)) return <Widget {...widgetProps} />;

  return (
    <Wrapper
      node={node}
      label={node.label ?? node.name}
      description={node.description}
      errors={errors}
      required={required}
      disabled={disabled}
      readOnly={readOnly}
      group={entry.group === true}
      labelFor={id}
      descriptionId={descriptionId}
      errorsId={errorsId}
    >
      <Widget {...widgetProps} />
    </Wrapper>
  );
}

/** The `onChange` of a Locked Field. */
const ignore = () => {};
