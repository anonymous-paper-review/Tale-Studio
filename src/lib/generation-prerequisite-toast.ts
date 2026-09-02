'use client'

// 생성 선행조건 미충족(409 + code) 공용 안내 — 서버가 "무엇이 빠졌는지"를 code 로 주면 여기서 한 문장으로.
//   quota-toast 와 같은 관용구: `if (notifyIfPrerequisiteMissing(res.status, body)) return`.
//   첫 사례(#ref-gate 2026-09-02): 실사 스토리보드에 필요한 인물 시트가 아직 없음.

import { toast } from 'sonner'
import { translate } from '@/lib/i18n'
import { useLocaleStore } from '@/stores/locale-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'

export interface MissingCharacterSheetsBody {
  error?: string
  code?: string
  missing?: Array<{ characterId?: string; appearanceKey?: string; name?: string }>
}

export function isMissingCharacterSheets(status: number, body: unknown): body is MissingCharacterSheetsBody {
  return (
    status === 409 &&
    typeof body === 'object' &&
    body !== null &&
    (body as { code?: unknown }).code === 'missing_character_sheets'
  )
}

export function notifyMissingCharacterSheets(body: MissingCharacterSheetsBody | null | undefined): void {
  const locale = useLocaleStore.getState().locale
  const names = (body?.missing ?? [])
    .map((m) => (m.name ?? m.characterId ?? '').trim())
    .filter(Boolean)
    .join(', ')
  const message = translate(
    locale,
    'Character sheets are still missing for {names}. Generate them in the Artist tab first, then retry.',
    { names: names || '?' },
  )
  toast.error(message, { id: 'generation-prerequisite-missing' })
  // 채팅에도 남긴다 — toast 는 사라지지만 "왜 안 됐나"는 stage 를 옮겨도 읽을 수 있어야 한다.
  useGlobalChatStore.getState().notifyActionError('director', translate(locale, 'Storyboard'), message)
}

/** 선행조건 미충족이면 안내하고 true. 아니면 false — 나머지 오류 처리는 호출부 몫. */
export function notifyIfPrerequisiteMissing(status: number, body: unknown): boolean {
  if (isMissingCharacterSheets(status, body)) {
    notifyMissingCharacterSheets(body)
    return true
  }
  return false
}
