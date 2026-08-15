// 스테이지 전환 액세스 키 (#keyboard-only 2026-08-11, Alt+숫자 이관 2026-08-12).
//
// Alt(Option) + 1~5 가 STAGES 순서와 1:1 — Producer/Writer/Concept Artist/Director/Editor.
//   (구 Alt+QWERT 에서 이관 — 오너 요청 2026-08-12. 숫자가 레일의 P1~P5 배지와도 맞는다.)
//
// 오버라이드 조사 (2026-08-12):
//   · Chrome/Edge/Safari — Alt+숫자는 기본 바인딩이 없다. 가로채기 문제 없음.
//   · macOS Option+숫자 — OS 단축키가 아니라 특수문자 입력(¡™£…)이다. e.code(Digit)로 판정하고
//     preventDefault 하므로 문자도 입력되지 않는다.
//   · Firefox(Linux 계열) — Alt+1~8 이 브라우저 탭 전환에 매여 있어 **가로챌 수 없을 수 있다**
//     (예약 가속키는 preventDefault 무시). 단 잘못 눌러도 브라우저 탭이 바뀔 뿐 작업 손실은
//     없어(구 Cmd+W=탭 닫힘과 달리) 배열을 유지한다.
//   모디파이어가 Ctrl/Cmd 가 아닌 이유(2026-08-11 조사 유지): Ctrl/Cmd+숫자는 전 브라우저의
//   탭 전환 예약키라 확실히 못 가로챈다.

import { STAGES } from '@/lib/constants'
import type { StageId } from '@/types'

export const STAGE_ACCESS_KEY: Record<StageId, string> = {
  producer: '1',
  writer: '2',
  artist: '3',
  director: '4',
  editor: '5',
}

/** 표시용 모디파이어 이름 — macOS 는 Option, 나머지는 Alt. */
export function accessModifierLabel(platform?: string): string {
  const p = platform ?? (typeof navigator === 'undefined' ? '' : navigator.platform)
  return /mac|iphone|ipad/i.test(p) ? 'Option' : 'Alt'
}

/**
 * KeyboardEvent.code → stage.
 * e.key 가 아니라 code 를 보는 이유: macOS 에서 Option+숫자는 특수문자(¡™£…)로 도착한다 —
 *   e.key 검사는 거기서 전부 빗나간다. 물리 키 위치인 code 는 안 변한다. 넘패드도 함께 받는다.
 */
const STAGE_BY_CODE = new Map<string, StageId>(
  STAGES.flatMap((s) => {
    const key = STAGE_ACCESS_KEY[s.id as StageId]
    return [
      [`Digit${key}`, s.id as StageId] as const,
      [`Numpad${key}`, s.id as StageId] as const,
    ]
  }),
)

export interface ShortcutEventLike {
  code: string
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
}

/**
 * 이 키 입력이 어느 스테이지를 겨냥하는가. Alt 단독일 때만 — Ctrl/Cmd/Shift 가 섞이면
 * 다른 의도(브라우저 단축키·선택 확장)이므로 양보한다.
 */
export function stageForShortcut(e: ShortcutEventLike): StageId | null {
  if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return null
  return STAGE_BY_CODE.get(e.code) ?? null
}
