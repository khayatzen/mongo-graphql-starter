import {
  MongoIdType,
  MongoIdArrayType,
  StringType,
  StringArrayType,
  IntType,
  IntArrayType,
  FloatType,
  FloatArrayType,
  DateType,
  arrayOf,
  BoolType
} from "../dataTypes";
import { TAB } from "./utilities";
import { createOperation as createOperationOriginal } from "./gqlSchemaHelpers";

const TAB2 = TAB + TAB;

export default function createGraphqlTypeSchema(objectToCreate) {
  let fields = objectToCreate.fields || {};
  let relationships = objectToCreate.relationships || {};
  let name = objectToCreate.__name;
  let allQueryFields = [];
  let manualQueryArgs = [];
  let allFieldsMutation = [];
  let extras = objectToCreate.extras || {};
  let overrides = new Set(extras.overrides || []);
  let schemaSources = extras.schemaSources || [];
  let resolvedFields = objectToCreate.resolvedFields || {};

  const createOperation = createOperationOriginal.bind(null, { overrides });

  Object.keys(fields).forEach(k => {
    allQueryFields.push(...queriesForField(k, fields[k]));
    allFieldsMutation.push(`${k}: ${displaySchemaValue(fields[k], true)}`);
  });
  if (Array.isArray(objectToCreate.manualQueryArgs)) {
    manualQueryArgs.push(...objectToCreate.manualQueryArgs.map(arg => `${arg.name}: ${arg.type}`));
  }

  let dateFields = Object.keys(fields).filter(k => fields[k] === DateType || (typeof fields[k] === "object" && fields[k].__isDate));

  let imports = schemaSources.map((src, i) => `import SchemaExtras${i + 1} from "${src}";`);

  return `${imports.length ? imports.join("\n") + "\n\n" : ""}export const type = \`
  
  type ${name} {
  ${Object.keys(fields)
    .map(k => `${TAB}${k}: ${displaySchemaValue(fields[k])}`)
    .join(`\n${TAB}`)}${Object.keys(resolvedFields)
    .map(k => `${TAB}${k}: ${resolvedFields[k]}`)
    .join(`\n${TAB}`)}${
    Object.keys(relationships).length
      ? `\n${TAB}` +
        Object.keys(relationships)
          .map(
            k =>
              (relationships[k].__isArray
                ? `${TAB}${k}(SORT: ${relationships[k].type.__name}Sort, SORTS: [${relationships[k].type.__name}Sort])`
                : `${TAB}${k}`) + `: ${displayRelationshipSchemaValue(relationships[k])}`
          )
          .join(`\n${TAB}`)
      : ""
  }
  }
  ${
    objectToCreate.table
      ? `
  type ${name}QueryResults {
    ${name}s: [${name}],
    Meta: QueryResultsMetadata
  }

  type ${name}SingleQueryResult {
    ${name}: ${name}
  }

  type ${name}MutationResult {
    success: Boolean
    ${name}: ${name}
  }
  
  type ${name}MutationResultMulti {
    success: Boolean
    ${name}s: [${name}]
  }  

  type ${name}BulkMutationResult {
    success: Boolean
  }  
`
      : ""
  }
  input ${name}Input {
  ${Object.keys(fields)
    .map(k => `${TAB}${k}: ${displaySchemaValue(fields[k], true)}`)
    .join(`\n${TAB}`)}${
    Object.keys(relationships).length
      ? `\n${TAB}` +
        Object.keys(relationships)
          .map(k => `${TAB}${k}: ${displayRelationshipSchemaValue(relationships[k], true)}`)
          .join(`\n${TAB}`)
      : ""
  }
  }
  
  input ${name}MutationInput {
  ${Object.keys(fields)
    .filter(k => k != "_id")
    .reduce((inputs, k) => (inputs.push(...getMutations(k, fields).map(val => TAB + val)), inputs), [])
    .join(`\n${TAB}`)}${
    Object.keys(relationships).length
      ? `\n${TAB}` +
        Object.keys(relationships)
          .map(
            k =>
              relationships[k].__isArray
                ? `${TAB}${k}_ADD: ${displayRelationshipSchemaValue(relationships[k], true)}`
                : `${TAB}${k}_SET: ${displayRelationshipSchemaValue(relationships[k], true)}`
          )
          .join(`\n${TAB}`)
      : ""
  }
  }
  ${
    objectToCreate.__usedInArray
      ? `
  input ${name}ArrayMutationInput {
  ${TAB}index: Int,
  Updates: ${name}MutationInput
  }
  `
      : ""
  }
  input ${name}Sort {
  ${Object.keys(fields)
    .map(k => `${TAB}${k}: Int`)
    .join(`\n${TAB}`)}
  }
      
  input ${name}Filters {
  ${TAB}${allQueryFields.concat([`OR: [${name}Filters]`]).join(`\n${TAB}${TAB}`)}
  }
  
\`;
  
  ${objectToCreate.table ? `\n${createMutationType()}\n\n\n${createQueryType()}` : ""}
  
`;

  function createMutationType() {
    let allMutations = [
      createOperation(`create${name}`, [`${name}: ${name}Input`], `${name}MutationResult`),
      createOperation(`update${name}`, [`_id: ${displaySchemaValue(fields._id)}`, `Updates: ${name}MutationInput`], `${name}MutationResult`),
      createOperation(`update${name}s`, [`_ids: [String]`, `Updates: ${name}MutationInput`], `${name}MutationResultMulti`),
      createOperation(`update${name}sBulk`, [`Match: ${name}Filters`, `Updates: ${name}MutationInput`], `${name}BulkMutationResult`),
      createOperation(`delete${name}`, [`_id: String`], "Boolean"),
      ...schemaSources.map((src, i) => TAB + "${SchemaExtras" + (i + 1) + '.Mutation || ""}')
    ];
    return "export const mutation = `\n\n" + allMutations.filter(s => s).join("\n\n") + "\n\n`;";
  }

  function createQueryType() {
    let allOp = createOperation(
      `all${name}s`,
      allQueryFields
        .concat([`OR: [${name}Filters]`, `SORT: ${name}Sort`, `SORTS: [${name}Sort]`, `LIMIT: Int`, `SKIP: Int`, `PAGE: Int`, `PAGE_SIZE: Int`])
        .concat(dateFields.map(f => `${f}_format: String`))
        .concat(manualQueryArgs),
      `${name}QueryResults`
    );

    let getOp = createOperation(
      `get${name}`,
      [`_id: String`].concat(dateFields.map(f => `${f}_format: String`).concat(manualQueryArgs)),
      `${name}SingleQueryResult`
    );

    let schemaSourceQueries = schemaSources.map((src, i) => TAB + "${SchemaExtras" + (i + 1) + '.Query || ""}').join("\n\n");

    return "export const query = `\n\n" + [allOp, getOp, schemaSourceQueries].filter(s => s).join("\n\n") + "\n\n`;";
  }
}

function displaySchemaValue(value, useInputs) {
  if (typeof value === "object" && value.__isDate) {
    return "String";
  } else if (typeof value === "string") {
    switch (value) {
      case StringArrayType:
        return "[String]";
      case IntArrayType:
        return "[Int]";
      case FloatArrayType:
        return "[Float]";
      case MongoIdArrayType:
        return "[String]";
      default:
        return `${value == MongoIdType || value == DateType ? "String" : value}`;
    }
  } else if (typeof value === "object") {
    if (value.__isArray) {
      return `[${value.type.__name}${useInputs ? "Input" : ""}]`;
    } else if (value.__isLiteral) {
      return value.type;
    } else if (value.__isObject) {
      return `${value.type.__name}${useInputs ? "Input" : ""}`;
    }
  }
}

function displayRelationshipSchemaValue(value, useInputs) {
  if (value.__isArray) {
    return `[${value.type.__name}${useInputs ? "Input" : ""}]`;
  } else if (value.__isObject) {
    return `${value.type.__name}${useInputs ? "Input" : ""}`;
  }
}

function getMutations(k, fields) {
  let value = fields[k];

  if (typeof value === "object" && value.__isDate) {
    return [`${k}: String`];
  } else if (typeof value === "string") {
    if (value === BoolType) {
      return [`${k}: Boolean`];
    } else if (value === "Int") {
      return [`${k}: Int`, `${k}_INC: Int`, `${k}_DEC: Int`];
    } else if (value === "Float") {
      return [`${k}: Float`, `${k}_INC: Int`, `${k}_DEC: Int`];
    } else if (value === StringArrayType) {
      return [
        `${k}: [String]`,
        `${k}_PUSH: String`,
        `${k}_CONCAT: [String]`,
        `${k}_UPDATE: StringArrayUpdate`,
        `${k}_UPDATES: [StringArrayUpdate]`,
        `${k}_PULL: [String]`,
        `${k}_ADDTOSET: [String]`
      ];
    } else if (value === IntArrayType) {
      return [
        `${k}: [Int]`,
        `${k}_PUSH: Int`,
        `${k}_CONCAT: [Int]`,
        `${k}_UPDATE: IntArrayUpdate`,
        `${k}_UPDATES: [IntArrayUpdate]`,
        `${k}_PULL: [Int]`,
        `${k}_ADDTOSET: [Int]`
      ];
    } else if (value === FloatArrayType) {
      return [
        `${k}: [Float]`,
        `${k}_PUSH: Float`,
        `${k}_CONCAT: [Float]`,
        `${k}_UPDATE: FloatArrayUpdate`,
        `${k}_UPDATES: [FloatArrayUpdate]`,
        `${k}_PULL: [Float]`,
        `${k}_ADDTOSET: [Float]`
      ];
    } else if (value === MongoIdArrayType) {
      return [
        `${k}: [String]`,
        `${k}_PUSH: String`,
        `${k}_CONCAT: [String]`,
        `${k}_UPDATE: StringArrayUpdate`,
        `${k}_UPDATES: [StringArrayUpdate]`,
        `${k}_PULL: [String]`,
        `${k}_ADDTOSET: [String]`
      ];
    }

    return [`${k}: String`];
  } else if (typeof value === "object") {
    if (value.__isArray) {
      return [
        `${k}: [${value.type.__name}Input]`,
        `${k}_PUSH: ${value.type.__name}Input`,
        `${k}_CONCAT: [${value.type.__name}Input]`,
        `${k}_UPDATE: ${value.type.__name}ArrayMutationInput`,
        `${k}_UPDATES: [${value.type.__name}ArrayMutationInput]`,
        `${k}_PULL: ${value.type.__name}Filters`
      ];
    } else if (value.__isLiteral) {
      return [`${k}: ${value.type}`];
    } else if (value.__isObject) {
      return [`${k}: ${value.type.__name}Input`, `${k}_UPDATE: ${value.type.__name}MutationInput`];
    }
  }
}

function queriesForField(fieldName, realFieldType) {
  if (typeof realFieldType === "object" && realFieldType.__isDate) {
    realFieldType = DateType;
  }
  let result = [];
  let fieldType = realFieldType === DateType || realFieldType === MongoIdType ? "String" : realFieldType;
  switch (realFieldType) {
    case BoolType:
      result.push(`${fieldName}: Boolean`);
      break;
    case StringType:
      result.push(...[`${fieldName}_contains`, `${fieldName}_startsWith`, `${fieldName}_endsWith`, `${fieldName}_regex`].map(p => `${p}: String`));
      break;
    case IntType:
    case FloatType:
    case DateType:
      result.push(...[`${fieldName}_lt`, `${fieldName}_lte`, `${fieldName}_gt`, `${fieldName}_gte`].map(p => `${p}: ${fieldType}`));
      break;
    case IntArrayType:
    case FloatArrayType:
      let singleType = realFieldType == IntArrayType ? "Int" : "Float";
      result.push(`${fieldName}_count: Int`);
      result.push(...[`${fieldName}_lt`, `${fieldName}_lte`, `${fieldName}_gt`, `${fieldName}_gte`].map(p => `${p}: ${singleType}`));
      result.push(...[`${fieldName}_emlt`, `${fieldName}_emlte`, `${fieldName}_emgt`, `${fieldName}_emgte`].map(p => `${p}: ${singleType}`));
      result.push(
        ...[
          `${fieldName}: [${singleType}]`,
          `${fieldName}_in: [[${singleType}]]`,
          `${fieldName}_contains: ${singleType}`,
          `${fieldName}_containsAny: [${singleType}]`,
          `${fieldName}_ne: [${singleType}]`
        ]
      );
      break;
    case StringArrayType:
      result.push(`${fieldName}_count: Int`);
      result.push(
        ...[`${fieldName}_textContains: String`, `${fieldName}_startsWith: String`, `${fieldName}_endsWith: String`, `${fieldName}_regex: String`]
      );
    case MongoIdArrayType:
      result.push(
        ...[
          `${fieldName}: [String]`,
          `${fieldName}_in: [[String]]`,
          `${fieldName}_contains: String`,
          `${fieldName}_containsAny: [String]`,
          `${fieldName}_ne: [String]`
        ]
      );
      break;
  }

  switch (realFieldType) {
    case MongoIdType:
    case StringType:
    case IntType:
    case FloatType:
    case DateType:
    case BoolType:
      result.push(`${fieldName}: ${fieldType}`);
      result.push(`${fieldName}_ne: ${fieldType}`);
      result.push(`${fieldName}_in: [${fieldType}]`);
  }

  if (realFieldType.__isObject || realFieldType.__isArray) {
    result.push(`${fieldName}_count: Int`);
    result.push(`${fieldName}: ${realFieldType.type.__name}Filters`);
  }

  return result;
}
