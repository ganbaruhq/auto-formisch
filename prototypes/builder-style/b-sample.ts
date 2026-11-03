// Author-side sample form for AF-5 (THROWAWAY).
import { email, eq, form, grid, label, repeater, required, section, select, text, toggle, visible } from './b-functions';
import { assertType, type Equal, type ExpectedOutput, type FormDefinition } from './shared';


const signup = form([
  section('Contact', [
    grid(2, [
      text('name', [label('Full name'), required()]),
      text('email', [email(), required()]),
    ]),
  ]),
  select('country', ['VN', 'US'], [required()]),
  text('taxId', [required(), visible(eq('country', 'VN'))]),
  repeater('addresses', [
    text('street', [required()]),
    text('city'),
  ]),
  toggle('newsletter', [label('Subscribe')]),
]);

type Output = (typeof signup)['~output'];
assertType<Equal<Output, ExpectedOutput>>();

// The builder output already IS the Definition: no toJSON step, structured-clonable to a Worker.
export const definitionB: FormDefinition = signup;

import { color } from './b-functions';
const theme = form([color('brand', [required()])]);
assertType<Equal<(typeof theme)['~output'], { brand: `#${string}` }>>();
