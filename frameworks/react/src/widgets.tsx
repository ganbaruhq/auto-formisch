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
import { useRenderContext } from './context';
import type {
  ContentProps,
  ObjectProps,
  RepeaterProps,
  WidgetEntry,
  WidgetProps,
} from './contracts';

/** `input[type=text]`. Emits `undefined` when emptied. */
export const TextInput = (props: WidgetProps<string, TextField>) => (
  <TextLikeInput {...props} type="text" />
);

/** `input[type=email]`, the `email` Widget. Validation is still the Field's Rules. */
export const EmailInput = (props: WidgetProps<string, TextField>) => (
  <TextLikeInput {...props} type="email" />
);

/** `input[type=url]`, the `url` Widget. Validation is still the Field's Rules. */
export const UrlInput = (props: WidgetProps<string, TextField>) => (
  <TextLikeInput {...props} type="url" />
);

/** `input[type=password]`, the `password` Widget. */
export const PasswordInput = (props: WidgetProps<string, TextField>) => (
  <TextLikeInput {...props} type="password" />
);

function TextLikeInput({
  value,
  onChange,
  inputProps,
  disabled,
  readOnly,
  node,
  type,
}: WidgetProps<string, TextField> & { readonly type: 'text' | 'email' | 'url' | 'password' }) {
  return (
    <input
      {...inputProps}
      type={type}
      value={value ?? ''}
      placeholder={node.placeholder}
      disabled={disabled}
      readOnly={readOnly}
      onChange={(event) => onChange(event.currentTarget.value || undefined)}
    />
  );
}

/** `textarea`, the `textarea` Widget. Emits `undefined` when emptied. */
export function Textarea({
  value,
  onChange,
  inputProps,
  disabled,
  readOnly,
  node,
}: WidgetProps<string, TextField>) {
  return (
    <textarea
      {...inputProps}
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
export const Checkbox = (props: WidgetProps<boolean, BooleanField>) => (
  <BooleanCheckbox {...props} />
);

/** The `toggle` Widget: a checkbox with the `switch` role. Emits like `Checkbox`. */
export const Toggle = (props: WidgetProps<boolean, BooleanField>) => (
  <BooleanCheckbox {...props} role="switch" />
);

function BooleanCheckbox({
  value,
  onChange,
  inputProps,
  disabled,
  readOnly,
  role,
}: WidgetProps<boolean, BooleanField> & { readonly role?: 'switch' }) {
  return (
    <input
      {...inputProps}
      type="checkbox"
      role={role}
      checked={value === true}
      aria-checked={role === undefined ? undefined : value === true}
      disabled={disabled || readOnly}
      // No native read-only state, so a Locked one is disabled.
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
      disabled={disabled || readOnly}
      // No native read-only state, so a Locked one is disabled.
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
 * The `radio` Widget: one labelled radio per choice in a `radiogroup` that
 * carries the Field's required, invalid and described-by state. Options map
 * back by position, like `Select`. The first radio takes the Field's id and
 * ref, so focus on error lands on it.
 */
export function Radios({
  value,
  onChange,
  inputProps,
  disabled,
  readOnly,
  node,
}: WidgetProps<ChoiceValue, ChoiceField>) {
  const {
    id,
    ref,
    'aria-invalid': invalid,
    'aria-describedby': describedBy,
    'aria-required': required,
    ...shared
  } = inputProps;
  const options = optionsOf(node.choices);
  return (
    <div
      role="radiogroup"
      // The Field Wrapper's legend names the fieldset; a radiogroup needs its own name.
      aria-label={node.label ?? node.name}
      aria-invalid={invalid}
      aria-describedby={describedBy}
      aria-required={required}
      aria-readonly={readOnly || undefined}
    >
      {options.map((option, index) => {
        const optionId = index === 0 ? id : `${id}-${index}`;
        return (
          <div key={index}>
            <input
              {...shared}
              ref={index === 0 ? ref : undefined}
              id={optionId}
              type="radio"
              value={String(index)}
              checked={option.value === value}
              disabled={disabled || readOnly}
              onChange={() => {
                if (!readOnly) onChange(option.value);
              }}
            />
            <label htmlFor={optionId}>{option.label}</label>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The `multi_select` Widget: `select multiple`. Emits the selected values in
 * the order of `choices`, or `undefined` when none is; options map back by
 * position, so number values stay numbers.
 */
export function MultiSelect({
  value,
  onChange,
  inputProps,
  disabled,
  readOnly,
  node,
}: WidgetProps<readonly ChoiceValue[], MultiChoiceField>) {
  const options = optionsOf(node.choices);
  const selected = options.flatMap((option, index) =>
    (value ?? []).includes(option.value) ? [String(index)] : [],
  );
  return (
    <select
      {...inputProps}
      multiple
      value={selected}
      disabled={disabled || readOnly}
      // No native read-only state, so a Locked one is disabled.
      aria-readonly={readOnly || undefined}
      onChange={(event) => {
        if (readOnly) return;
        const next = [...event.currentTarget.selectedOptions].map(
          (option) => options[Number(option.value)].value,
        );
        onChange(next.length > 0 ? next : undefined);
      }}
    >
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
              disabled={disabled || readOnly}
              // No native read-only state, so a Locked one is disabled.
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
 * live region that describes the `fieldset` while it has errors; the
 * `fieldset` takes focus when a failed submit stops at them.
 */
export function RepeaterList({
  rows,
  add,
  canAdd,
  disabled,
  errors,
  focusRef,
  node,
}: RepeaterProps) {
  const { labels } = useRenderContext();
  const id = useId();
  const descriptionId = `${id}-description`;
  const errorsId = `${id}-errors`;
  const label = node.label ?? node.name;
  const describedBy = [
    node.description !== undefined ? descriptionId : undefined,
    errors.length > 0 ? errorsId : undefined,
  ].filter((value) => value !== undefined);
  return (
    <fieldset
      ref={focusRef}
      // Focusable from script only, so a failed submit can move to the group.
      tabIndex={-1}
      aria-describedby={describedBy.length > 0 ? describedBy.join(' ') : undefined}
    >
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
            {labels.moveUp}
          </button>
          <button
            type="button"
            disabled={disabled || row.index === rows.length - 1}
            onClick={() => row.moveTo(row.index + 1)}
          >
            {labels.moveDown}
          </button>
          <button type="button" disabled={disabled} onClick={row.remove}>
            {labels.remove}
          </button>
        </div>
      ))}
      <div id={errorsId} aria-live="polite">
        {errors.map((error, index) => (
          <div key={index}>{error}</div>
        ))}
      </div>
      <button type="button" disabled={!canAdd} onClick={add}>
        {labels.add}
      </button>
    </fieldset>
  );
}

/** The default Widget map. Keys are a Field's or Content's `widget ?? type`. */
/**
 * The `hidden` Widget: keeps a value, such as a row's `id`, with no UI. The
 * Renderer draws no Field Wrapper for it. The client can still change it.
 */
export const HiddenValue = (_props: WidgetProps) => null;

export const defaultWidgets: Readonly<Record<string, WidgetEntry>> = {
  text: { component: TextInput, appliesTo: ['text'] },
  textarea: { component: Textarea, appliesTo: ['text'] },
  email: { component: EmailInput, appliesTo: ['text'] },
  url: { component: UrlInput, appliesTo: ['text'] },
  password: { component: PasswordInput, appliesTo: ['text'] },
  number: { component: NumberInput, appliesTo: ['number'] },
  boolean: { component: Checkbox, appliesTo: ['boolean'] },
  toggle: { component: Toggle, appliesTo: ['boolean'] },
  choice: { component: Select, appliesTo: ['choice'] },
  radio: { component: Radios, group: true, appliesTo: ['choice'] },
  multi_choice: { component: Checkboxes, group: true, appliesTo: ['multi_choice'] },
  multi_select: { component: MultiSelect, appliesTo: ['multi_choice'] },
  date: { component: DateInput, appliesTo: ['date'] },
  object: { component: ObjectFieldset, appliesTo: ['object'] },
  repeater: { component: RepeaterList, appliesTo: ['repeater'] },
  content: { component: ContentText, appliesTo: ['content'] },
  // Any value Field, custom types included; the Renderer rejects the others.
  hidden: { component: HiddenValue },
};
