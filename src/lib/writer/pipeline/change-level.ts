// 바꿈 정도 지시(리뉴얼 1차 2026-10-19, 프로토타입 E3 "AI 바꿈 정도"). Producer 시작 화면에서 고른 정도를
//   산문을 쓰는 단계(이야기 엔진 · 구조 · 씬)의 지시에 싣는다. 프롬프트 문장이라 파이프라인 폴더에 둔다.
//   그대로(keep)는 대본 보존(preserveScript)이 따로 맡아 지시를 더하지 않는다. 없으면(예전 실행) 지시가 그대로다.
import type { PipelineInput } from '@/lib/writer/types/pipeline'

const NOTE = {
  polish:
    '[AI 바꿈 정도 · 다듬기]\n원래 아이디어의 소재 · 인물 · 사건 흐름 · 결말을 지킨다. 문장 · 대사 · 씬 순서는 영상에 맞게 다듬어도 된다.',
  grow:
    '[AI 바꿈 정도 · 새롭게 키우기]\n소재 · 장르와 분위기 · 길이는 지키고, 사건 · 인물 · 결말은 새 아이디어로 키워도 된다. 원래 아이디어를 그대로 옮기는 데 그치지 않는다.',
} as const

export function changeLevelBlock(input: Pick<PipelineInput, 'changeLevel'>): string {
  const level = input.changeLevel
  return level === 'polish' || level === 'grow' ? `${NOTE[level]}\n\n` : ''
}
