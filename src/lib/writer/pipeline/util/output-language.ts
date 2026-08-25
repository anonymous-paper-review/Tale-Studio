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

// ── 대사(발화) 언어 (#dialogue-language 2026-08-25 오너 보고) ─────────────────
// 프로듀서의 Dialogue Language 설정(게이트 필수 항목)은 지금까지 파이프라인에 전달되지 않는
// 죽은 설정이었다 — 대사도 outputLocale(콘텐츠 언어)을 따라가, en 프로젝트에서 ko 대사 설정이
// 무시됐다(실측). 대사는 "인물이 말하는 언어"라는 별도 축: 출력 언어(트리트먼트 산문)와
// 독립적으로 ko/en/ja/zh 를 가진다. 미지정(레거시)이면 종전대로 출력 언어 추종.

export type DialogueLanguage = 'ko' | 'en' | 'ja' | 'zh';

const DIALOGUE_LANGUAGE_NAME: Record<DialogueLanguage, string> = {
  ko: '한국어',
  en: '영어(English)',
  ja: '일본어(日本語)',
  zh: '중국어(中文)',
};

export function parseDialogueLanguage(value: unknown): DialogueLanguage | undefined {
  return value === 'ko' || value === 'en' || value === 'ja' || value === 'zh' ? value : undefined;
}

/** 발화 텍스트(line·narration)의 언어 계약 — outputLanguageClause **뒤에** 붙여 대사만 덮어쓴다. */
export function dialogueLanguageClause(lang: DialogueLanguage | undefined): string {
  if (!lang) return '';
  const name = DIALOGUE_LANGUAGE_NAME[lang];
  return `

[대사 언어 — 설정 우선]
인물이 입으로 말하는 텍스트(dialogue[].line, narration 보이스오버, 말버릇 예시 문장)는 위의 출력 언어 규칙과 무관하게 예외 없이 ${name}로 쓴다 — 프로듀서의 대사 언어 설정이다. 지문(delivery)·화자명 등 나머지 필드는 출력 언어 규칙을 그대로 따른다.`;
}

/** 발화 속도 기준 — 설정된 대사 언어가 있으면 그 언어 기준, 없으면 출력 언어 기준(종전). */
export function speechRateGuideForDialogue(
  lang: DialogueLanguage | undefined,
  outputLocale: AppLocale | undefined,
): string {
  if (lang === 'ja') return '일본어 발화 속도 초당 7~8모라 기준';
  if (lang === 'zh') return '중국어 발화 속도 초당 4~5자 기준';
  if (lang === 'ko' || lang === 'en') return speechRateGuide(lang);
  return speechRateGuide(outputLocale);
}
