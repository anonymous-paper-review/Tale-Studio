// 약속 M — 완드 요청에는 어느 카드인지 이름이 붙는다 (_tdd.md M, 2026-09-04 오너 확정)
//
//   오너 결정: M1 = 2안(보내지 않고 입력창에 "@카드이름 "만 넣고 커서를 그 뒤에 둔다 + 회색 안내 "이 카드 채워줘"),
//   별도 결정 = Artist·Director·Editor 에는 완드를 새로 만들지 않는다. 문장 하나 = 테스트 하나.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { backgroundMentions, castMentions } from '@/lib/card-mention'
import { useChatUiStore } from '@/stores/chat-ui-store'

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

describe('약속 M — 완드에 @ 붙이기', () => {
  it('인물·배경 카드의 완드를 누르면 보내지 않고 입력창에 "@카드이름 "만 들어가고 커서가 그 뒤에 놓인다', () => {
    // 완드 → compose 요청(보내기 없음).
    const board = read('src/features/producer/readiness-board.tsx')
    expect(board.match(/requestMentionCompose\(mentionLabel, t\('Fill in this card'\)\)/g)?.length).toBe(2)
    expect(board).not.toMatch(/castDraftPrompt|backgroundDraftPrompt/)
    // 스토어 요청의 모양.
    useChatUiStore.getState().requestMentionCompose('겨울 산맥', '이 카드 채워줘')
    expect(useChatUiStore.getState().mentionInsert).toMatchObject({ label: '겨울 산맥', mode: 'compose', hint: '이 카드 채워줘' })
    // 채팅이 입력창을 "@라벨 " 로 바꾸고 커서를 끝에 둔다. 회색 안내는 그 상태에서만 보인다.
    const chat = read('src/components/layout/global-chat.tsx')
    expect(chat).toMatch(/if \(mentionInsert\.mode === 'compose'\) \{\s*const composed = `\$\{token\} `\s*setInput\(composed\)/)
    expect(chat).toMatch(/el\.setSelectionRange\(composed\.length, composed\.length\)/)
    expect(chat).toMatch(/ghost=\{composeHint && input === composeHint\.token && composeHint\.hint \? composeHint\.hint : undefined\}/)
    expect(read('src/components/layout/mention-textarea.tsx')).toMatch(/data-testid="mention-ghost"/)
    expect(read('src/lib/i18n/messages-ko.ts')).toMatch(/'Fill in this card': '이 카드 채워줘'/)
  })

  it('이름이 아직 없는 카드의 완드를 눌러도 AI가 어느 카드인지 알고 그 카드를 채운다', () => {
    // 이름 없는 카드도 고정 라벨(이름 미정 인물 / 이름 미정 인물 2 / 이름 미정 배경)을 받아 @멘션이 가능하고,
    //   서버는 같은 라벨 목록으로 카드 ref 를 찾는다.
    const cast = castMentions([
      { localId: 'p1', name: '', entityType: 'person' },
      { localId: 'p2', name: '', entityType: 'person' },
      { localId: 'p3', name: '지아', entityType: 'person' },
    ] as Parameters<typeof castMentions>[0])
    expect(cast.map((m) => m.label)).toEqual(['이름 미정 인물', '이름 미정 인물 2', '지아'])
    expect(cast.map((m) => m.ref)).toEqual(['p1', 'p2', 'p3'])
    const bgs = backgroundMentions([{ localId: 'b1', name: '' }, { localId: 'b2', name: '' }] as Parameters<typeof backgroundMentions>[0])
    expect(bgs.map((m) => m.label)).toEqual(['이름 미정 배경', '이름 미정 배경 2'])
    // 보드는 같은 라벨을 완드에 쓴다(castMentionList/bgMentionList → mentionLabel).
    const board = read('src/features/producer/readiness-board.tsx')
    expect(board).toMatch(/mentionLabel=\{castMentionList\[i\]\?\.label \?\? member\.name\}/)
    expect(board).toMatch(/mentionLabel=\{bgMentionList\[i\]\?\.label \?\? background\.name\}/)
    const route = read('src/app/api/produce/chat/route.ts')
    expect(route).toMatch(/const m = castMentions\(castList\)/)
    expect(route).toMatch(/mention: `@\$\{m\[i\]\.label\}`/)
  })

  it('Artist·Director·Editor 카드에는 완드를 새로 만들지 않는다(별도 결정 1안)', () => {
    for (const rel of ['src/features/artist/character-panel.tsx', 'src/features/artist/world-panel.tsx', 'src/features/director/canvas-nodes/ShotNode.tsx', 'src/features/editor/video-previewer.tsx']) {
      expect(read(rel)).not.toMatch(/requestMentionCompose/)
    }
  })
})
