'use client'

// 채팅 발화 언어 (#i18n-content-voice 2026-08-23 오너 지시) — 챗 스트림에 실리는 시스템 발화
//   (웰컴·핸드오프 넛지·게이트 라벨·제안 카드·완료 알림)는 UI 언어가 아니라 **프로젝트 콘텐츠
//   언어(projects.locale)** 를 따른다. 챗 응답은 서버가 이미 프로젝트 locale 로 강제하는데
//   (responseLanguageDirective), 클라이언트 발화만 UI 언어면 같은 대화창 안에서 언어가 섞였다.
//
//   폴백: projectLocale 이 아직 안 실렸으면(전환 직후 1쿼리 사이·조회 실패) UI 언어 — 종전 동작.
//   UI 크롬(보드·버튼·배너)은 계속 useT()/UI 언어를 쓴다. 이 모듈은 i18n/index 와 분리 —
//   index 는 store 무의존 코어(locale-store 만), 여기는 project-store 를 읽는다.

import { useLocaleStore } from '@/stores/locale-store'
import { useProjectStore } from '@/stores/project-store'
import { pickContentLocale, type AppLocale } from '@/lib/locale'

/**
 * 순수: 표시할 콘텐츠 언어(#chat-locale-follow v2, 2026-09-08 오너 결정 "웹페이지 언어 상속받아서 표시").
 *   잠긴 프로젝트(명시·채팅·스토리 감지로 확정)는 그 언어, 안 잠긴 프로젝트는 웹페이지(UI) 언어를 물려받는다.
 *   잠김을 아직 모르면(null) 종전대로 프로젝트 언어.
 */
export { pickContentLocale } from '@/lib/locale'

/** store 액션·비훅 컨텍스트용 — 호출 시점의 콘텐츠 언어. */
export function contentLocale(): AppLocale {
  const p = useProjectStore.getState()
  return pickContentLocale({ projectLocale: p.projectLocale, locked: p.projectLocaleLocked, uiLocale: useLocaleStore.getState().locale })
}

/** 컴포넌트용 — 구독형. translate(useContentLocale(), …) 로 쓴다. */
export function useContentLocale(): AppLocale {
  const project = useProjectStore((s) => s.projectLocale)
  const locked = useProjectStore((s) => s.projectLocaleLocked)
  const ui = useLocaleStore((s) => s.locale)
  return pickContentLocale({ projectLocale: project, locked, uiLocale: ui })
}
