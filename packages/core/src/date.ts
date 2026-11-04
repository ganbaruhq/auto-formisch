import * as v from 'valibot';

const ISO_DATE = v.isoDate().requirement;

/** Whether a `YYYY-MM-DD` string names a day that exists, such as no 30 February. */
function isCalendarDate(value: string): boolean {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0);
  // `setUTCFullYear`, unlike `Date.UTC`, keeps years 0 to 99 as they are.
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** A `date` value and a date Rule requirement: a `YYYY-MM-DD` calendar date. */
export const dateSchema: v.GenericSchema<unknown, string> = v.pipe(
  v.string(),
  v.isoDate(),
  v.check(
    (value) => !ISO_DATE.test(value) || isCalendarDate(value),
    (issue) => `Invalid date: Received ${issue.received}`,
  ),
);
