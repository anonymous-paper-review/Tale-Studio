import { z } from 'zod'
import type { PipelineLogger } from '@/lib/writer/logger'
import { generateJson, type LlmAxisConfig } from '@/lib/writer/llm/dispatch'
import type { PipelineInput } from '@/lib/writer/types/pipeline'

const DialogueLineSchema = z.object({
  character_id: z.string().min(1),
  line: z.string().min(1),
  timing: z.string().min(1),
  delivery: z.string().optional(),
})

const ShotSchema = z.object({
  shot_id: z.string().min(1),
  purpose: z.string().min(1),
  duration_seconds: z.number().positive(),
  composition: z.string().min(1),
  camera: z.string().min(1),
  blocking: z.string().min(1),
  transition: z.string().min(1),
})

const SemanticUnitSchema = z.object({
  unit_id: z.string().min(1),
  story: z.object({
    intent: z.string().min(1),
    action: z.string().min(1),
    reaction: z.string().min(1),
    emotion: z.string().min(1),
    dialogue: z.array(DialogueLineSchema).default([]),
  }),
  visual: z.object({
    character_refs: z.array(z.string()).default([]),
    background_ref: z.string().optional(),
    unresolved_refs: z.array(z.string()).default([]),
    direction_intent: z.string().min(1),
    composition: z.string().min(1),
    camera: z.string().min(1),
    blocking: z.string().min(1),
    transition: z.string().min(1),
  }),
  shots: z.array(ShotSchema).min(1),
  continuity: z
    .object({
      previous_unit_id: z.string().nullable().optional(),
      carry_forward: z.array(z.string()).default([]),
      changes: z.array(z.string()).default([]),
    })
    .default({
      previous_unit_id: null,
      carry_forward: [],
      changes: [],
    }),
})

export const WriterV2DraftSchema = z.object({
  units: z.array(SemanticUnitSchema).min(1),
})

export type WriterV2Draft = z.infer<typeof WriterV2DraftSchema>
export type WriterV2SemanticUnit = WriterV2Draft['units'][number]

export type WriterV2CheckField =
  | 'intent'
  | 'action'
  | 'emotion'
  | 'dialogue'
  | 'visual_direction'

export interface WriterV2Check {
  passed: boolean
  fields: Record<WriterV2CheckField, boolean>
  failures: string[]
  checked_at: string
}

export interface WriterV2Attempt {
  attempt: number
  invocation: 'complete' | 'failed'
  status: 'passed' | 'failed'
  draft?: WriterV2Draft
  check: WriterV2Check
  error?: string
}

export interface WriterV2Package {
  engine: 'v2'
  contract_version: 'semantic-unit-previz-0.1'
  revision_id: string
  status: 'ready' | 'review'
  current_attempt: number
  units: WriterV2SemanticUnit[]
  attempts: WriterV2Attempt[]
  user_review: {
    required: boolean
    status: 'not_required' | 'pending' | 'accepted' | 'held'
    selected_attempt?: number
    decided_at?: string
    reason?: string
  }
}

const EMPTY_FIELDS: Record<WriterV2CheckField, boolean> = {
  intent: false,
  action: false,
  emotion: false,
  dialogue: false,
  visual_direction: false,
}

function emptyCheck(failures: string[]): WriterV2Check {
  return {
    passed: false,
    fields: { ...EMPTY_FIELDS },
    failures,
    checked_at: new Date().toISOString(),
  }
}

function hasText(value: string): boolean {
  return value.trim().length > 0
}

/**
 * V2의 최소 의미 계약은 모델에게 맡기지 않고 코드로 다시 확인한다.
 * 스키마는 모양을 확인하고, 이 검사는 downstream 제작을 시작할 수 있는 내용이
 * 실제로 채워졌는지 확인한다.
 */
export function checkWriterV2Draft(draft: WriterV2Draft): WriterV2Check {
  const failures: string[] = []
  const fields: Record<WriterV2CheckField, boolean> = {
    ...EMPTY_FIELDS,
  }
  const unitIds = new Set<string>()
  const shotIds = new Set<string>()

  for (const unit of draft.units) {
    if (unitIds.has(unit.unit_id)) {
      failures.push(`duplicate unit_id: ${unit.unit_id}`)
    }
    unitIds.add(unit.unit_id)

    const prefix = `unit ${unit.unit_id}`
    if (!hasText(unit.story.intent)) failures.push(`${prefix}: intent is empty`)
    if (!hasText(unit.story.action)) failures.push(`${prefix}: action is empty`)
    if (!hasText(unit.story.reaction)) failures.push(`${prefix}: reaction is empty`)
    if (!hasText(unit.story.emotion)) failures.push(`${prefix}: emotion is empty`)

    if (
      unit.story.dialogue.some(
        (line) =>
          !hasText(line.character_id) ||
          !hasText(line.line) ||
          !hasText(line.timing),
      )
    ) {
      failures.push(`${prefix}: dialogue timing or speaker is missing`)
    }

    const hasCharacterReference =
      unit.visual.character_refs.length > 0 ||
      unit.visual.unresolved_refs.some((ref) => ref.includes('character'))
    const hasBackgroundReference =
      Boolean(unit.visual.background_ref?.trim()) ||
      unit.visual.unresolved_refs.some((ref) => ref.includes('background'))

    if (!hasCharacterReference) {
      failures.push(`${prefix}: character reference or unresolved marker is missing`)
    }
    if (!hasBackgroundReference) {
      failures.push(`${prefix}: background reference or unresolved marker is missing`)
    }

    if (
      !hasText(unit.visual.direction_intent) ||
      !hasText(unit.visual.composition) ||
      !hasText(unit.visual.camera) ||
      !hasText(unit.visual.blocking) ||
      !hasText(unit.visual.transition)
    ) {
      failures.push(`${prefix}: visual direction is incomplete`)
    }

    for (const shot of unit.shots) {
      if (shotIds.has(shot.shot_id)) {
        failures.push(`duplicate shot_id: ${shot.shot_id}`)
      }
      shotIds.add(shot.shot_id)
      if (
        !hasText(shot.purpose) ||
        !hasText(shot.composition) ||
        !hasText(shot.camera) ||
        !hasText(shot.blocking) ||
        !hasText(shot.transition)
      ) {
        failures.push(`${prefix}/${shot.shot_id}: shot direction is incomplete`)
      }
    }

    fields.intent = fields.intent || hasText(unit.story.intent)
    fields.action = fields.action || hasText(unit.story.action)
    fields.emotion = fields.emotion || hasText(unit.story.emotion)
    fields.dialogue =
      fields.dialogue ||
      unit.story.dialogue.every(
        (line) =>
          hasText(line.character_id) &&
          hasText(line.line) &&
          hasText(line.timing),
      )
    fields.visual_direction =
      fields.visual_direction ||
      (hasCharacterReference &&
        hasBackgroundReference &&
        hasText(unit.visual.direction_intent) &&
        hasText(unit.visual.composition) &&
        hasText(unit.visual.camera) &&
        hasText(unit.visual.blocking) &&
        hasText(unit.visual.transition) &&
        unit.shots.every(
          (shot) =>
            hasText(shot.purpose) &&
            hasText(shot.composition) &&
            hasText(shot.camera) &&
            hasText(shot.blocking) &&
            hasText(shot.transition),
        ))
  }

  fields.intent = fields.intent && !failures.some((failure) => failure.endsWith('intent is empty'))
  fields.action = fields.action && !failures.some((failure) => failure.endsWith('action is empty'))
  fields.emotion = fields.emotion && !failures.some((failure) => failure.endsWith('emotion is empty'))
  fields.dialogue =
    fields.dialogue &&
    !failures.some((failure) => failure.includes('dialogue timing or speaker'))
  fields.visual_direction =
    fields.visual_direction &&
    !failures.some(
      (failure) =>
        failure.includes('reference or unresolved marker') ||
        failure.includes('visual direction is incomplete') ||
        failure.includes('shot direction is incomplete'),
    )

  return {
    passed: failures.length === 0,
    fields,
    failures,
    checked_at: new Date().toISOString(),
  }
}

function promptFor(input: PipelineInput, correction?: string[]): string {
  const source = {
    story: input.story,
    genre: input.genre ?? null,
    cast: input.cast ?? null,
    background: input.background ?? null,
    styleAnchor: input.styleAnchor ?? null,
  }
  const correctionBlock = correction?.length
    ? `\n\nThe previous attempt failed these checks. Correct them explicitly:\n- ${correction.join('\n- ')}`
    : ''

  return `You are the experimental Writer V2 previz planner.

Generate a single JSON object with a "units" array. Each unit is a meaningful action-reaction
unit, not merely a camera shot. Story and visual direction must stay together in the same unit.
A unit may contain multiple shots, and every shot must express the same unit rather than becoming
an unrelated story beat.

Required semantic contract for every unit:
- unit_id is stable within this revision.
- story.intent, story.action, story.reaction, story.emotion are concrete.
- every dialogue line has character_id, line, and planned timing.
- visual.character_refs and visual.background_ref point to producer references when known.
  If a reference is genuinely unresolved, put an explicit "character:unresolved" or
  "background:unresolved" marker in unresolved_refs instead of inventing an asset.
- visual.direction_intent, composition, camera, blocking, and transition are concrete previz guidance.
- each unit has at least one shot with purpose, duration_seconds, composition, camera, blocking,
  and transition.
- continuity carries forward what adjacent units must preserve and records changes.

Do not generate assets, model prompts, seeds, or final video instructions. This is a previz seed
for downstream production, and downstream retains final authority.

Producer/chat source context:
${JSON.stringify(source, null, 2)}
${correctionBlock}`
}

async function invoke(
  input: PipelineInput,
  model: LlmAxisConfig,
  correction?: string[],
): Promise<WriterV2Draft> {
  const raw = await generateJson<unknown>(promptFor(input, correction), model, {
    temperature: 0.35,
    maxTokens: 16000,
    schema: WriterV2DraftSchema,
  })
  // generateJson의 schema 검사는 원본 shape만 확인하고 변환하지 않는다. 여기서 parse해
  // default 배열을 실제 값으로 materialize한 뒤 아래 제품 검사가 안전하게 읽도록 한다.
  return WriterV2DraftSchema.parse(raw)
}

function failedAttempt(
  attempt: number,
  error: unknown,
  previousFailures: string[] = [],
): WriterV2Attempt {
  const message = error instanceof Error ? error.message : String(error)
  return {
    attempt,
    invocation: 'failed',
    status: 'failed',
    check: emptyCheck([
      ...previousFailures,
      `generation invocation failed: ${message}`,
    ]),
    error: message,
  }
}

export async function runWriterV2Preview(
  input: PipelineInput,
  logger: PipelineLogger,
  model: LlmAxisConfig,
): Promise<WriterV2Package> {
  const revisionId = crypto.randomUUID()
  const attempts: WriterV2Attempt[] = []
  let draft: WriterV2Draft | undefined
  let failures: string[] = []

  await logger.markStage('v2SemanticUnits', 'started', {
    revision_id: revisionId,
    automatic_retry_limit: 1,
  })

  try {
    draft = await invoke(input, model)
    const check = checkWriterV2Draft(draft)
    attempts.push({
      attempt: 1,
      invocation: 'complete',
      status: check.passed ? 'passed' : 'failed',
      draft,
      check,
    })
    if (check.passed) {
      await logger.markStage('v2SemanticUnits', 'completed', {
        revision_id: revisionId,
        attempt: 1,
        user_review_required: false,
      })
      return {
        engine: 'v2',
        contract_version: 'semantic-unit-previz-0.1',
        revision_id: revisionId,
        status: 'ready',
        current_attempt: 1,
        units: draft.units,
        attempts,
        user_review: { required: false, status: 'not_required' },
      }
    }
    failures = check.failures
  } catch (error) {
    attempts.push(failedAttempt(1, error))
    failures = attempts[0].check.failures
  } finally {
    await logger.flushRawLlm('v2SemanticUnits_attempt1')
  }

  // V2는 첫 실패 뒤에만 자동 재생성을 한 번 수행한다. 그 이후는 결과와 근거를
  // User Review 대상으로 남기고 자동 루프를 만들지 않는다.
  try {
    draft = await invoke(input, model, failures)
    const check = checkWriterV2Draft(draft)
    attempts.push({
      attempt: 2,
      invocation: 'complete',
      status: check.passed ? 'passed' : 'failed',
      draft,
      check,
    })
  } catch (error) {
    attempts.push(failedAttempt(2, error, failures))
  } finally {
    await logger.flushRawLlm('v2SemanticUnits_attempt2')
  }

  const current = attempts[attempts.length - 1]
  const currentUnits = current.draft?.units ?? draft?.units ?? []
  await logger.markStage('v2SemanticUnits', 'completed', {
    revision_id: revisionId,
    attempt: current.attempt,
    user_review_required: true,
    final_status: current.status,
  })

  return {
    engine: 'v2',
    contract_version: 'semantic-unit-previz-0.1',
    revision_id: revisionId,
    status: 'review',
    current_attempt: current.attempt,
    units: currentUnits,
    attempts,
    user_review: {
      required: true,
      status: 'pending',
      reason: 'attempt 2 이상 결과는 성공 여부와 관계없이 사용자 검토가 필요합니다.',
    },
  }
}
