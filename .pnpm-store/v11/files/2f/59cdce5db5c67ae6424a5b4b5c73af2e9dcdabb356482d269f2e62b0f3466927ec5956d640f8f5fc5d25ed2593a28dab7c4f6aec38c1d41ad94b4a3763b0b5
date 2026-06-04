import { ClientBuilder, ClientGeneratorsBuilder, ContextSpec, GeneratorDependency, GeneratorMutator, OpenApiParameterObject, OpenApiReferenceObject, OpenApiSchemaObject, PackageJson, ZodCoerceType } from "@orval/core";

//#region src/compatible-v4.d.ts
declare const isZodVersionV4: (packageJson: PackageJson) => boolean;
//#endregion
//#region src/index.d.ts
declare const getZodDependencies: () => GeneratorDependency[];
declare const predefinedZodFormats: Set<string>;
interface ZodValidationSchemaDefinition {
  functions: [string, unknown][];
  consts: string[];
}
interface DateTimeOptions {
  offset?: boolean;
  local?: boolean;
  precision?: number;
}
interface TimeOptions {
  precision?: -1 | 0 | 1 | 2 | 3;
}
declare const generateZodValidationSchemaDefinition: (schema: OpenApiSchemaObject | OpenApiReferenceObject | undefined, context: ContextSpec, name: string, strict: boolean, isZodV4: boolean, rules?: {
  required?: boolean;
  dateTimeOptions?: DateTimeOptions;
  timeOptions?: TimeOptions;
  /**
   * Override schemas for properties at THIS level only.
   * Not passed to nested schemas. Used by form-data for file type handling.
   */
  propertyOverrides?: Record<string, ZodValidationSchemaDefinition>;
  /**
   * Internal registry to keep generated const names unique within a single
   * schema generation tree without leaking suffixes across unrelated top-level
   * schemas.
   */
  constNameRegistry?: Record<string, number>;
  /**
   * When true, plain `$ref`s into `#/components/schemas/*` emit a `namedRef`
   * placeholder instead of being inlined.
   */
  useReusableSchemas?: boolean;
  /**
   * When true (and `isZodV4`), the top-level (named component) schema emits a
   * `.meta({ id, description?, deprecated? })` instead of `.describe(...)`.
   * Set ONLY for top-level component-schema generation — recursive calls omit
   * it, so nested schemas keep `.describe()` and never get a duplicate `id`.
   */
  emitMeta?: boolean;
}) => ZodValidationSchemaDefinition;
/**
 * Runtime shape passed to the user-supplied `override.zod.params` function for
 * every emitted validator. Exported so consumers can type their function with
 * `import type { ZodParamsContext } from 'orval'` instead of hand-writing it.
 */
interface ZodParamsContext {
  /** The OpenAPI `operationId`, or `''` for shared component schemas. */
  operationId: string;
  /** `'schema'` is used for shared component schemas with no owning operation. */
  location: 'param' | 'query' | 'header' | 'body' | 'response' | 'schema';
  /** Generated schema name, e.g. `CreateUserBody`, or the component name. */
  schemaName: string;
  /** Path to the current property within the schema. Only object property names are appended. */
  fieldPath: string[];
  /** The Zod method being emitted, e.g. `'string'`, `'min'`, `'email'`. */
  validator: string;
}
interface ZodParamsInjection extends Pick<ZodParamsContext, 'operationId' | 'location' | 'schemaName'> {
  mutator: GeneratorMutator;
}
declare const parseZodValidationSchemaDefinition: (input: ZodValidationSchemaDefinition, context: ContextSpec, coerceTypes: boolean | ZodCoerceType[] | undefined, strict: boolean, isZodV4: boolean, preprocess?: GeneratorMutator, paramsInjection?: ZodParamsInjection) => {
  zod: string;
  consts: string;
  usedRefs: Set<string>;
};
/**
 * Recursively inlines all `$ref` references in an OpenAPI schema tree,
 * producing a fully-resolved schema suitable for Zod code generation.
 *
 * Tracks visited `$ref` paths via `context.parents` to break circular
 * references (returning `{}` for cycles).
 */
declare const dereference: (schema: OpenApiSchemaObject | OpenApiReferenceObject, context: ContextSpec) => OpenApiSchemaObject;
/**
 * Generate zod schema for form-data request body.
 * Handles file type detection for top-level properties based on encoding.contentType
 * and contentMediaType. Mirrors type gen's resolveFormDataRootObject.
 */
declare const generateFormDataZodSchema: (schema: OpenApiSchemaObject, context: ContextSpec, name: string, strict: boolean, isZodV4: boolean, encoding?: Record<string, {
  contentType?: string;
}>, useReusableSchemas?: boolean) => ZodValidationSchemaDefinition;
declare const parseParameters: ({
  data,
  context,
  operationName,
  isZodV4,
  strict,
  generate,
  useReusableSchemas
}: {
  data: (OpenApiParameterObject | OpenApiReferenceObject)[] | undefined;
  context: ContextSpec;
  operationName: string;
  isZodV4: boolean;
  strict: {
    param: boolean;
    query: boolean;
    header: boolean;
    body: boolean;
    response: boolean;
  };
  generate: {
    param: boolean;
    query: boolean;
    header: boolean;
    body: boolean;
    response: boolean;
  };
  useReusableSchemas?: boolean;
}) => {
  headers: ZodValidationSchemaDefinition;
  queryParams: ZodValidationSchemaDefinition;
  params: ZodValidationSchemaDefinition;
};
declare const generateZod: ClientBuilder;
declare const builder: () => () => ClientGeneratorsBuilder;
//#endregion
export { ZodParamsContext, ZodParamsInjection, ZodValidationSchemaDefinition, builder, builder as default, dereference, generateFormDataZodSchema, generateZod, generateZodValidationSchemaDefinition, getZodDependencies, isZodVersionV4, parseParameters, parseZodValidationSchemaDefinition, predefinedZodFormats };
//# sourceMappingURL=index.d.mts.map