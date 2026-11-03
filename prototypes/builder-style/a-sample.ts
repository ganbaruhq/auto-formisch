// Author-side sample form for AF-5 (THROWAWAY).
import { Form, Grid, Repeater, Section, Select, TextInput, Toggle, when } from './a-classes';
import { assertType, type Equal, type ExpectedOutput } from './shared';


const signup = Form.make([
  Section.make('Contact').schema([
    Grid.make(2).schema([
      TextInput.make('name').label('Full name').required(),
      TextInput.make('email').email().required(),
    ]),
  ]),
  Select.make('country').options(['VN', 'US']).required(),
  TextInput.make('taxId').required().visible(when('country').eq('VN')),
  Repeater.make('addresses').schema([
    TextInput.make('street').required(),
    TextInput.make('city'),
  ]),
  Toggle.make('newsletter').label('Subscribe'),
]);

type Output = (typeof signup)['~output'];
assertType<Equal<Output, ExpectedOutput>>();

export const definitionA = signup.toDefinition();

import { ColorPicker } from './a-classes';
const theme = Form.make([ColorPicker.make('brand').swatches(['#000', '#fff']).required()]);
assertType<Equal<(typeof theme)['~output'], { brand: `#${string}` }>>();
