// zod → Gemini responseSchema 변환 (#p4-json-guard 후속 2026-08-12).
//
// claude.ts 의 옛 주석("gemini responseMimeType 의 등가물")은 오해였다 — mimeType 은
// "JSON 으로 답해라"(형식)이고, 여기서 다루는 responseSchema 는 "이 모양으로 답해라"(구조)다.
// 구조 강제 자리는 있었다: @google/generative-ai@0.24.1 의 GenerationConfig.responseSchema
// (dist/generative-ai.d.ts:697, 타입은 Schema — 같은 파일 :1245) — 그런데 여태 아무도 안 채웠다.
//
// Gemini 의 Schema 는 "OpenAPI 3.0 스키마의 일부 부분집합"(SDK 주석 그대로)이라 표준 JSON Schema
// 와 다르다: type 은 SchemaType enum 문자열 하나뿐(배열·유니온 불가), $ref/oneOf/anyOf/allOf/const/
// additionalProperties 가 없다. required 는 object 타입에서만, nullable 은 anyOf-null 관용구가
// 아니라 별도 boolean 플래그다.
//
// 그래서 zod → 표준 JSON Schema(z.toJSONSchema, claude 쪽 zodOutputFormat 과 같은 1차 변환) →
// Gemini 부분집합 2차 변환, 2단으로 간다. 2차 변환이 못 옮기는 노드(유니온·$ref 재사용 등)를
// 만나면 예외를 던지는 대신 { unsupported: 사유 } 를 반환한다 — 호출부(gemini.ts)가 경고만
// 남기고 스키마 강제를 건너뛰게 하기 위함(강제 실패로 호출 전체를 죽이지 않는다).
import { z } from 'zod';
import { SchemaType, type Schema as GeminiSchema } from '@google/generative-ai';

export interface GeminiSchemaConversion {
  schema?: GeminiSchema;
  unsupported?: string;
}

// z.toJSONSchema 산출의 필요한 부분만 — 전체 JSON Schema 스펙이 아니라 우리가 실제로 만나는
// 노드 모양만 다룬다(그 외 키는 무시하고 지나간다).
interface JsonSchemaNode {
  type?: string;
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  items?: JsonSchemaNode;
  minItems?: number;
  maxItems?: number;
  enum?: unknown[];
  format?: string;
  description?: string;
  anyOf?: JsonSchemaNode[];
  oneOf?: JsonSchemaNode[];
  allOf?: JsonSchemaNode[];
  const?: unknown;
  $ref?: string;
}

export function zodToGeminiSchema(zodSchema: z.ZodTypeAny): GeminiSchemaConversion {
  let jsonSchema: JsonSchemaNode;
  try {
    // reused:'ref' 를 안 준다(default=inline) — Gemini 는 $ref 를 아예 못 읽는다.
    jsonSchema = z.toJSONSchema(zodSchema) as JsonSchemaNode;
  } catch (e) {
    return { unsupported: `z.toJSONSchema 변환 실패: ${e instanceof Error ? e.message : String(e)}` };
  }
  try {
    return { schema: convertNode(jsonSchema) };
  } catch (e) {
    return { unsupported: e instanceof Error ? e.message : String(e) };
  }
}

function convertNode(node: JsonSchemaNode): GeminiSchema {
  if (node.$ref) throw new Error(`$ref 미지원(스키마 재사용 노드): ${node.$ref}`);
  if (node.oneOf || node.allOf) throw new Error('oneOf/allOf 미지원(Gemini 부분집합 밖)');
  if (node.const !== undefined) throw new Error('const 미지원(Gemini 부분집합 밖)');

  // nullable 관용구: z.nullable() → JSON Schema 는 anyOf:[X, {type:'null'}] 로 뜬다.
  // Gemini 는 이걸 유니온이 아니라 X + nullable:true 로 표현한다 — 2항이고 한쪽이 null 일 때만 허용.
  if (node.anyOf) {
    const nonNull = node.anyOf.filter((n) => n.type !== 'null');
    if (node.anyOf.length === 2 && nonNull.length === 1) {
      const inner = convertNode(nonNull[0]);
      return { ...inner, nullable: true } as GeminiSchema;
    }
    throw new Error('anyOf/유니온 미지원(2항 nullable 관용구 제외)');
  }

  const description = node.description ? { description: node.description } : {};

  switch (node.type) {
    case 'object': {
      const props = node.properties ?? {};
      const keys = Object.keys(props);
      if (keys.length === 0) throw new Error('빈 object 스키마 미지원(Gemini properties 는 비면 안 됨)');
      const properties: Record<string, GeminiSchema> = {};
      for (const k of keys) properties[k] = convertNode(props[k]);
      return {
        type: SchemaType.OBJECT,
        properties,
        ...(node.required?.length ? { required: node.required } : {}),
        ...description,
      } as GeminiSchema;
    }
    case 'array': {
      if (!node.items) throw new Error('items 없는 array 미지원');
      return {
        type: SchemaType.ARRAY,
        items: convertNode(node.items),
        ...(typeof node.minItems === 'number' ? { minItems: node.minItems } : {}),
        ...(typeof node.maxItems === 'number' ? { maxItems: node.maxItems } : {}),
        ...description,
      } as GeminiSchema;
    }
    case 'string': {
      if (node.enum) {
        if (!node.enum.every((v) => typeof v === 'string')) {
          throw new Error('문자열이 아닌 enum 값 미지원');
        }
        return { type: SchemaType.STRING, format: 'enum', enum: node.enum as string[], ...description } as GeminiSchema;
      }
      // Gemini SimpleStringSchema 는 format 을 "date-time" 만 허용 — 그 외(email/uuid 등)는 버린다.
      return {
        type: SchemaType.STRING,
        ...(node.format === 'date-time' ? { format: 'date-time' as const } : {}),
        ...description,
      } as GeminiSchema;
    }
    case 'number':
      return { type: SchemaType.NUMBER, ...description } as GeminiSchema;
    case 'integer':
      return { type: SchemaType.INTEGER, ...description } as GeminiSchema;
    case 'boolean':
      return { type: SchemaType.BOOLEAN, ...description } as GeminiSchema;
    default:
      throw new Error(`미지원 JSON Schema 타입: ${String(node.type)}`);
  }
}
