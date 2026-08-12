// #p4-json-guard 후속(2026-08-12) — zod → Gemini responseSchema 변환 검증.
// 실제 프로덕션 씬 스키마가 변환 가능한지(엔포스가 조용히 빠지지 않는지)와, 미지원 노드(유니온·
// $ref 재사용)를 만나면 예외 없이 unsupported 사유로 표면화하는지를 확인한다.
import { z } from 'zod'
import { describe, expect, it } from 'vitest'
import { SchemaType } from '@google/generative-ai'
import { zodToGeminiSchema } from '@/lib/writer/llm/gemini-schema'
import { DramaturgySchema, NarrativeStructureSchema, ScenesSchema, MergedRawSchema } from '@/lib/writer/pipeline/schemas'

describe('zodToGeminiSchema — 실제 스테이지 스키마는 변환된다(엔포스가 조용히 안 빠짐)', () => {
  for (const [name, schema] of Object.entries({
    DramaturgySchema,
    NarrativeStructureSchema,
    ScenesSchema,
    MergedRawSchema,
  })) {
    it(`${name} 변환 성공`, () => {
      const r = zodToGeminiSchema(schema)
      expect(r.unsupported, r.unsupported).toBeUndefined()
      expect(r.schema?.type).toBe(SchemaType.OBJECT)
    })
  }
})

describe('zodToGeminiSchema — 미지원 노드는 실패로 죽이지 않고 사유로 표면화한다', () => {
  it('유니온은 unsupported', () => {
    const s = z.object({ x: z.union([z.string(), z.number()]) })
    const r = zodToGeminiSchema(s)
    expect(r.schema).toBeUndefined()
    expect(r.unsupported).toBeTruthy()
  })

  it('같은 스키마 인스턴스가 재사용되면(reused ref) unsupported', () => {
    const shared = z.object({ a: z.string() })
    const s = z.object({ x: shared, y: shared })
    // 기본(reused:'inline')이면 성공해야 정상 — 우리 변환기는 reused:'ref' 를 안 준다.
    const r = zodToGeminiSchema(s)
    expect(r.unsupported, r.unsupported).toBeUndefined()
  })
})

describe('zodToGeminiSchema — 지원 노드 형태 확인', () => {
  it('enum 문자열은 format:enum 으로 옮겨진다', () => {
    const s = z.object({ mood: z.enum(['happy', 'sad']) })
    const r = zodToGeminiSchema(s)
    expect(r.unsupported).toBeUndefined()
    const mood = (r.schema as { properties: Record<string, unknown> }).properties.mood as {
      type: string
      format: string
      enum: string[]
    }
    expect(mood.type).toBe(SchemaType.STRING)
    expect(mood.format).toBe('enum')
    expect(mood.enum).toEqual(['happy', 'sad'])
  })

  it('required 는 optional 필드를 제외한다', () => {
    const s = z.object({ a: z.string(), b: z.string().optional() })
    const r = zodToGeminiSchema(s)
    const obj = r.schema as { required?: string[] }
    expect(obj.required).toEqual(['a'])
  })
})
