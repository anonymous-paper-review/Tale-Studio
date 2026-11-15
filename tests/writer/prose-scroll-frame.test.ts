// Writer 화면에서 산문 · 채팅을 끝까지 스크롤해도 바깥 칸이 같이 밀리거나 출렁이지 않는다 — 바깥 칸은 화면 높이에 고정하고 산문 칸 · 채팅 칸만 각자 스크롤한다(오너 2026-11-16)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { stageFrameClass } from '@/lib/studio-frame'

const LAYOUT = 'src/app/studio/layout.tsx'
const WORKSPACE = 'src/features/prose/prose-workspace.tsx'
const CHAT = 'src/components/layout/global-chat.tsx'
const GLOBALS = 'src/app/globals.css'

describe('스튜디오 바깥 칸', () => {
  it('Writer 화면이면 바깥 칸은 화면 높이에 고정되고 스크롤하지 않는다', () => {
    // 왜: 오너 11/16 — Writer 에서 산문 · 채팅을 스크롤할 때 바깥 칸이 같이 밀려 칸이 잘려 보였다. 산문 칸 · 채팅 칸이 각자 스크롤하니 바깥 칸은 스크롤할 이유가 없다.
    //   Writer 의 단계 id 는 producer 다(화면 이름과 id 가 서로 바뀌어 있다 — design.md §2.9).
    const frame = stageFrameClass('producer')
    expect(frame).toContain('overflow-y-hidden')
    expect(frame).not.toContain('overflow-y-auto')
    expect(frame).toContain('h-dvh')
    // 레이아웃이 실제로 이 판정을 바깥 칸에 건다 — 판정만 있고 쓰이지 않는 것을 막는다.
    expect(readFileSync(LAYOUT, 'utf8')).toMatch(/data-stage-content\s+className=\{stageFrameClass\(shownStage\)\}/)
  })

  it('Writer 가 아닌 단계 화면의 바깥 칸은 지금처럼 스크롤을 허용한다', () => {
    // 왜: 정상 경로 고정 — 안쪽 칸 구조를 확인한 것은 Writer 뿐이다. 다른 단계 화면은 상태마다 내용 길이가 달라 바깥 칸이 마지막 안전망으로 남는다.
    for (const stage of ['entry', 'artist', 'writer', 'director', 'editor'] as const) {
      const frame = stageFrameClass(stage)
      expect(frame, stage).toContain('overflow-y-auto')
      expect(frame, stage).not.toContain('overflow-y-hidden')
      expect(frame, stage).toContain('h-dvh')
    }
  })

  it('바깥 칸과 본문 틀은 보이는 화면 높이(dvh)를 따른다', () => {
    // 왜: 태블릿 · 도구 막대가 줄었다 늘었다 하는 브라우저에서 100vh 는 보이는 화면보다 커서 문서 전체가 같이 밀린다 — 화면 높이에 고정한다는 말이 거기서도 맞게.
    //   본문(main) 최소 높이도 같이 바꾼다 — 한쪽만 vh 면 그쪽이 문서를 키운다.
    const layout = readFileSync(LAYOUT, 'utf8')
    expect(layout).not.toMatch(/\bh-screen\b|\bmin-h-screen\b/)
    expect(layout).toMatch(/className="min-h-dvh transition-\[margin\]/)
  })
})

describe('Writer 의 산문 칸과 채팅 칸', () => {
  it('산문 작업공간은 바깥으로 넘치지 않고 산문 칸이 스스로 스크롤한다', () => {
    // 왜: 바깥 칸이 스크롤을 못 하게 됐으니 산문이 자기 칸 안에서 스크롤하는 이 짝이 깨지면 긴 산문이 잘려 읽을 수 없다.
    const workspace = readFileSync(WORKSPACE, 'utf8')
    expect(workspace).toMatch(/<div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-testid="prose-workspace">/)
    expect(workspace).toMatch(/<div className="min-h-0 flex-1 overflow-y-auto[^"]*" data-ai-busy-scroll>/)
  })

  it('산문 칸이 끝에 닿은 뒤 더 밀어도 그 움직임이 바깥으로 넘어가지 않는다', () => {
    // 왜: 맥(트랙패드)에서 산문 끝에서 더 밀면 움직임이 바깥 칸 · 문서로 넘어가 화면 전체가 출렁이며 칸이 잘려 보일 수 있다.
    expect(readFileSync(WORKSPACE, 'utf8')).toMatch(/<div className="min-h-0 flex-1 overflow-y-auto[^"]*overscroll-y-contain[^"]*" data-ai-busy-scroll>/)
  })

  it('채팅 칸이 끝에 닿은 뒤 더 밀어도 그 움직임이 바깥으로 넘어가지 않는다', () => {
    // 왜: 채팅은 모든 단계가 같이 쓰는 오른쪽 패널이다 — 채팅 끝에서 더 밀면 같은 까닭으로 화면 전체가 출렁일 수 있다.
    //   스크롤하는 것은 뿌리가 아니라 안쪽 viewport 라 뿌리 class 의 변형으로 viewport 에만 건다 — viewportProps 식은 투명 덮개 시험(tests/project/busy-overlay-clear.test.ts)이 글자 그대로 못 박았다.
    expect(readFileSync(CHAT, 'utf8')).toMatch(/<ScrollArea className="min-h-0 flex-1[^"]*\[&_\[data-slot=scroll-area-viewport\]\]:overscroll-y-contain[^"]*" viewportProps=\{\{ \[AI_BUSY_SCROLL_ATTR\]: '' \}\}>/)
  })
})

describe('스튜디오 문서', () => {
  it('스튜디오 화면에서는 문서가 위아래로 출렁이지 않는다', () => {
    // 왜: 위 막대 · 레일 위에서 시작한 밀기는 안쪽 칸이 받지 못해 문서로 간다. 스튜디오는 화면 높이에 고정한 틀이라 문서가 움직일 일이 없다.
    //   스튜디오 레이아웃만 <html> 에 달았다 지우는 data-stage 로 범위를 잡아 프로젝트 목록 · 랜딩의 문서 스크롤은 그대로 둔다. 좌우 밀기(뒤로 가기)는 막지 않는다.
    expect(readFileSync(GLOBALS, 'utf8')).toMatch(/html\[data-stage\]\s*\{[^}]*overscroll-behavior-y:\s*none/)
  })
})
