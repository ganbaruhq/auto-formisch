# How SurveyJS, RJSF and Filament model forms (AF-2)

Research for the Auto Formisch v1 spec. It compares three form models to inform the "Form Definition shape" decision. The topics are the element tree, how Layout attaches to it and whether Layout changes the data path, nested objects and arrays, custom field types and widgets, and how each format is versioned.

Already decided (not reopened here): one element tree (SurveyJS/Filament style), a Valibot schema compiled from the Definition, a TypeScript Fluent Builder inspired by Filament. v1 scope is basic Fields, nested objects, Repeater, Layout (Section, Grid, Tabs, Wizard) and Conditions.

Versions read (2026-10-30):

- **SurveyJS Form Library**: `surveyjs/survey-library@master` docs and `packages/survey-core/src/survey.ts`, plus the published JSON Schema `docs/surveyjs_definition.json`.
- **react-jsonschema-form (RJSF)**: `rjsf-team/react-jsonschema-form@main` (v6 line), `packages/docs/docs/**`.
- **Filament**: `filamentphp/filament@5.x` (latest release `v5.11.0`, 2026-10-26), `packages/{forms,schemas}/docs/**` and source. The v4 upgrade guide comes from the `4.x` branch.

Citations point at the source Markdown or code on GitHub. Each source file is also published on the vendor's doc site.

## TL;DR

- **SurveyJS** has one JSON tree: `pages[] → elements[]`, where an element is a `panel` (container) or a question. **Panels and pages are pure layout and do not appear in the data.** Results are keyed by question `name` (or `valueName`). Only *questions* create nesting: `paneldynamic`/`matrixdynamic` produce arrays of objects, and composite or `multipletext` questions produce objects. Custom types are registered in a global `Serializer`/`ElementFactory` plus a renderer factory, and the JSON references them by `type` string. Versioning is a soft `sjsVersion` string that only triggers a console warning. Old property names are kept as `alternativeName` aliases.
- **RJSF** has two parallel trees. The data model is JSON Schema (`properties`, `items`) and the UI model is a `uiSchema` that "follows the tree structure of the form field hierarchy". **Layout is not a node in the data tree.** It is either a per-object template or the `LayoutGridField` overlay, which references fields by dotted data path. There are no built-in Tabs or Wizard. Conditions are JSON Schema `dependencies`/`if-then-else`. Widgets and fields are registered as React components on `<Form widgets fields>` and referenced by string (`ui:widget`). The uiSchema has no version field: v6 removed `classNames` and `enumNames` outright.
- **Filament** has one PHP component tree: `Schema::components([...])` with fields and layout components (`Grid`, `Section`, `Tabs`, `Wizard`, `Fieldset`) nested via `->schema([...])`. **Data path = container state path + the component's own `statePath`**. `Field::make($name)` sets `statePath($name)`, layout components have none, so **layout is transparent unless you explicitly give it a `statePath`**. `Repeater::make('members')->schema([...])` produces an array of objects. Custom fields are PHP classes extending `Field` with a view or JS renderer. The format is PHP code, not JSON, so it is "versioned" by the Composer major version plus an upgrade script.

## 1. Comparison table

| Topic | SurveyJS | RJSF | Filament | Lean for Auto Formisch |
| --- | --- | --- | --- | --- |
| Tree shape | One JSON tree: survey → `pages[]` → `elements[]` (panel / question), panels nest | Two trees: JSON Schema (data) + `uiSchema` (UI) mirroring it by property key | One PHP object tree: `Schema` → components, children via `->schema([...])` / `->tabs([...])` / `Wizard::make([...])` | One tree (decided) |
| Node discriminator | `type` string (`"text"`, `"panel"`, `"paneldynamic"`, ...) | JSON Schema `type` + optional `ui:widget` / `ui:field` | PHP class (`TextInput`, `Section`, `Repeater`, ...) | `type` (or `kind`) string |
| Field identity | `name` (unique, also the data key unless `valueName`) | Property key in `properties` | `make('name')` → `name` + `statePath` | `name` = data key segment |
| Layout as a node? | Yes: `page`, `panel` | No: object template, or `ui:layoutGrid` overlay that lists field paths | Yes: `Grid`, `Section`, `Fieldset`, `Tabs`/`Tab`, `Wizard`/`Step`, `Flex` | Yes, Layout Elements in the tree |
| Does Layout change the data path? | **No.** Data is flat by question name | **No.** Layout is outside the data tree | **No by default** (layout has no `statePath`). **Opt-in yes** via `->statePath('x')` on any component | No. Nesting only via an explicit object Field |
| Grid / columns | `startWithNewLine`, `width`, `minWidth`/`maxWidth`, `colSpan`, `gridLayoutColumns`, root `gridLayoutEnabled` | `LayoutGridField` (`ui:row`/`ui:col`/`ui:columns`), theme-specific props | `->columns(n | [bp => n])` on any layout, `->columnSpan()` on children | `columns` on Grid/Section, `colSpan` on children |
| Tabs | Only as `paneldynamic.displayMode: "tab"` (repeated items as tabs). No static tab container in the JSON Schema | Not built in | `Tabs::make()->tabs([Tab::make()->schema([...])])` | Tabs/Tab Layout Elements |
| Wizard | Pages are the steps. `questionsOnPageMode`: `standard`/`singlePage`/`questionPerPage`/`inputPerPage` | Not built in (only a custom `render` example in a grid) | `Wizard::make([Step::make()->schema([...])])`, per-step validation | Wizard/Step Layout Element (root only) |
| Nested object | No "object group" for panels. Objects come from questions: composite type, `multipletext`, `matrixdropdown` | `type: "object"` with `properties`. uiSchema nests by key | `->statePath('x')` on a layout/group, or `relationship()` (Eloquent) | Explicit `object` Field with children |
| Array of objects | `paneldynamic` (`templateElements`) and `matrixdynamic` (`columns`), each producing an array of objects | `type: "array"` + `items`. uiSchema `items` | `Repeater::make('members')->schema([...])` producing a JSON array. `Builder` for heterogeneous blocks | `repeater` Field with child Elements |
| Conditions | String expressions in JSON: `visibleIf: "{q} >= 4"`, `enableIf`, `requiredIf` | JSON Schema `dependencies`, `if/then/else`, `oneOf` (data-level) | PHP closures `->hidden(fn (Get $get) => ...)` (server round trip with `live()`) or JS strings `->hiddenJs(...)` | Declarative serializable Condition objects (no code strings) |
| Custom types / widgets | `Serializer.addClass` + `ElementFactory.registerElement` + `ReactQuestionFactory.registerQuestion`. Or `ComponentCollection` (specialized/composite from JSON) | `widgets` / `fields` props (registry) referenced by `ui:widget` / `ui:field` string | PHP class `extends Field` with a `$view` (Blade) or JS renderer (`HasJsRenderer`) | Registry keyed by string. JSON references by name |
| Format versioning | Soft: root `sjsVersion` (warning only), `$schema`. Renamed props kept as `alternativeName` aliases | None in uiSchema. JSON Schema draft chosen by validator (`Ajv2019`/`Ajv2020`). Breaking removals across majors | Code, so the Composer major plus an upgrade script (`filament/upgrade`, `vendor/bin/filament-v4`) | Required integer `version` + explicit migrations |

## 2. SurveyJS

### 2.1 Element tree

"A survey consists of one or several pages. A page can contain panels and questions. Panels are used to group questions and control them as one. A panel can contain other panels and questions (nested panels are supported)."
(https://github.com/surveyjs/survey-library/blob/master/docs/design-survey-create-a-simple-survey.md)

```js
const surveyJson = {
  pages: [{
    name: "PersonalDetails",
    elements: [{
      type: "text",
      name: "FirstName",
      title: "Enter your first name:"
    }, {
      type: "text",
      name: "LastName",
      title: "Enter your last name:"
    }, {
      type: "panel",
      name: "Contacts",
      state: "collapsed",
      title: "Contacts (optional)",
      elements: [{
        type: "text",
        name: "Telegram",
        title: "Telegram:"
      }, {
        type: "text",
        name: "GitHub",
        title: "GitHub username:"
      }]
    }]
  }]
};
```

The same doc says a single-page survey can skip `pages` and put `elements` at the top level.

The published JSON Schema (https://github.com/surveyjs/survey-library/blob/master/docs/surveyjs_definition.json) has these shapes:

- `panelbase` properties: `description, elements, enableIf, gridLayoutColumns, name, questionErrorLocation, questionOrder, questionTitleLocation, questionTitleWidth, readOnly, requiredIf, title, visible, visibleIf`.
- `panel` adds: `colSpan, indent, innerIndent, isRequired, maxWidth, minWidth, startWithNewLine, state, width, ...`. **There is no `valueName` on panels.**
- `question` has `name, valueName, visibleIf, enableIf, requiredIf, validators, startWithNewLine, width, colSpan, renderAs, ...`.

### 2.2 Layout and the data path

Panels and pages do not create data. Results are flat by question name:

> "To access full survey results, use the Survey's `data` property. It contains a JSON object with answered questions and has the following structure:"
> ```js
> {
>   "question1Name": "question1Value",
>   "question2Name": "question2Value",
>   // ...
> }
> ```
> "Depending on the question type, question values can also be nested objects or arrays that contain objects or primitive values"

(https://github.com/surveyjs/survey-library/blob/master/docs/access-and-modify-survey-results.md)

So in the 2.1 example the data is `{ FirstName, LastName, Telegram, GitHub }`, not `{ Contacts: { Telegram, GitHub } }`. A consequence is that question names must be unique across the whole survey, because layout gives no namespace.

The Layout mechanisms are:

- **Grid**: `startWithNewLine: false` puts a question on the same row. `width`/`minWidth`/`maxWidth`, `colSpan` and panel `gridLayoutColumns` with root `gridLayoutEnabled` give a column grid (property names from `surveyjs_definition.json`).
- **Wizard**: pages. Root `questionsOnPageMode` enum is `["standard", "singlePage", "questionPerPage", "inputPerPage"]`, along with `showProgressBar` and `progressBarType`.
- **Tabs**: the only `"tab"` in the JSON Schema is `paneldynamic.displayMode: ["list", "carousel", "tab"]`, which shows repeated items as tabs. There is no static tab container.

### 2.3 Nested objects and arrays

Arrays and objects come from **value-producing questions**, not from panels. In the following example, a static `panel` *inside* a dynamic panel template still adds no key level: `address` and `phone` land directly in each `employees[i]` object.

```js
const surveyJson = {
  "elements": [{
    "type": "matrixdynamic",
    "name": "employees-list",
    "valueName": "employees",
    "title": "Employees",
    "columns": [{
      "name": "employee-name",
      "cellType": "text"
    }],
  }, {
    "type": "paneldynamic",
    "name": "employee-info",
    "title": "Your employees",
    "valueName": "employees",
    "templateElements": [{
      "type": "panel",
      "name": "contacts",
      "elements": [{
        "type": "text",
        "name": "address",
        "title": "Address:"
      }, {
        "type": "text",
        "name": "phone",
        "title": "Phone:"
      }]
    }],
    "templateTitle": "Employee: {panel.employee-name}"
  }]
}
```

> "Together, they produce an `employees` array of objects. The Dynamic Matrix supplies the `employee-name` field values; the Dynamic Panel supplies the `address` and `phone` field values."

(https://github.com/surveyjs/survey-library/blob/master/docs/design-survey-merge-question-values.md)

`valueName` decouples the data key from the element `name`, and two questions with the same `valueName` merge into one value. `paneldynamic` props include `templateElements, minPanelCount, maxPanelCount, allowAddPanel, allowRemovePanel, keyName, templateVisibleIf, displayMode`. `matrixdynamic` has `minRowCount, maxRowCount, allowAddRows, allowRemoveRows, allowRowReorder, rowCount` (from `surveyjs_definition.json`).

Nested **objects** come from composite questions:

```js
ComponentCollection.Instance.add({
  name: "fullname",
  title: "Full Name",
  defaultQuestionTitle: "Enter your full name:",
  elementsJSON: [
    { type: "text", name: "firstName", title: "First Name", isRequired: true },
    { type: "text", name: "lastName", title: "Last Name", isRequired: true, startWithNewLine: false }
  ]
});
// JSON: { "type": "fullname", "name": "question1" }
// Data: { "question1": { "firstName": "John", "lastName": "Doe" } }
```

(https://github.com/surveyjs/survey-library/blob/master/docs/customize-question-types-create-composite-question-types.md)

### 2.4 Conditions

Conditions are **expression strings stored in the JSON**, e.g. `"visibleIf": "age({birthdate}) >= 16"` or `"enableIf": "{college} notempty"`:

> "Assign Boolean expressions to the `visibleIf`, `enableIf`, and `requiredIf` properties of questions, panels, and pages. ... If you set one of these properties for a panel or page, all nested questions inherit the setting."

(https://github.com/surveyjs/survey-library/blob/master/docs/design-survey-conditional-logic.md. Questions also have `setValueIf` and `resetValueIf`, per `surveyjs_definition.json`.) SurveyJS ships its own expression parser, so this is not `eval`. Still, it is a mini language that Auto Formisch would have to parse, type-check and compile to Valibot.

### 2.5 Custom types and widgets

There are two tiers:

1. **JSON-only reuse** via `ComponentCollection`. A *specialized* type wraps one built-in question (`questionJSON`). A *composite* type wraps several (`elementsJSON`). The stored JSON then shrinks to `{ "type": "country", "name": "question1" }` (https://github.com/surveyjs/survey-library/blob/master/docs/customize-question-types-create-specialized-question-types.md).
2. **New component**: subclass `Question` and override `getType()`. Register the model, declare its JSON properties, then register a renderer:

```js
ElementFactory.Instance.registerElement(CUSTOM_TYPE, (name) => new QuestionColorPickerModel(name));
Serializer.addClass(CUSTOM_TYPE, [{ name: "colorPickerType", default: "Slider", choices: ["Slider", "Sketch", "Compact"] }, /* ... */], /* ... */);
ReactQuestionFactory.Instance.registerQuestion(CUSTOM_TYPE, (props) => createElement(SurveyQuestionColorPicker, props));
```

(https://github.com/surveyjs/survey-library/blob/master/docs/customize-question-types-third-party-component-integration-react.md)

A widget variant without a new type is chosen with the question property `renderAs`.

### 2.6 Versioning

The root has optional `sjsVersion` and `$schema` strings. On load:

```ts
if (!!this.sjsVersion && !!settings.version) {
  if (Helpers.compareVerions(this.sjsVersion, settings.version) > 0) {
    ConsoleWarnings.warn("The version of the survey JSON schema (v"
      + this.sjsVersion + ") is newer than your current Form Library version ("
      + settings.version + "). Please update the Form Library to make sure that all survey features work as expected.");
  }
}
```

(https://github.com/surveyjs/survey-library/blob/master/packages/survey-core/src/survey.ts, around L7649–7655. Declared at around L1370 and serialized as `{ name: "sjsVersion", visible: false }` around L9582)

`sjsVersion` is the **library** version, not a format version. Unknown properties do not throw: they are collected into `survey.jsonErrors` (https://github.com/surveyjs/survey-library/blob/master/docs/survey-json-validation.md). Renames are absorbed by serializer aliases, e.g. `{ name: "partialSendEnabled:boolean", alternativeName: "sendResultOnPageNext" }` (same `survey.ts`, around L9588). So migration is implicit and permanent in the loader. There is no explicit migration step.

## 3. RJSF

### 3.1 Tree structure: schema + uiSchema

> "A UI schema is basically an object literal providing information on **how** the form should be rendered, while the JSON schema tells **what**. The uiSchema object follows the tree structure of the form field hierarchy, and defines how each property should be rendered."

(https://github.com/rjsf-team/react-jsonschema-form/blob/main/packages/docs/docs/api-reference/uiSchema.md)

Almost every key can be written as `"ui:x": v` or inside `"ui:options": { x: v }`. Field order is a uiSchema concern: `'ui:order': ['bar', '*']` (https://github.com/rjsf-team/react-jsonschema-form/blob/main/packages/docs/docs/json-schema/objects.md).

### 3.2 Layout and the data path

The data tree is the JSON Schema. There is no layout node type in it. The v6 grid layout is a **field override on an object** whose uiSchema lists **dotted data paths**:

```json
{
  "field1" : {
    "ui:field": "LayoutGridField",
    "ui:layoutGrid": {
      "ui:row": { ... }
    }
  }
}
```

```json
{
  "ui:col": ["innerField", "inner.grandChild", ...]
}
```

> "a simple list of dotted-path field names within the root field"

(https://github.com/rjsf-team/react-jsonschema-form/blob/main/packages/docs/docs/api-reference/LayoutGridField.md)

So layout never changes the data path. The flip side is that layout is a second tree that must be kept in sync with the data tree by string paths. That sync is the pain point the "one element tree" decision avoids. There are no built-in Section, Tabs or Wizard. The only wizard mention is a custom `render` component (`"render": "WizardNavButton"`) placed in a grid cell (same doc).

### 3.3 Nested objects and arrays

Objects use `type: "object"` + `properties`. Arrays use `type: "array"` + `items`. The uiSchema for array items goes under `items`:

```tsx
const schema: RJSFSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      name: { type: 'string' },
    },
  },
};
```

```tsx
const uiSchema = {
  items: {
    'ui:widget': 'textarea',
  },
};
```

Array behaviour is configured with uiSchema `ui:options` `orderable`, `addable`, `copyable` and `removable`, and with schema `minItems`/`maxItems`. In v6, `uiSchema.items` can also be a *function* of the item data, which a stored JSON format cannot hold. (https://github.com/rjsf-team/react-jsonschema-form/blob/main/packages/docs/docs/json-schema/arrays.md)

### 3.4 Conditions

Conditions live in the **data schema**: draft-04 `dependencies` (property and schema dependencies), `oneOf`, and `if/then/else`:

```tsx
const schema: RJSFSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    credit_card: { type: 'number' },
    billing_address: { type: 'string' },
  },
  required: ['name'],
  dependencies: {
    credit_card: ['billing_address'],
  },
};
```

(https://github.com/rjsf-team/react-jsonschema-form/blob/main/packages/docs/docs/json-schema/dependencies.md)

In RJSF the condition drives both validation and rendering, because the visible fields are re-derived from the resolved schema. `LayoutGridField` also has a `ui:condition` grid element for layout-only conditions (LayoutGridField.md).

### 3.5 Custom widgets and fields

Widgets (leaf inputs) and fields (subtree renderers) are React components registered on the form and referenced by name:

```tsx
const widgets: RegistryWidgetsType = {
  myCustomWidget: MyCustomWidget,
};
const uiSchema: UiSchema = {
  'ui:widget': 'myCustomWidget',
};
render(<Form schema={schema} uiSchema={uiSchema} validator={validator} widgets={widgets} />, ...);
```

> "This is useful if you expose the `uiSchema` as pure JSON, which can't carry functions."

(https://github.com/rjsf-team/react-jsonschema-form/blob/main/packages/docs/docs/advanced-customization/custom-widgets-fields.md)

`ui:field` replaces the whole subtree renderer (`fields` prop). Templates (`ui:ObjectFieldTemplate`, `ArrayFieldTemplate`, ...) replace the chrome (custom-templates.md).

### 3.6 Versioning

- The data schema is JSON Schema. The dialect is chosen by the validator, e.g. `AjvClass` set to `Ajv2019` or `Ajv2020` (https://github.com/rjsf-team/react-jsonschema-form/blob/main/packages/docs/docs/api-reference/validator-ajv8.md).
- The **uiSchema has no version field**. Breaking changes ride on library majors with prose migration guides. The v6 guide says "The `classNames` notation on `UiSchema` was removed. Use the `ui:classNames` notation instead." It also says "The custom `enumNames` property support on a JSON Schema that RJSF invented has been removed... Use the `ui:enumNames` in the `UiSchema` instead." (https://github.com/rjsf-team/react-jsonschema-form/blob/main/packages/docs/docs/migration-guides/v6.x%20upgrade%20guide.md). Stored uiSchemas silently degrade unless someone migrates them by hand.

## 4. Filament (v5; schema system introduced in v4)

### 4.1 Tree structure

> "Schemas let you build user interfaces in PHP by combining components for input, display, and layout. ... Components can contain child schemas to create nested layouts."

```php
$schema
    ->components([
        Grid::make(2)
            ->schema([
                Section::make('Details')
                    ->schema([
                        TextInput::make('name'),
                        Select::make('position')
                            ->options([
                                'developer' => 'Developer',
                                'designer' => 'Designer',
                            ]),
                        Checkbox::make('is_admin'),
                    ]),
                Section::make('Auditing')
                    ->schema([
                        TextEntry::make('created_at')
                            ->dateTime(),
                        TextEntry::make('updated_at')
                            ->dateTime(),
                    ]),
            ]),
    ])
```

(https://github.com/filamentphp/filament/blob/5.x/packages/schemas/docs/01-overview.md)

Component categories are form fields, infolist entries, layout components (`Grid`, `Flex`, `Fieldset`, `Section`, `Tabs`, `Wizard`, `Callout`, `Empty state`) and prime components (static text, image, ...). In this tree, layout nodes and fields are **siblings in the same `schema([...])` arrays**. This matches the Auto Formisch "Element = Field | Layout" model.

### 4.2 Layout and the data path (statePath)

The source makes the rule explicit:

```php
// packages/forms/src/Components/Field.php
final public function __construct(string $name)
{
    $this->name($name);
    $this->statePath($name);
}
```

```php
// packages/schemas/src/Components/Concerns/HasState.php
public function getStatePath(bool $isAbsolute = true): ?string
{
    // ...
    $pathComponents = [];

    if (filled($containerStatePath = $this->getContainer()->getStatePath())) {
        $pathComponents[] = $containerStatePath;
    }

    if ($this->hasStatePath()) {
        $pathComponents[] = $this->getStatePath(isAbsolute: false);
    }

    return $this->cachedAbsoluteStatePath = implode('.', $pathComponents);
}
```

(https://github.com/filamentphp/filament/blob/5.x/packages/forms/src/Components/Field.php, https://github.com/filamentphp/filament/blob/5.x/packages/schemas/src/Components/Concerns/HasState.php)

- A field contributes its `name` as a path segment.
- A layout component (`Section`, `Grid`, `Tabs`, ...) has no `statePath` by default, so it is **transparent**: the children of `Section::make('Details')` above write to `name`, `position` and `is_admin`, not `Details.name`.
- Because `statePath()` lives on the shared component concern, any component can opt into a namespace with `->statePath('meta')`. The root schema itself uses `->statePath('data')` (https://github.com/filamentphp/filament/blob/5.x/docs/12-components/02-form.md). Absolute paths are dot-joined (`data.members.<key>.name`).

Grid: "All layout components have a `columns()` method", for example `columns(2)` or `columns(['md' => 2, 'xl' => 4])`. Children use `columnSpan(2)`, `columnSpan('full')` and `columnSpanFull()` (https://github.com/filamentphp/filament/blob/5.x/packages/schemas/docs/02-layouts.md). The v4 upgrade changed the default span of `Grid`/`Section`/`Fieldset` from full width to one column (https://github.com/filamentphp/filament/blob/4.x/docs/14-upgrade-guide.md). This shows that layout defaults are part of the format contract.

Tabs and Wizard:

```php
Tabs::make('Tabs')
    ->tabs([
        Tab::make('Tab 1')
            ->schema([
                // ...
            ]),
        Tab::make('Tab 2')
            ->schema([
                // ...
            ]),
    ])
```

```php
Wizard::make([
    Step::make('Order')
        ->schema([
            // ...
        ]),
    Step::make('Delivery')
        ->schema([
            // ...
        ]),
])
```

The wizard docs describe steps as "especially useful if your form has a definite chronological order, in which you want each step to be validated as the user progresses." (https://github.com/filamentphp/filament/blob/5.x/packages/schemas/docs/04-tabs.md, https://github.com/filamentphp/filament/blob/5.x/packages/schemas/docs/05-wizards.md)

### 4.3 Nested objects and arrays

```php
Repeater::make('members')
    ->schema([
        TextInput::make('name')->required(),
        Select::make('role')
            ->options([
                'member' => 'Member',
                'administrator' => 'Administrator',
                'owner' => 'Owner',
            ])
            ->required(),
    ])
    ->columns(2)
```

> "The repeater component allows you to output a JSON array of repeated form components."

(https://github.com/filamentphp/filament/blob/5.x/packages/forms/docs/12-repeater.md)

Each Repeater item is a child container whose statePath is the item key. That is why the HasState source mentions "Client-influenced repeater item keys flow in here". `Builder` handles heterogeneous block arrays. `->relationship()` binds a Repeater, or a layout group, to an Eloquent relation instead of a JSON value. Nested *objects* use `statePath` on a group or layout component, or a relationship.

### 4.4 Conditions

Filament conditions are code, not data:

```php
Toggle::make('is_admin')
    ->hidden(fn (Get $get): bool => $get('role') !== 'staff')
```

This requires `->live()` on `role`, which triggers a network round trip. The client-side alternative is a JS string:

```php
Toggle::make('is_admin')
    ->hiddenJs(<<<'JS'
        $get('role') !== 'staff'
        JS)
```

(https://github.com/filamentphp/filament/blob/5.x/packages/forms/docs/01-overview.md)

Neither form is portable or safely storable, and AGENTS.md forbids evaluating code from stored definitions. Auto Formisch can copy the fluent *ergonomics* (`->visibleWhen(...)`) but must compile it to declarative Condition data.

### 4.5 Custom fields

```php
use Filament\Forms\Components\Field;

class LocationPicker extends Field
{
    protected string $view = 'filament.forms.components.location-picker';
}
// usage
LocationPicker::make('location')
```

`php artisan make:filament-form-field LocationPicker --react` generates a JS-rendered field (`HasJsRenderer`) instead of Blade. "Filament handles the field wrapper, validation, and state binding." (https://github.com/filamentphp/filament/blob/5.x/packages/forms/docs/22-custom-fields.md). Custom layout components are classes too (https://github.com/filamentphp/filament/blob/5.x/packages/schemas/docs/09-custom-components.md).

### 4.6 Versioning

There is no serialized format: the schema is PHP source. Compatibility is managed by the Composer major version, with an automated code-mod (`composer require filament/upgrade:"^4.0" -W --dev` then `vendor/bin/filament-v4`) and a prose upgrade guide (https://github.com/filamentphp/filament/blob/4.x/docs/14-upgrade-guide.md). The v4 move of layout components into `Filament\Schemas\Components\*` was handled this way.

## 5. Implications for Auto Formisch (input to the "Form Definition shape" ticket)

1. **Copy the Filament/SurveyJS rule that layout is transparent to data.** Layout Elements (Section, Grid, Tabs/Tab, Wizard/Step) carry no `name` and contribute no path segment. Only Fields do. This keeps the compiled Valibot `v.object` shape independent of presentation, so moving a field between Tabs or Sections never changes stored submissions.
2. **Make nesting explicit through Fields, not layout.** Use an `object` Field (`name` plus `children`) for nested objects and a `repeater` Field (`name` plus `children` as the item template) for arrays of objects. Both map 1:1 to `v.object` and `v.array(v.object(...))` and to Formisch's nested paths and `FieldArray` (see `research/formisch-capabilities.md`, AF-4). Do **not** adopt Filament's "statePath on any layout" escape hatch in v1. It makes a layout node secretly a data node and doubles the ways to express one shape. If grouping plus nesting is wanted, an `object` Field can render with Section chrome.
3. **Field `name` is a single path segment, unique among siblings in the same data scope** (root, object, or repeater item). This is not SurveyJS's survey-global uniqueness, which only exists because SurveyJS flattens layout. The compiler can derive and validate the full path (`['members', i, 'name']`). Do not allow dotted names like RJSF's `"inner.grandChild"` in v1.
4. **Discriminate nodes by a string `type`**, with a closed set of built-ins: `string`, `number`, `boolean`, `select`, `object`, `repeater`, `section`, `grid`, `tabs`, `tab`, `wizard`, `step`. Custom Fields follow RJSF and SurveyJS: a **registry keyed by string** at Renderer construction, with the JSON referencing only the name (`widget: "color-picker"`). The stored definition must never contain components or functions. Validate unknown `type`/`widget` names explicitly at load instead of collecting them into a `jsonErrors` list (SurveyJS) or failing late.
5. **Separate the data `type` from the `widget`.** This is RJSF's `ui:widget` and SurveyJS's `renderAs`: `{ type: "string", widget: "textarea" }`. The Valibot compiler reads `type` and validation rules, and the Renderer reads `widget`. This also matches the current `UISchema` `widget` in the README.
6. **Constrain Wizard placement.** Filament allows a Wizard anywhere. SurveyJS models it as root `pages`. Given Formisch's whole-form validation (AF-4), v1 is simplest if `wizard` is only allowed as the root's sole child and `step`s contain other Elements. Per-step validation then becomes "validate only the paths under this step", computed from the tree, which works because layout is transparent.
7. **Grid**: use a Filament-style `columns` on container Layout Elements and `colSpan` on children, with optional responsive breakpoints later. Layout defaults are part of the contract (Filament v4 changed one, and stored forms changed appearance). Write the defaults down and version them.
8. **Conditions as data.** Do not use SurveyJS expression strings (they need a parser and DSL) or Filament closures/JS (they are code). Use a small JSON AST, e.g. `{ op: "eq", path: ["role"], value: "staff" }` with `and`/`or`/`not`, placed on Elements as `visibleWhen`, `requiredWhen` and `disabledWhen`. Following SurveyJS, a condition on a Layout Element applies to everything nested in it. The Fluent Builder can offer a Filament-like API that produces this AST.
9. **Versioning.** Neither SurveyJS (soft library-version warning plus permanent aliases) nor RJSF (none) gives a stored definition a migration story. Keep the existing required integer `version` (README `buildForm({ version: 1, ... })`). Reject unknown versions. Add explicit `migrate(vN → vN+1)` functions with round-trip tests instead of permanent loader aliases. Submissions should reference the definition version, as the README already recommends for D1.
