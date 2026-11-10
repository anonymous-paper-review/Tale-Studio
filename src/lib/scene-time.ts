// 장면 시간 꼬리표(리드 2026-11-10 R2): 장면 머리의 시간에서 이어짐 말(CONTINUOUS · LATER · MOMENTS LATER …)을 뺀다.
//   이어짐 말은 때(낮 · 밤)가 아니라 앞 씬과 이어진다는 표시라, 배경 카드의 시간 꼬리표와 배경 그림 지시의 시간으로 쓰지 않는다.
//   "NIGHT - CONTINUOUS"처럼 섞이면 때만 남기고, 이어짐 말이 없으면 글을 그대로 돌려준다.
//   약속: tests/artist/background-time-tag.test.ts
const CONTINUITY_RE = /^(?:continuous|continued|cont['’]?d|later|moments later|a moment later|same|same time|계속|이어서|잠시 후)$/i; // i18n-ok: 한국어 대본 장면 머리의 이어짐 말

export function sceneTimeTag(time: string | null | undefined): string {
  const text = (time ?? '').trim();
  const parts = text.split(/\s+[-\u2013\u2014/]+\s+|\s*,\s*/).map((part) => part.trim()).filter(Boolean);
  if (!parts.some((part) => CONTINUITY_RE.test(part))) return text;
  return parts.filter((part) => !CONTINUITY_RE.test(part)).join(' - ');
}
