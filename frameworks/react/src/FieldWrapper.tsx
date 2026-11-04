import type { FieldWrapperProps } from './contracts';

/**
 * The default Field Wrapper: label, Widget, description, then errors in a
 * polite live region that is always present so that changes are announced.
 */
export function FieldWrapper({
  label,
  description,
  errors,
  group,
  labelFor,
  descriptionId,
  errorsId,
  children,
}: FieldWrapperProps) {
  const rest = (
    <>
      {description !== undefined && <div id={descriptionId}>{description}</div>}
      <div id={errorsId} aria-live="polite">
        {errors.map((error, index) => (
          <div key={index}>{error}</div>
        ))}
      </div>
    </>
  );
  if (group) {
    return (
      <fieldset>
        <legend>{label}</legend>
        {children}
        {rest}
      </fieldset>
    );
  }
  return (
    <div>
      <label htmlFor={labelFor}>{label}</label>
      {children}
      {rest}
    </div>
  );
}
