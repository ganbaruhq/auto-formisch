import type {
  BooleanField,
  Choice,
  ChoiceField,
  ChoiceValue,
  DateField,
  MultiChoiceField,
  NumberField,
  TextField,
} from '@auto-formisch/core';
import { useId } from 'react';
import type {
  ContentProps,
  ObjectProps,
  RepeaterProps,
  WidgetEntry,
  WidgetProps,
} from './contracts';

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

/**
 * `input[type=number]`. Emits a number, or `undefined` while the input holds
 * no valid number, so the store never holds the input's string.
 */
export function NumberInput({
  value,
  onChange,
  inputProps,
  disabled,
  readOnly,
  node,
}: WidgetProps<number, NumberField>) {
  return (
    <input
      {...inputProps}
      type="number"
      value={value ?? ''}
      placeholder={node.placeholder}
      disabled={disabled}
      readOnly={readOnly}
      onChange={(event) => {
        const text = event.currentTarget.value;
        onChange(text === '' ? undefined : Number(text));
      }}
    />
  );
}

/**
 * `input[type=checkbox]`. Emits `true` or `false`; `false` is a value, so an
 * unchecked box the user has touched submits `false`.
 */
export function Checkbox({
  value,
  onChange,
  inputProps,
  disabled,
  readOnly,
}: WidgetProps<boolean, BooleanField>) {
  return (
    <input
      {...inputProps}
      type="checkbox"
      checked={value === true}
      disabled={disabled}
      // A checkbox has no native read-only state.
      aria-readonly={readOnly || undefined}
      onChange={(event) => {
        if (!readOnly) onChange(event.currentTarget.checked);
      }}
    />
  );
}

/** `input[type=date]`, whose value is already `YYYY-MM-DD`. Emits `undefined` when emptied. */
export function DateInput({
  value,
  onChange,
  inputProps,
  disabled,
  readOnly,
}: WidgetProps<string, DateField>) {
  return (
    <input
      {...inputProps}
      type="date"
      value={value ?? ''}
      disabled={disabled}
      readOnly={readOnly}
      onChange={(event) => onChange(event.currentTarget.value || undefined)}
    />
  );
}

/** Each choice as `{value, label}`, with the value itself as the default label. */
const optionsOf = (choices: readonly Choice[]) =>
  choices.map((choice) =>
    typeof choice === 'object'
      ? { value: choice.value, label: choice.label ?? String(choice.value) }
      : { value: choice, label: String(choice) },
  );

/**
 * `select` with an empty option first. Options map back by their position in
 * `choices`, not by the option's string, so a number value stays a number.
 */
export function Select({
  value,
  onChange,
  inputProps,
  disabled,
  readOnly,
  node,
}: WidgetProps<ChoiceValue, ChoiceField>) {
  const options = optionsOf(node.choices);
  const selected = options.findIndex((option) => option.value === value);
  return (
    <select
      {...inputProps}
      value={selected === -1 ? '' : String(selected)}
      disabled={disabled}
      // A select has no native read-only state.
      aria-readonly={readOnly || undefined}
      onChange={(event) => {
        if (readOnly) return;
        const index = event.currentTarget.value;
        onChange(index === '' ? undefined : options[Number(index)].value);
      }}
    >
      <option value="">{node.placeholder ?? ''}</option>
      {options.map((option, index) => (
        <option key={index} value={String(index)}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/**
 * One labelled checkbox per choice, in a group the Field Wrapper names. Emits
 * the checked values in the order of `choices`, or `undefined` when none is.
 * The first checkbox takes the Field's id and ref, so focus on error lands on it.
 */
export function Checkboxes({
  value,
  onChange,
  inputProps,
  disabled,
  readOnly,
  node,
}: WidgetProps<readonly ChoiceValue[], MultiChoiceField>) {
  const { id, ref, ...shared } = inputProps;
  const options = optionsOf(node.choices);
  const checked = new Set(value ?? []);
  const toggle = (choice: ChoiceValue, on: boolean) => {
    const next = options
      .map((option) => option.value)
      .filter((item) => (item === choice ? on : checked.has(item)));
    onChange(next.length > 0 ? next : undefined);
  };
  return (
    <>
      {options.map((option, index) => {
        const optionId = index === 0 ? id : `${id}-${index}`;
        return (
          <div key={index}>
            <input
              {...shared}
              ref={index === 0 ? ref : undefined}
              id={optionId}
              type="checkbox"
              checked={checked.has(option.value)}
              disabled={disabled}
              // A checkbox has no native read-only state.
              aria-readonly={readOnly || undefined}
              onChange={(event) => {
                if (!readOnly) toggle(option.value, event.currentTarget.checked);
              }}
            />
            <label htmlFor={optionId}>{option.label}</label>
          </div>
        );
      })}
    </>
  );
}

/** Content's text in a paragraph. React escapes it, so markup shows as text. */
export function ContentText({ node }: ContentProps) {
  return <p>{node.text}</p>;
}

/**
 * An `object` as a `fieldset` named by its label (or `name`), described by
 * its description. Native `disabled` disables every control inside.
 */
export function ObjectFieldset({ node, disabled, children }: ObjectProps) {
  const descriptionId = useId();
  const hasDescription = node.description !== undefined;
  return (
    <fieldset disabled={disabled} aria-describedby={hasDescription ? descriptionId : undefined}>
      <legend>{node.label ?? node.name}</legend>
      {hasDescription && <div id={descriptionId}>{node.description}</div>}
      {children}
    </fieldset>
  );
}

/**
 * A Repeater as a `fieldset` named by its label (or `name`). Each row is a
 * group named "<label> <n>" with buttons to move it up or down and remove it;
 * an Add button follows the rows. The Repeater's own errors sit in a polite
 * live region that describes the `fieldset` while it has errors.
 */
export function RepeaterList({ rows, add, canAdd, disabled, errors, node }: RepeaterProps) {
  const id = useId();
  const descriptionId = `${id}-description`;
  const errorsId = `${id}-errors`;
  const label = node.label ?? node.name;
  const describedBy = [
    node.description !== undefined ? descriptionId : undefined,
    errors.length > 0 ? errorsId : undefined,
  ].filter((value) => value !== undefined);
  return (
    <fieldset aria-describedby={describedBy.length > 0 ? describedBy.join(' ') : undefined}>
      <legend>{label}</legend>
      {node.description !== undefined && <div id={descriptionId}>{node.description}</div>}
      {rows.map((row) => (
        <div key={row.key} role="group" aria-label={`${label} ${row.index + 1}`}>
          {row.children}
          <button
            type="button"
            disabled={disabled || row.index === 0}
            onClick={() => row.moveTo(row.index - 1)}
          >
            Move up
          </button>
          <button
            type="button"
            disabled={disabled || row.index === rows.length - 1}
            onClick={() => row.moveTo(row.index + 1)}
          >
            Move down
          </button>
          <button type="button" disabled={disabled} onClick={row.remove}>
            Remove
          </button>
        </div>
      ))}
      <div id={errorsId} aria-live="polite">
        {errors.map((error, index) => (
          <div key={index}>{error}</div>
        ))}
      </div>
      <button type="button" disabled={!canAdd} onClick={add}>
        Add
      </button>
    </fieldset>
  );
}

/** The default Widget map. Keys are a Field's or Content's `widget ?? type`. */
export const defaultWidgets: Readonly<Record<string, WidgetEntry>> = {
  text: { component: TextInput, appliesTo: ['text'] },
  number: { component: NumberInput, appliesTo: ['number'] },
  boolean: { component: Checkbox, appliesTo: ['boolean'] },
  choice: { component: Select, appliesTo: ['choice'] },
  multi_choice: { component: Checkboxes, group: true, appliesTo: ['multi_choice'] },
  date: { component: DateInput, appliesTo: ['date'] },
  object: { component: ObjectFieldset, appliesTo: ['object'] },
  repeater: { component: RepeaterList, appliesTo: ['repeater'] },
  content: { component: ContentText, appliesTo: ['content'] },
};
