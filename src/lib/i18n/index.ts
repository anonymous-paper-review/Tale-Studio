// UI 크롬 번역 훅 (#i18n-s5) — 사용법: const t = useT(); t('Create scene').
//   키 = 영어 원문(코드가 base), ko 는 messages-ko 사전 매핑, 누락은 영어 폴백.
//   유저 콘텐츠·파이프라인 산출물은 여기를 타지 않는다(프로젝트 locale 이 지배).
//
// ⚠️ 'use client' 를 다시 달지 마라 (#rsc-translate 2026-08-24 실사고): 이 index 는
//   라우트가 도달하는 공용 lib(card-mention 등 20곳)의 translate 공급원이다. 지시자가 있으면
//   재수출 translate 가 서버 번들에서 클라이언트 참조 프록시가 되고, 캐스트 카드가 생긴
//   producer 2턴부터 castMentions→translate() 호출이 "Attempted to call translate() from the
//   server" 로 전사했다(웹툰 테스트 실측). 훅은 지시자 없이도 클라 컴포넌트에서 정상 동작하고,
//   서버가 훅을 부르면 어차피 그 자리에서 죽는다 — 경계 지시자는 컴포넌트 파일의 몫이다.
import { useCallback } from 'react'
import { useLocaleStore } from '@/stores/locale-store'
import type { AppLocale } from '@/lib/locale'
import { translate } from './translate'

// 순수 코어는 ./translate — 서버 라우트가 직접 쓸 때는 그쪽을 import.
export { translate }

// useCallback 필수 (#editor-render-loop 2026-08-24 실사고): 렌더마다 새 함수를 돌려주면
//   이 t 를 훅 deps 에 넣은 곳이 매 렌더 재실행된다. editor 의 마운트 로드 effect 가 그렇게 걸려
//   loadData() → store set() → 리렌더 → effect 재실행 루프로 React #185(Maximum update depth)를
//   프로덕션에서 4건 던졌다. locale 은 원시값이라 이 참조는 언어를 바꿀 때만 갱신된다.
export function useT(): (text: string, params?: Record<string, string | number>) => string {
  const locale = useLocaleStore((s) => s.locale)
  return useCallback(
    (text: string, params?: Record<string, string | number>) => translate(locale, text, params),
    [locale],
  )
}

export function useLocale(): AppLocale {
  return useLocaleStore((s) => s.locale)
}
