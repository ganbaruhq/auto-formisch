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

/** The default Widget map. Keys are a Field's `widget ?? type`. */
export const defaultWidgets: Readonly<Record<string, WidgetEntry>> = {
  text: { component: TextInput, appliesTo: ['text'] },
  number: { component: NumberInput, appliesTo: ['number'] },
  boolean: { component: Checkbox, appliesTo: ['boolean'] },
  choice: { component: Select, appliesTo: ['choice'] },
  multi_choice: { component: Checkboxes, group: true, appliesTo: ['multi_choice'] },
  date: { component: DateInput, appliesTo: ['date'] },
};
