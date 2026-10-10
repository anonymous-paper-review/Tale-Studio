// 트리트먼트 다시 쓰기(2026-10-02 시안 v04) — 정도 · 방향별 모델 지시문. 프롬프트 문장이라 파이프라인 폴더에 둔다.
//   정도는 무엇을 지키고 무엇을 바꿀지, 방향(v1 · v2 · v3)은 세 안이 서로 다른 쪽으로 가게 한다.
import type { RewriteDirection, RewriteLevel } from '@/lib/producer/scene-story-rewrite'
import type { Scenes } from '@/lib/writer/types/pipeline'

const LEVEL_NOTE: Record<RewriteLevel, string> = {
  polish:
    '[다시 쓰기 · 조금만 다듬기] 사건 · 씬 순서 · 씬 수 · 인물 · 장소 · 대사 내용은 그대로 두고 문장만 다듬어라. 각 씬의 비트 수도 유지한다.',
  reword:
    '[다시 쓰기 · 표현을 새로] 이야기 흐름(사건 순서 · 씬 구성 · 인물 · 장소)은 지키고 문장을 새로 써라. 같은 사건을 다른 표현과 묘사로 보여 준다.',
  rethink:
    '[다시 쓰기 · 아이디어부터 다시] 처음 아이디어의 핵심만 남기고 사건 전개와 결말까지 새로 구상하라. 지금 초안과 확연히 다른 이야기여야 한다.',
}

const DIRECTION_NOTE: Record<RewriteDirection, string> = {
  tidy: '방향: 맞춤법 · 띄어쓰기 · 어색한 문장만 손본다. 분위기와 길이는 그대로 둔다.',
  warmer: '방향: 인물의 감정과 관계가 조금 더 따뜻하게 느껴지게 쓴다.',
  tense: '방향: 갈등과 긴장감이 더 살아나게 쓴다.',
  brisk: '방향: 군더더기를 덜어 짧고 빠르게 읽히게 쓴다.',
}

/** 씬 단계 수정 요청 칸에 들어가는 한 줄 묶음. */
export function rewriteNote(level: RewriteLevel, direction: RewriteDirection): string {
  return `${LEVEL_NOTE[level]}\n${DIRECTION_NOTE[direction]}`
}

/** 아이디어부터 다시 — 이야기 엔진 · 구조 단계는 수정 요청 칸이 없어 기획 글 뒤에 방향을 붙인다. 지금 초안은 피할 대상으로만 준다. */
export function rethinkStory(story: string, current: Scenes | undefined, direction: RewriteDirection): string {
  const summary = (current?.scenes ?? [])
    .map((scene, index) => `- S${index + 1}: ${(scene.scene_actions ?? []).join(' ').slice(0, 160)}`)
    .join('\n')
  return [
    story.trim(),
    '',
    LEVEL_NOTE.rethink,
    DIRECTION_NOTE[direction],
    ...(summary ? ['[지금 초안 — 이것과 사건 전개 · 결말이 겹치지 않게 한다]', summary] : []),
  ].join('\n')
}
