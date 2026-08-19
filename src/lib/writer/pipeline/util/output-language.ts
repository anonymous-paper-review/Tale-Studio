// #i18n-s5 출력 언어 강제 (2026-08-18 오너 지시) — 콘텐츠 스테이지 공용 절.
//   지금까지 산출 언어는 "스토리와 같은 언어" 관례(입력 추종)였다. 이제 projects.locale(생성 시
//   사용자 설정으로 잠금)이 지배한다: 한국어 스토리 입력이라도 설정이 en 이면 산출은 영어.
//   미지정(undefined, 레거시 프로젝트)이면 빈 문자열 — 종전 동작 완전 보존.
//   생성기행 영어 강제 필드(v4/v5 프롬프트 등)는 각 스테이지의 기존 규칙이 그대로 우선한다.
import type { AppLocale } from '@/lib/locale';

const LANGUAGE_NAME: Record<AppLocale, string> = { en: '영어(English)', ko: '한국어' };

/** 콘텐츠 스테이지 systemInstruction 끝에 덧붙이는 출력 언어 계약. 미지정은 빈 문자열. */
export function outputLanguageClause(locale: AppLocale | undefined): string {
  if (!locale) return '';
  const lang = LANGUAGE_NAME[locale];
  return `

[출력 언어 — 강제]
화면에 노출되는 모든 자유서술 텍스트 필드(이름·표시명·설명·요약·씬/샷 서술·대사·질문 등)는 스토리 입력의 언어와 무관하게 예외 없이 ${lang}로 작성한다. 슬러그/id 는 규칙대로 snake_case 를 유지한다. 스키마나 다른 규칙이 특정 필드에 영어를 명시적으로 요구하면(생성기용 프롬프트 등) 그 규칙이 우선한다.`;
}

/** 대사 분량 산정용 발화 속도 기준 — dialogue 스테이지 전용 (#i18n-s5 en 분기). */
export function speechRateGuide(locale: AppLocale | undefined): string {
  return locale === 'en'
    ? '영어 발화 속도 초당 2~3단어(≈150 wpm) 기준'
    : '한국어 발화 속도 초당 4~6음절 기준';
}
