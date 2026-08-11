// 스테이지 전환 액세스 키 (#keyboard-only 2026-08-11).
//
// 왼손 Q·W·E·R·T 가 STAGES 순서와 1:1 — Producer/Writer/Concept Artist/Director/Editor.
//
// 모디파이어가 Ctrl/Cmd 가 아니라 Alt(macOS Option)인 이유 — 오너 요청은 Ctrl/Cmd 였고
//   "오버라이드 가능한지 확인 필요"가 함께 왔다. 확인 결과 다섯 중 셋이 불가능하다:
//     · Cmd+Q (macOS)     — 앱 종료. OS 가 먼저 먹어 페이지에 keydown 자체가 안 온다.
//     · Cmd/Ctrl+W        — 탭 닫기. 브라우저 예약 가속키라 preventDefault 로 못 막는다.
//     · Cmd/Ctrl+T        — 새 탭. 마찬가지.
//     (Ctrl+E·Ctrl+R 은 가로챌 수 있지만, 5개 중 2개만 되는 단축키는 없느니만 못하다.)
//   진짜 문제는 "안 먹는다"가 아니라 **Writer 로 가려고 Cmd+W 를 누르면 탭이 닫혀 작업을 잃는 것**이다.
//   그래서 같은 QWERT 배열을 유지하되 모디파이어만 Alt 로 옮겼다 — 전 브라우저에서 가로챌 수 있고,
//   HTML accessKey 가 쓰는 관습 모디파이어라 "Alt 를 누르면 단축키가 보인다"도 자연스럽다.

import { STAGES } from '@/lib/constants'
import type { StageId } from '@/types'

export const STAGE_ACCESS_KEY: Record<StageId, string> = {
  producer: 'Q',
  writer: 'W',
  artist: 'E',
  director: 'R',
  editor: 'T',
}

/** 표시용 모디파이어 이름 — macOS 는 Option, 나머지는 Alt. */
export function accessModifierLabel(platform?: string): string {
  const p = platform ?? (typeof navigator === 'undefined' ? '' : navigator.platform)
  return /mac|iphone|ipad/i.test(p) ? 'Option' : 'Alt'
}

/**
 * KeyboardEvent.code → stage.
 * e.key 가 아니라 code 를 보는 이유: macOS 에서 Option+E 는 글자가 아니라 죽은 키(´)로,
 *   Option+Q 는 œ 로 도착한다 — e.key 검사는 거기서 전부 빗나간다. 물리 키 위치인 code 는 안 변한다.
 */
const STAGE_BY_CODE = new Map<string, StageId>(
  STAGES.map((s) => [`Key${STAGE_ACCESS_KEY[s.id as StageId]}`, s.id as StageId]),
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
