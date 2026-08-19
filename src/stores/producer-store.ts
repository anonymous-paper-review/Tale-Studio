import { create } from 'zustand'
import type { ProjectSettings, ProjectFormat } from '@/types'
import type { Json } from '@/types/database'
import { createClient, createCatalogClient } from '@/lib/supabase/client'
import { useProjectStore } from '@/stores/project-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { depthLevelFromRuntime } from '@/lib/depth'
import { isDemoSession } from '@/lib/demo/context'
import { assignCastSlugs, assignLocationSlugs } from '@/lib/cast-slug'
import { claimAction, releaseAction } from '@/lib/action-guard'
import { computeProducerSourceHash } from '@/lib/lifecycle'
import { createPendingProposal } from '@/lib/pending-proposal'
import { evaluateProducerGate } from '@/lib/producer-gate'
import { getWriterEnginePreference } from '@/lib/writer/engine'
// store 액션·순수 함수는 훅을 못 쓴다 — translate() + 현재 locale 직접 조회로 번역
//   (writer 배치의 #i18n-s5-batch3 패턴).
import { translate } from '@/lib/i18n'
import { useLocaleStore } from '@/stores/locale-store'
import type {
  CastMember,
  CastArc,
  CastMotivation,
  EntityType,
  BackgroundSource,
} from '@/lib/producer-gate'

export const WRITER_RERUN_CONSENT_TEXT =
  '지금까지 채팅 내역을 바탕으로 다시 writer에게 스토리와 연출에 대한 구상을 요청할까요?? 변경 사항들을 자연스럽게 반영할 수 있지만 다시 오랜 시간이 걸릴 수 있어요.'

// 채팅이 스토리에서 추출한 캐스트 후보 (제안일 뿐 — 사용자가 카드에서 확정/수정).
export interface ExtractedCastMember {
  // 카드 안정 핸들(localId). 있으면 이름 대신 이 카드를 지정 — 이름 없는 빈 카드도 채울 수 있다.
  ref?: string
  name?: string
  entityType?: EntityType
  appearance?: string
  role?: string
  arc?: Partial<CastArc>
  motivation?: Partial<CastMotivation>
  // true 면 이름이 일치하는 기존 카드를 삭제(병합/중복 정리). 다른 필드는 무시된다.
  remove?: boolean
}

export interface ExtractedBackground {
  // 카드 안정 핸들(localId). 있으면 이름 대신 이 배경 카드를 지정.
  ref?: string
  name?: string
  visualDescription?: string
  purpose?: string
  // true 면 이름이 일치하는 기존 배경 카드를 삭제한다.
  remove?: boolean
}

export interface ExtractedSettings {
  playtime?: number
  genre?: string
  subGenre?: string
  format?: ProjectFormat
  tone?: string[]
  dialogueLanguage?: string
  storyText?: string
  storyReady?: boolean
  characters?: ExtractedCastMember[]
  backgrounds?: ExtractedBackground[]
}

function newLocalId(prefix = 'cast'): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now()}`
  }
}

// 추출 캐스트 병합: 양방향 동기화 (chat ↔ 보드). architecture §5 원천 공동편집.
//   - 이 함수는 "적용해도 되는" 패치만 받는다(사용자가 직접 손댄 값 덮어쓰기는 호출 전에
//     승인 게이트로 걸러진다). 따라서 여기서는 LLM 제안을 그대로 반영한다:
//   - remove=true → 이름이 같은 카드 삭제(병합/중복 정리).
//   - 이름이 같은 기존 멤버가 있으면 제시된 필드를 덮어쓴다(빈 칸 채우기 + 갱신).
//   - 없으면 신규 후보로 추가.
function mergeExtractedCast(
  existing: CastMember[],
  extracted: ExtractedCastMember[],
): CastMember[] {
  let next = existing.map((m) => ({ ...m }))
  for (const e of extracted) {
    const name = (e.name ?? '').trim()
    if (!name && !e.ref) continue
    const match = e.ref
      ? next.find((m) => m.localId === e.ref)
      : next.find((m) => m.name.trim().toLowerCase() === name.toLowerCase())
    if (e.remove) {
      if (match) next = next.filter((m) => m !== match)
      continue
    }
    if (match) {
      if (name) match.name = name
      if (e.appearance) match.appearance = e.appearance
      if (e.role) match.role = e.role
      if (e.entityType) match.entityType = e.entityType === 'object' ? 'object' : 'person'
      if (e.arc && (e.arc.start_state || e.arc.end_state || e.arc.arc_type))
        match.arc = { start_state: '', end_state: '', arc_type: '', ...match.arc, ...e.arc }
      if (e.motivation && e.motivation.want)
        match.motivation = { want: '', ...match.motivation, ...e.motivation }
    } else if (name) {
      next.push({
        localId: newLocalId(),
        name,
        entityType: e.entityType === 'object' ? 'object' : 'person',
        appearance: e.appearance ?? '',
        role: e.role,
        arc:
          e.arc && (e.arc.start_state || e.arc.end_state || e.arc.arc_type)
            ? { start_state: '', end_state: '', arc_type: '', ...e.arc }
            : undefined,
        motivation: e.motivation?.want ? { want: '', ...e.motivation } : undefined,
        origin: 'producer',
        userEdited: false,
      })
    }
  }
  return next
}

function mergeExtractedBackgrounds(
  existing: BackgroundSource[],
  extracted: ExtractedBackground[],
): BackgroundSource[] {
  let next = existing.map((background) => ({ ...background }))
  for (const e of extracted) {
    const name = (e.name ?? '').trim()
    if (!name && !e.ref) continue
    const match = e.ref
      ? next.find((background) => background.localId === e.ref)
      : next.find((background) => background.name.trim().toLowerCase() === name.toLowerCase())
    if (e.remove) {
      if (match) next = next.filter((background) => background !== match)
      continue
    }
    if (match) {
      if (name) match.name = name
      if (e.visualDescription) match.visualDescription = e.visualDescription
      if (e.purpose) match.purpose = e.purpose
    } else if (name) {
      next.push({
        localId: newLocalId('background'),
        name,
        visualDescription: e.visualDescription ?? '',
        purpose: e.purpose ?? '',
        origin: 'producer',
        userEdited: false,
      })
    }
  }
  return next
}

/** 스타일 앵커 프리셋 (style_anchors 테이블 — 실사/3D/2D애니 등 시각 스타일 카탈로그). */
export interface StyleAnchor {
  key: string
  label: string
  medium: string
  imageUrl: string | null
  /** 픽커 표시용 예시 이미지(preview_url) — I2I 레퍼런스(imageUrl)와 분리. */
  previewUrl: string | null
  /** 픽커 카드 영문 부제(표시 전용) — 없으면 UI 가 medium 표기로 폴백. 톤 프리셋 6종은
   *  medium 이 전부 live_action(생성 소비값)이라 구분용 부제를 DB 에 둔다(2026-07-22). */
  subtitle: string | null
}

/** projects.custom_style_anchor(jsonb) → 상태. url 이 문자열일 때만 앵커로 인정한다.
 *  lib/style-anchor.ts 의 동명 파서와 같은 규칙이지만, 그쪽은 supabaseAdmin 을 임포트해서
 *  클라 번들에 들일 수 없다 — 그래서 여기 별도로 둔다. */
function parseCustomAnchorRow(
  raw: unknown,
): { url: string; label: string; medium: string | null } | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  if (typeof record.url !== 'string' || !record.url) return null
  return {
    url: record.url,
    label:
      typeof record.label === 'string' && record.label
        ? record.label
        : translate(useLocaleStore.getState().locale, 'My reference'),
    medium: typeof record.medium === 'string' ? record.medium : null,
  }
}

interface ProducerState {
  storyText: string
  storyReady: boolean
  projectSettings: ProjectSettings
  cast: CastMember[]
  backgrounds: BackgroundSource[]
  /** 스타일&톤 앵커 카탈로그(style_anchors) + 이 프로젝트의 선택 키(projects.style_anchor_key). */
  styleAnchors: StyleAnchor[]
  styleAnchorKey: string | null
  /** 유저가 올린 이미지로 만든 앵커(projects.custom_style_anchor). 있으면 카탈로그보다 우선한다.
   *  styleAnchorKey 는 custom_<uuid> 라 카탈로그에서 라벨을 못 찾는다 — 표시는 여기서 온다. */
  customStyleAnchor: { url: string; label: string; medium: string | null } | null
  syncing: boolean
  error: string | null

  setStoryText: (text: string) => void
  /** 앵커 카탈로그 + 현재 프로젝트 선택값 로드 (readiness board 진입 시). */
  loadStyleAnchors: () => Promise<void>
  /** 스타일 앵커 선택 — 낙관적 반영 + projects.style_anchor_key 저장. */
  setStyleAnchor: (key: string | null) => Promise<void>
  /** 채팅이 해석한 화풍 의도를 반영 — 저장은 서버(api/produce/style-anchor)가 검증 후 한다. */
  applyCustomStyleAnchor: (anchor: {
    key: string
    url: string
    label: string
    medium: string | null
  }) => void
  updateSettings: (partial: Partial<ProjectSettings>) => void
  applyExtractedSettings: (extracted: ExtractedSettings) => void
  applyProducerSourcePatch: (patch: ExtractedSettings) => void
  addCastMember: (entityType: EntityType) => string
  updateCastMember: (localId: string, patch: Partial<CastMember>) => void
  removeCastMember: (localId: string) => void
  addBackground: () => string
  updateBackground: (localId: string, patch: Partial<BackgroundSource>) => void
  removeBackground: (localId: string) => void
  saveAndHandoff: (options?: { rerun?: boolean }) => Promise<boolean>
  loadProject: () => Promise<void>
  clearError: () => void
  reset: () => void
}

const DEFAULT_SETTINGS: ProjectSettings = {
  playtime: 0,
  genre: '',
  format: 'horizontal_16:9',
  tone: [],
  dialogueLanguage: '',
}

const SOURCE_SETTING_KEYS = [
  'playtime',
  'genre',
  'subGenre',
  'format',
  'tone',
  'dialogueLanguage',
] as const

function isMeaningfulExtractedValue(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'number') return value > 0
  if (Array.isArray(value)) return value.length > 0
  return value != null
}

function normalizedComparable(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value)) return JSON.stringify([...value].sort())
  return JSON.stringify(value ?? null)
}

function findByName<T extends { name: string }>(list: T[], name?: string): T | undefined {
  const n = (name ?? '').trim().toLowerCase()
  if (!n) return undefined
  return list.find((x) => x.name.trim().toLowerCase() === n)
}

// ref(localId) 있으면 그 카드를, 없으면 이름으로 기존 카드를 찾는다 (승인 게이트 판정용).
function findForEntry<T extends { localId: string; name: string }>(
  list: T[],
  e: { ref?: string; name?: string },
): T | undefined {
  if (e.ref) return list.find((x) => x.localId === e.ref)
  return findByName(list, e.name)
}

// 한 캐스트 제안이 현재 상태를 바꾸는가 (추가/채움/덮어쓰기/삭제 모두 포함).
function castEntryAffects(existing: CastMember | undefined, e: ExtractedCastMember): boolean {
  if (e.remove) return !!existing
  if (!existing) return true
  return (
    (isMeaningfulExtractedValue(e.appearance) &&
      normalizedComparable(e.appearance) !== normalizedComparable(existing.appearance)) ||
    (isMeaningfulExtractedValue(e.role) &&
      normalizedComparable(e.role) !== normalizedComparable(existing.role)) ||
    (isMeaningfulExtractedValue(e.entityType) && e.entityType !== existing.entityType) ||
    (!!e.arc && normalizedComparable(e.arc) !== normalizedComparable(existing.arc)) ||
    (!!e.motivation?.want && normalizedComparable(e.motivation) !== normalizedComparable(existing.motivation))
  )
}

// 한 캐스트 제안이 "사용자가 직접 손댄" 비어있지 않은 값을 덮어쓰거나 삭제하는가.
function castEntryClobbersUser(existing: CastMember | undefined, e: ExtractedCastMember): boolean {
  if (!existing || !existing.userEdited) return false
  if (e.remove) return true
  return (
    (isMeaningfulExtractedValue(e.appearance) &&
      isMeaningfulExtractedValue(existing.appearance) &&
      normalizedComparable(e.appearance) !== normalizedComparable(existing.appearance)) ||
    (isMeaningfulExtractedValue(e.role) &&
      isMeaningfulExtractedValue(existing.role) &&
      normalizedComparable(e.role) !== normalizedComparable(existing.role)) ||
    (!!e.arc && !!existing.arc && normalizedComparable(e.arc) !== normalizedComparable(existing.arc)) ||
    (!!e.motivation?.want &&
      !!existing.motivation?.want &&
      normalizedComparable(e.motivation) !== normalizedComparable(existing.motivation))
  )
}

function backgroundEntryAffects(existing: BackgroundSource | undefined, e: ExtractedBackground): boolean {
  if (e.remove) return !!existing
  if (!existing) return true
  return (
    (isMeaningfulExtractedValue(e.visualDescription) &&
      normalizedComparable(e.visualDescription) !== normalizedComparable(existing.visualDescription)) ||
    (isMeaningfulExtractedValue(e.purpose) &&
      normalizedComparable(e.purpose) !== normalizedComparable(existing.purpose))
  )
}

function backgroundEntryClobbersUser(existing: BackgroundSource | undefined, e: ExtractedBackground): boolean {
  if (!existing || !existing.userEdited) return false
  if (e.remove) return true
  return (
    (isMeaningfulExtractedValue(e.visualDescription) &&
      isMeaningfulExtractedValue(existing.visualDescription) &&
      normalizedComparable(e.visualDescription) !== normalizedComparable(existing.visualDescription)) ||
    (isMeaningfulExtractedValue(e.purpose) &&
      isMeaningfulExtractedValue(existing.purpose) &&
      normalizedComparable(e.purpose) !== normalizedComparable(existing.purpose))
  )
}

// 핸드오프 이후 게이트용 — 채팅 제안이 현재 Producer 원천(스토리/설정/캐스트/배경)을 바꾸는가.
function extractedAffectsExisting(
  state: Pick<ProducerState, 'storyText' | 'projectSettings' | 'cast' | 'backgrounds'>,
  extracted: ExtractedSettings,
): string[] {
  const overwritten: string[] = []
  if (
    isMeaningfulExtractedValue(extracted.storyText) &&
    state.storyText.trim().length > 0 &&
    normalizedComparable(extracted.storyText) !== normalizedComparable(state.storyText)
  ) {
    overwritten.push('storyText')
  }

  for (const key of SOURCE_SETTING_KEYS) {
    const next = extracted[key]
    const current = state.projectSettings[key]
    if (
      isMeaningfulExtractedValue(next) &&
      isMeaningfulExtractedValue(current) &&
      normalizedComparable(next) !== normalizedComparable(current)
    ) {
      overwritten.push(key)
    }
  }

  if (
    Array.isArray(extracted.characters) &&
    extracted.characters.some((c) => castEntryAffects(findForEntry(state.cast, c), c))
  ) {
    overwritten.push('characters')
  }
  if (
    Array.isArray(extracted.backgrounds) &&
    extracted.backgrounds.some((b) => backgroundEntryAffects(findForEntry(state.backgrounds, b), b))
  ) {
    overwritten.push('backgrounds')
  }

  return overwritten
}

// 항상 적용되는 보호 게이트 — 채팅 제안이 사용자가 직접 손댄 카드 값을 덮어쓰거나 삭제하는가.
function extractedClobbersUserEdited(
  state: Pick<ProducerState, 'cast' | 'backgrounds'>,
  extracted: ExtractedSettings,
): string[] {
  const conflicts: string[] = []
  if (
    Array.isArray(extracted.characters) &&
    extracted.characters.some((c) => castEntryClobbersUser(findForEntry(state.cast, c), c))
  ) {
    conflicts.push('characters')
  }
  if (
    Array.isArray(extracted.backgrounds) &&
    extracted.backgrounds.some((b) => backgroundEntryClobbersUser(findForEntry(state.backgrounds, b), b))
  ) {
    conflicts.push('backgrounds')
  }
  return conflicts
}

function settingsPatchFromExtracted(patch: ExtractedSettings): Partial<ProjectSettings> {
  const next: Partial<ProjectSettings> = {}
  if (patch.playtime !== undefined) next.playtime = patch.playtime
  if (patch.genre !== undefined) next.genre = patch.genre
  if (patch.subGenre !== undefined) next.subGenre = patch.subGenre
  if (patch.format !== undefined) next.format = patch.format
  if (patch.tone !== undefined) next.tone = patch.tone
  if (patch.dialogueLanguage !== undefined) next.dialogueLanguage = patch.dialogueLanguage
  return next
}

function normalizeProducerSettings(settings: Partial<ProjectSettings> | null | undefined): ProjectSettings {
  const producerSettings = { ...(settings ?? {}) }
  delete producerSettings.targetEmotion
  return {
    ...DEFAULT_SETTINGS,
    ...producerSettings,
  }
}

const PRODUCER_DRAFT_VERSION = 1

// 핸드오프 전 프로듀서 보드의 working-copy 스냅샷 (projects.producer_draft 에 자동저장).
export interface ProducerDraft {
  version: number
  savedAt: number
  storyText: string
  storyReady: boolean
  settings: ProjectSettings
  cast: CastMember[]
  backgrounds: BackgroundSource[]
}

export interface ProducerBoardState {
  storyText: string
  storyReady: boolean
  settings: ProjectSettings
  cast: CastMember[]
  backgrounds: BackgroundSource[]
}

// jsonb 값을 안전하게 ProducerDraft 로 파싱 (형태가 안 맞으면 null).
export function parseProducerDraft(raw: unknown): ProducerDraft | null {
  if (!raw || typeof raw !== 'object') return null
  const d = raw as Partial<ProducerDraft>
  if (!Array.isArray(d.cast) || !Array.isArray(d.backgrounds)) return null
  if (!d.settings || typeof d.settings !== 'object') return null
  return {
    version: typeof d.version === 'number' ? d.version : PRODUCER_DRAFT_VERSION,
    savedAt: typeof d.savedAt === 'number' ? d.savedAt : 0,
    storyText: typeof d.storyText === 'string' ? d.storyText : '',
    storyReady: d.storyReady === true,
    settings: normalizeProducerSettings(d.settings),
    cast: d.cast as CastMember[],
    backgrounds: d.backgrounds as BackgroundSource[],
  }
}

// 재진입 복원: 드래프트(프로듀서 working copy)를 우선하되, DB(characters/locations)에만 있는
//   카드(예: writer-origin)는 이름 기준으로 합쳐 누락 없이 보여준다.
export function mergeDraftWithDb(
  draft: ProducerDraft | null,
  db: ProducerBoardState,
): ProducerBoardState {
  if (!draft) return db
  const key = (name: string) => name.trim().toLowerCase()
  const draftCastNames = new Set(draft.cast.map((c) => key(c.name)).filter(Boolean))
  const extraCast = db.cast.filter((c) => {
    const k = key(c.name)
    return k.length > 0 && !draftCastNames.has(k)
  })
  const draftBgNames = new Set(draft.backgrounds.map((b) => key(b.name)).filter(Boolean))
  const extraBackgrounds = db.backgrounds.filter((b) => {
    const k = key(b.name)
    return k.length > 0 && !draftBgNames.has(k)
  })
  return {
    storyText: draft.storyText || db.storyText,
    storyReady: draft.storyReady || db.storyReady,
    settings: draft.settings,
    cast: [...draft.cast, ...extraCast],
    backgrounds: [...draft.backgrounds, ...extraBackgrounds],
  }
}

function buildProducerDraft(state: ProducerBoardState): ProducerDraft {
  return {
    version: PRODUCER_DRAFT_VERSION,
    savedAt: Date.now(),
    storyText: state.storyText,
    storyReady: state.storyReady,
    settings: state.settings,
    cast: state.cast,
    backgrounds: state.backgrounds,
  }
}
function boardOf(
  s: Pick<ProducerState, 'storyText' | 'storyReady' | 'projectSettings' | 'cast' | 'backgrounds'>,
): ProducerBoardState {
  return {
    storyText: s.storyText,
    storyReady: s.storyReady,
    settings: s.projectSettings,
    cast: s.cast,
    backgrounds: s.backgrounds,
  }
}

// 디바운스 자동저장 — 보드 변경 후 800ms 무편집이면 projects.producer_draft 에 1회 저장.
const DRAFT_SAVE_DEBOUNCE_MS = 800
let draftSaveTimer: ReturnType<typeof setTimeout> | null = null
let pendingDraftProjectId: string | null = null

function cancelDraftSave(): void {
  if (draftSaveTimer) {
    clearTimeout(draftSaveTimer)
    draftSaveTimer = null
  }
  pendingDraftProjectId = null
}

function scheduleDraftSave(getState: () => ProducerBoardState): void {
  if (typeof window === 'undefined') return
  const projectId = useProjectStore.getState().projectId
  if (!projectId) return
  pendingDraftProjectId = projectId
  if (draftSaveTimer) clearTimeout(draftSaveTimer)
  draftSaveTimer = setTimeout(() => {
    draftSaveTimer = null
    const targetId = pendingDraftProjectId
    pendingDraftProjectId = null
    // 저장 직전 프로젝트가 바뀌었으면 교차오염 방지를 위해 건너뛴다.
    if (!targetId || useProjectStore.getState().projectId !== targetId) return
    const draft = buildProducerDraft(getState())
    void (async () => {
      try {
        const supabase = createClient()
        await supabase
          .from('projects')
          .update({ producer_draft: draft as unknown as Json })
          .eq('id', targetId)
      } catch (err) {
        console.error('[producer-store] draft save failed:', err)
      }
    })()
  }, DRAFT_SAVE_DEBOUNCE_MS)
}


export const useProducerStore = create<ProducerState>((set, get) => ({
  storyText: '',
  storyReady: false,
  projectSettings: { ...DEFAULT_SETTINGS },
  cast: [],
  backgrounds: [],
  styleAnchors: [],
  styleAnchorKey: null,
  customStyleAnchor: null,
  syncing: false,
  error: null,

  setStoryText: (text) => {
    if (isDemoSession()) return
    set({ storyText: text })
    scheduleDraftSave(() => boardOf(get()))
  },

  loadStyleAnchors: async () => {
    const projectId = useProjectStore.getState().projectId
    try {
      // style_anchors 는 전역 공개 카탈로그 → 데모(공유) 세션에서도 실 anon 으로 읽는다(스냅샷 미포함,
      //   프리뷰 등 최신 반영). 프로젝트의 선택 키(style_anchor_key)는 createClient()로 — 데모면 스냅샷.
      const catalog = createCatalogClient()
      const supabase = createClient()
      const [{ data: anchors }, projRes] = await Promise.all([
        catalog
          .from('style_anchors')
          .select('key, label, medium, image_url, preview_url, subtitle, sort_order')
          .eq('is_active', true)
          .order('sort_order'),
        projectId
          ? supabase
              .from('projects')
              .select('style_anchor_key, custom_style_anchor')
              .eq('id', projectId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ])
      set({
        styleAnchors: (anchors ?? []).map((a) => ({
          key: a.key,
          label: a.label,
          medium: a.medium,
          imageUrl: a.image_url ?? null,
          previewUrl: a.preview_url ?? null,
          subtitle: a.subtitle ?? null,
        })),
        styleAnchorKey:
          (projRes.data as { style_anchor_key?: string | null } | null)?.style_anchor_key || null,
        customStyleAnchor: parseCustomAnchorRow(
          (projRes.data as { custom_style_anchor?: unknown } | null)?.custom_style_anchor,
        ),
      })
    } catch (err) {
      console.error('[producer-store] style anchors load failed:', err)
    }
  },

  setStyleAnchor: async (key) => {
    if (isDemoSession()) return
    const projectId = useProjectStore.getState().projectId
    const prev = get().styleAnchorKey
    const prevCustom = get().customStyleAnchor
    // 프리셋을 고르면 커스텀 앵커는 반드시 비운다 — 남겨 두면 resolveStyleAnchor 가 커스텀을
    //   우선해서, 카드를 바꿨는데 화풍이 안 바뀌는 조용한 고장이 된다.
    set({ styleAnchorKey: key, customStyleAnchor: null })
    if (!projectId) return
    const { error } = await createClient()
      .from('projects')
      .update({ style_anchor_key: key ?? '', custom_style_anchor: null })
      .eq('id', projectId)
    if (error) {
      set({
        styleAnchorKey: prev,
        customStyleAnchor: prevCustom,
        error: translate(useLocaleStore.getState().locale, 'Failed to save style: {message}', {
          message: error.message,
        }),
      })
    }
  },

  applyCustomStyleAnchor: ({ key, url, label, medium }) => {
    set({ styleAnchorKey: key, customStyleAnchor: { url, label, medium } })
  },

  updateSettings: (partial) => {
    if (isDemoSession()) return
    set((state) => ({
      projectSettings: { ...state.projectSettings, ...partial },
    }))
    scheduleDraftSave(() => boardOf(get()))
  },

  applyExtractedSettings: (extracted) => {
    if (!extracted) return
    const project = useProjectStore.getState()
    const current = get()
    const afterHandoff = project.reachedStage !== 'producer'
    const affected = extractedAffectsExisting(current, extracted)
    const protectedConflicts = extractedClobbersUserEdited(current, extracted)
    // 게이트: (핸드오프 후 원천 변경) 또는 (사용자가 직접 손댄 카드 값 덮어쓰기/삭제).
    //   그 외(빈 칸 채우기·신규 추가·미정 갱신·핸드오프 전 변경)는 즉시 반영해 보드와 동기화한다.
    const needsApproval =
      (afterHandoff && affected.length > 0) || protectedConflicts.length > 0

    if (needsApproval) {
      // createPendingProposal/offerPendingProposal 은 범위 밖(global-chat-store.ts) — 그쪽
      //   렌더 지점이 아직 t() 를 안 태우므로(artist 단계의 같은 패턴도 미번역 확인, 2026-08-18
      //   실측), 여기서 미리 translate() 로 완역해 넘긴다(#i18n-s5-batch3, ko 사용자는 기존과
      //   동일 출력 — locale 값이 안 바뀌면 회귀 없음).
      const locale = useLocaleStore.getState().locale
      const impactFields = Array.from(new Set([...affected, ...protectedConflicts]))
      const accepted = useGlobalChatStore.getState().offerPendingProposal(
        createPendingProposal({
          stage: 'producer',
          kind: 'producerSourcePatch',
          target: 'Producer source',
          action: translate(locale, 'Apply story/settings/card changes suggested by chat'),
          impact: [
            translate(locale, 'Changed fields: {fields}', { fields: impactFields.join(', ') }),
            protectedConflicts.length > 0
              ? translate(locale, 'This overwrites or deletes card values you edited directly.')
              : translate(locale, 'Existing Writer/Artist output may become stale.'),
            translate(locale, 'Current Producer values stay in place until you approve.'),
          ],
          payload: { patch: extracted },
        }),
      )
      if (!accepted)
        set({
          error: translate(
            locale,
            'A proposal is already pending, so the new Producer change proposal was held back.',
          ),
        })
      return
    }

    get().applyProducerSourcePatch(extracted)
  },

  applyProducerSourcePatch: (patch) => {
    set((state) => {
      const {
        storyText: nextStory,
        storyReady: nextReady,
        characters: extractedCast,
        backgrounds: extractedBackgrounds,
      } = patch
      const settingsPatch = settingsPatchFromExtracted(patch)
      return {
        projectSettings: {
          ...state.projectSettings,
          ...settingsPatch,
        },
        cast:
          extractedCast && extractedCast.length > 0
            ? mergeExtractedCast(state.cast, extractedCast)
            : state.cast,
        backgrounds:
          extractedBackgrounds && extractedBackgrounds.length > 0
            ? mergeExtractedBackgrounds(state.backgrounds, extractedBackgrounds)
            : state.backgrounds,
        storyText: nextStory ? nextStory : state.storyText,
        storyReady: nextReady === true ? true : state.storyReady,
      }
    })
    scheduleDraftSave(() => boardOf(get()))
  },

  addCastMember: (entityType) => {
    // 데모(공유) 세션: 읽기전용 — 카드 추가/편집/삭제 무시(로컬 상태도 안 바꿔 "삭제된 척" 방지).
    if (isDemoSession()) return ''
    const localId = newLocalId()
    set((state) => ({
      cast: [
        ...state.cast,
        { localId, name: '', entityType, appearance: '', origin: 'producer', userEdited: true },
      ],
    }))
    scheduleDraftSave(() => boardOf(get()))
    return localId
  },

  updateCastMember: (localId, patch) => {
    if (isDemoSession()) return
    set((state) => ({
      cast: state.cast.map((m) => (m.localId === localId ? { ...m, ...patch, userEdited: true } : m)),
    }))
    scheduleDraftSave(() => boardOf(get()))
  },

  removeCastMember: (localId) => {
    if (isDemoSession()) return
    set((state) => ({
      cast: state.cast.filter((m) => m.localId !== localId),
    }))
    scheduleDraftSave(() => boardOf(get()))
  },

  addBackground: () => {
    if (isDemoSession()) return ''
    const localId = newLocalId('background')
    set((state) => ({
      backgrounds: [
        ...state.backgrounds,
        { localId, name: '', visualDescription: '', purpose: '', origin: 'producer', userEdited: true },
      ],
    }))
    scheduleDraftSave(() => boardOf(get()))
    return localId
  },

  updateBackground: (localId, patch) => {
    if (isDemoSession()) return
    set((state) => ({
      backgrounds: state.backgrounds.map((background) =>
        background.localId === localId
          ? { ...background, ...patch, userEdited: true }
          : background,
      ),
    }))
    scheduleDraftSave(() => boardOf(get()))
  },

  removeBackground: (localId) => {
    if (isDemoSession()) return
    set((state) => ({
      backgrounds: state.backgrounds.filter((background) => background.localId !== localId),
    }))
    scheduleDraftSave(() => boardOf(get()))
  },

  saveAndHandoff: async (options) => {
    if (isDemoSession()) return false
    const { storyText, projectSettings, cast, backgrounds } = get()
    const projectId = useProjectStore.getState().projectId
    if (!projectId) return false

    // 핸드오프 하드게이트 — UI 버튼 비활성화뿐 아니라 모든 진입 경로(writer 재실행 제안 승인 등)에서
    //   동일하게 강제한다. 게이트(스토리/설정/캐스트/배경) 미충족이면 writer 를 시작하지 않는다.
    const gate = evaluateProducerGate({
      settings: normalizeProducerSettings(projectSettings),
      storyReady: get().storyReady,
      cast,
      backgrounds,
      styleAnchorKey: get().styleAnchorKey,
      locale: useLocaleStore.getState().locale,
    })
    if (!gate.canHandoff) {
      // gate.hardMissing[].label 은 src/lib/producer-gate.ts(범위 밖)가 하드코딩한 한국어 —
      //   래퍼 문장만 번역하고 목록 자체는 그대로 통과(ko 사용자는 회귀 없음, en 은 래퍼만 개선).
      set({
        error: translate(
          useLocaleStore.getState().locale,
          'Required items are empty before handoff: {fields}',
          { fields: gate.hardMissing.map((i) => i.label).join(', ') },
        ),
      })
      return false
    }

    // 연타 방어(#double-fire) — 핸드오프는 writer 파이프라인을 발사한다. 두 번 나가면 같은
    //   프로젝트에 실행이 겹친다. 버튼 disabled 와 별개인 최종 방어선.
    //   게이트 *뒤*에 둔다: 게이트 거절은 빠른 로컬 실패라, 앞에 두면 사용자가 빈 칸을 채우고
    //   바로 다시 눌렀을 때 아직 닫힌 창에 막힌다.
    const actionKey = `producer:handoff:${projectId}`
    if (!claimAction(actionKey)) return false

    set({ syncing: true, error: null })

    // 시간측정: 핸드오프 클릭 시각을 기록 → artist 가 "이미지 생성 가능"까지의 end-to-end 를 계산.
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem(`handoffStartedAt:${projectId}`, String(Date.now()))
      } catch {}
    }

    try {
      const producerSettings = normalizeProducerSettings(projectSettings)
      const producerSourceHash = computeProducerSourceHash({
        storyText,
        settings: producerSettings,
        cast,
        backgrounds,
      })
      const supabase = createClient()
      const { error } = await supabase
        .from('projects')
        .update({
          story_text: storyText,
          settings: producerSettings,
        })
        .eq('id', projectId)

      if (error) throw error

      // writer 파이프라인 백그라운드 시작 — 단일 생산자(§3 일원화). S0~L5 텍스트 단계가
      //   DB scenes/characters/locations/shots 를 채워 artist/director 가 읽는다(persist_manifest).
      //   옛 generate-scenes 는 제거됨. 2분 가량 걸리므로 await 하지 않음(fire-and-forget).
      try {
        const runtimeSeconds = typeof projectSettings.playtime === 'number' && projectSettings.playtime > 0
          ? projectSettings.playtime
          : undefined

        // producer-story-gate §3: 확정 장르(완성형) + 캐스트 계약 조립.
        //   slug 는 producer 가 부여(생성 후 불변). writer 는 이를 seed 로 받아 s0/s2 를 생략한다.
        const slugged = assignCastSlugs(cast)
        const castContract = {
          characters: slugged.map((m) => ({
            character_id: m.character_id,
            name: m.name,
            entity_type: m.entityType,
            role: m.role,
            appearance: m.appearance,
            arc: m.arc,
            motivation: m.motivation,
          })),
        }
        const backgroundSlugged = assignLocationSlugs(backgrounds)
        const backgroundContract = {
          locations: backgroundSlugged.map((background) => ({
            location_id: background.location_id,
            name: background.name,
            visual_description: background.visualDescription,
            purpose: background.purpose,
            user_edited: background.userEdited === true,
          })),
        }
        const genre = {
          genre: projectSettings.genre,
          subGenre: projectSettings.subGenre || undefined,
          tone: projectSettings.tone,
          targetEmotion: [],
          runtime_seconds: projectSettings.playtime,
          depth_level: depthLevelFromRuntime(projectSettings.playtime || 0),
          format: projectSettings.format,
        }

        const writerResponse = await fetch('/api/writer/start', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            projectId,
            story: storyText,
            ...(options?.rerun === true ? { rerun: true } : {}),
            ...(options?.rerun === true
              ? {
                  chatHistory: useGlobalChatStore
                    .getState()
                    .messages.slice(-200)
                    .map((message) => ({
                      stage: message.stage,
                      role: message.role,
                      content: message.content,
                      created_at: null,
                    })),
                }
              : {}),
            writerEngine: getWriterEnginePreference(projectId),
            runtimeSeconds,
            genre,
            cast: castContract,
            producerSourceHash,
            backgrounds: backgroundContract,
          }),
        })
        if (writerResponse.status === 409) {
          const body = await writerResponse.json().catch(() => ({}))
          // 완료된 Writer 재실행은 반드시 별도 동의 후에만 허용한다. 첫 409에서
          // 연타 방어 창을 즉시 열어 승인 버튼이 곧바로 새 요청을 보낼 수 있게 한다.
          if (body?.code === 'writer_rerun_confirmation_required') {
            releaseAction(actionKey)
            useGlobalChatStore.getState().offerPendingProposal(
              createPendingProposal({
                stage: 'producer',
                kind: 'producerWriterRerunRequest',
                target: 'Writer 다시 실행',
                action: WRITER_RERUN_CONSENT_TEXT,
                impact: [
                  '현재 Writer의 씬·샷 스토리와 채팅 내역을 새 Writer 입력에 담아요.',
                  '현재 Producer의 스토리·설정·캐스트·배경 결정도 함께 전달해요.',
                  '다시 실행하면 시간이 오래 걸릴 수 있어요. 승인 전에는 아무 생성도 시작하지 않아요.',
                ],
                payload: { rerun: true },
              }),
            )
            set({ syncing: false, error: null })
            return false
          }
          const status =
            body?.code === 'writer_gate_pending'
              ? '현재 씬 스토리 초안이 준비됐어요. Writer 화면에서 확정하거나 수정 요청으로 다시 실행할지 선택해 주세요.'
              : body?.code === 'writer_run_active'
                ? 'Writer가 이미 실행 중이에요. 현재 Writer 화면에서 진행 상황을 확인해 주세요.'
                : `Writer 시작이 거부됐어요 (HTTP 409)`
          throw new Error(status)
        }
        if (!writerResponse.ok) {
          let detail = writerResponse.statusText
          try {
            const body = await writerResponse.json()
            detail = body?.error ?? detail
          } catch {}
          throw new Error(`writer start failed: ${detail}`)
        }
      } catch (writerErr) {
        throw writerErr
      }

      const { error: stageError } = await supabase
        .from('projects')
        .update({
          // current_stage 는 MVP에서 "최고로 열린 단계"로 재사용한다.
          // Writer 시작 성공 후에만 DB unlock을 artist까지 올린다.
          current_stage: 'artist',
        })
        .eq('id', projectId)
      if (stageError) throw stageError

      useProjectStore.getState().unlockThrough('artist')
      useProjectStore.getState().setStage('writer')
      set({ syncing: false })
      return true
    } catch (err) {
      set({
        syncing: false,
        error: err instanceof Error ? err.message : 'Save failed',
      })
      return false
    }
  },

  loadProject: async () => {
    const projectId = useProjectStore.getState().projectId
    if (!projectId) return
    // 재로드 중에는 이전 편집으로 예약된 자동저장이 끼어들지 않게 취소.
    cancelDraftSave()

    try {
      const supabase = createClient()
      const { data: project } = await supabase
        .from('projects')
        .select('story_text, settings, last_writer_run_id, producer_draft')
        .eq('id', projectId)
        .single()

      // 캐스트는 characters 테이블이 단일 진실 (pull) — producer/writer/artist 공용.
      //   재진입 시 기존(producer·writer-origin 무관) 행을 카드로 복원.
      const { data: chars } = await supabase
        .from('characters')
        .select('id, character_id, name, role, entity_type, appearance, appearance_native, arc, motivation, origin')
        .eq('project_id', projectId)

      // 배경은 locations 테이블이 단일 진실 (pull) — producer/writer/artist 공용.
      const { data: locationRows } = await supabase
        .from('locations')
        .select('id, location_id, name, visual_description, visual_description_native, style_description, purpose, origin, user_edited, last_writer_run_id')
        .eq('project_id', projectId)

      if (project) {
        const dbBoard: ProducerBoardState = {
          storyText: project.story_text ?? '',
          // 이미 저장된 스토리가 있으면 "준비됨"으로 본다 — 핸드오프/재실행 버튼이
          //   storyReady 게이트에 막혀 비활성화되지 않도록 (writer 재실행 가능하게).
          storyReady: !!(project.story_text && project.story_text.trim().length > 0),
          settings: normalizeProducerSettings(project.settings as Partial<ProjectSettings>),
          cast: (chars ?? []).map((c): CastMember => ({
            localId: c.id as string,
            characterId: c.character_id as string,
            name: (c.name as string) ?? '',
            entityType: c.entity_type === 'object' ? 'object' : 'person',
            // 표시·편집은 유저 언어(appearance_native), 생성 base(EN)는 핸드오프 때 파생. draft 없는
            //   opencast(writer-origin) 인물이 외모를 영어로 표시하던 버그(2026-07-09). producer 인물은 draft(한국어) 우선.
            appearance: (c.appearance_native as string | null) ?? (c.appearance as string | null) ?? '',
            role: (c.role as string) ?? undefined,
            arc: (c.arc as CastArc) ?? undefined,
            motivation: (c.motivation as CastMotivation) ?? undefined,
            origin: c.origin === 'writer' ? 'writer' : 'producer',
            // DB 재로드 값은 파이프라인 산출(예: "미정")일 수 있어 보호 대상 아님.
            //   세션 내 카드 UI 편집 시에만 userEdited 가 true 로 올라간다.
            userEdited: false,
          })),
          backgrounds: (locationRows ?? []).map((location): BackgroundSource => {
            const origin = location.origin === 'writer' ? 'writer' : 'producer'
            return {
              localId: location.id as string,
              locationId: location.location_id as string,
              name: (location.name as string) ?? '',
              visualDescription: ((location.visual_description_native as string | null) ?? (location.visual_description as string | null) ?? (location.style_description as string | null) ?? ''),
              purpose: (location.purpose as string | null) ?? '',
              origin,
              userEdited: location.user_edited === true,
              stale: origin === 'writer' && !!project.last_writer_run_id && location.last_writer_run_id !== project.last_writer_run_id,
            }
          }),
        }

        // 핸드오프 전 세션에서 채운 보드는 producer_draft 에만 남는다 → 있으면 그걸로 복원.
        //   DB(characters/locations)에만 있는 writer-origin 카드는 이름 기준으로 합쳐 누락 없이 보여준다.
        const draft = parseProducerDraft((project as { producer_draft?: unknown }).producer_draft)
        const restored = mergeDraftWithDb(draft, dbBoard)
        set({
          storyText: restored.storyText,
          storyReady: restored.storyReady,
          projectSettings: restored.settings,
          cast: restored.cast,
          backgrounds: restored.backgrounds,
        })
      }
    } catch (err) {
      console.error('[producer-store] loadProject failed:', err)
    }
  },

  clearError: () => set({ error: null }),

  reset: () => {
    cancelDraftSave()
    set({
      storyText: '',
      storyReady: false,
      projectSettings: { ...DEFAULT_SETTINGS },
      cast: [],
      backgrounds: [],
      styleAnchorKey: null, // 카탈로그(styleAnchors)는 프로젝트 무관 — 유지
      customStyleAnchor: null, // 프로젝트 소속 — 반드시 비운다
      syncing: false,
      error: null,
    })
  },
}))
