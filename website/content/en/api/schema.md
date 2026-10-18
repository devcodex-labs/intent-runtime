<span id="schema-支持范围" aria-hidden="true"></span>

# Schema support

Check which business-field rules are accepted, rejected, or left unknown. For your first order ID, start with [Extract fields](/guide/fields).

<span id="可使用的定义" aria-hidden="true"></span>

## Accepted definitions

Pass schema-dsl@3.0.4 s({...}), an ObjectDslBuilder, or JSON Schema as schema/extensionSchema. Builders are accepted directly. JSON Schema retains applicable declarations such as strictSchema/requiredAll. Business Schemas differ from INTENT_RESULT_SCHEMA, which validates only final response structure.

<span id="支持范围" aria-hidden="true"></span>

## Supported rules

| Definition | Behavior |
|---|---|
| Draft-07 types, properties, required, requiredAll, strictSchema, patternProperties, propertyNames, additionalProperties | Preserve declared rules and property existence |
| String/number constraints, enum/const, declared formats | Real Validator checks; no defaults or type coercion |
| items/tuples/additionalItems/contains/uniqueItems, array lengths | Validate full arrays and nested paths |
| allOf/anyOf/oneOf/not, if/then/else, dependencies | Preserve combined and cross-field rules even when selecting one field |
| Same-document fragment $ref, nested $id | Preserve reference environments without network access |
| description/_description | Same-call model interpretation of semantic constraints; missing dependencies or indeterminate meaning remain unknown; type validity is insufficient |
| title/label/examples/default/known DSL metadata | Annotations are not user facts; no external lookup callbacks run |
| External/recursive references, other dialects, executable rules | Explicit configuration-time rejection, without silently stripping rules |

Missing dependencies do not select a default branch. Confirm a known value only if it is valid under every possible dependency state. A definitely illegal value is invalid; dependency-sensitive validity remains unknown/FIELD_DEPENDENCY_MISSING. When local proof cannot reliably determine the rule, use FIELD_VALIDATION_UNDETERMINED. Absence, presence with unknown value, and unknown existence are distinct. null, false, 0, and empty strings are not absence.

<span id="格式与定义边界" aria-hidden="true"></span>

## Formats and definition boundaries

Supported formats are fixed: date, time, date-time, duration, email, hostname, ipv4, ipv6, uri, uri-reference, uuid, regex, json-pointer, relative-json-pointer. Validation follows schema-dsl@3.0.4 without DNS/URL lookups. Other formats produce SCHEMA_UNSUPPORTED_FOR_EXTRACTION.

Omitting $schema means Draft-07. The root must be an object with properties; nested boolean Schemas are allowed. Declarative s.if/s.match selection and JSON/DSL branches work. Function-based ConditionalBuilder, custom callbacks, and executable plugin rules do not. Other-dialect keywords such as $defs, prefixItems, and unevaluatedProperties are rejected, not ignored. Malformed definitions produce SCHEMA_INVALID; valid but unsupported definitions produce SCHEMA_UNSUPPORTED_FOR_EXTRACTION. Definitions are checked even when no fields are selected.

<span id="选择与取值" aria-hidden="true"></span>

## Selection and values

fields accepts [], top-level field names, or all. Only selected business fields participate in new extraction. Selecting a parent returns a complete valid nested value; array issues retain original indices. Unselected dependencies may be validated internally without being added to inputs. fields=[] does not clear unchanged inherited values. Defaults, examples, and descriptions are not user-provided facts.

<span id="不支持时怎样处理" aria-hidden="true"></span>

## When a definition is unsupported

SCHEMA_INVALID means malformed; SCHEMA_UNSUPPORTED_FOR_EXTRACTION means outside the supported matrix; selecting fields without a Schema produces SCHEMA_NOT_CONFIGURED. Fix the definition and create a new instance; repeating the same call does not repair configuration. More user input does not necessarily resolve FIELD_VALIDATION_UNDETERMINED; see [Recovery](/api/errors).

Use [field states](/api/response#states-and-consumption) to consume values and [Multi-turn changes](/guide/multi-turn) for condition-dependent invalidation.
