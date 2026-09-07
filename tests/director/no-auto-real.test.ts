// 사용자가 직접 요청할 때만 그림·영상을 만들고, 보고 있던 화면을 빼앗지 않는다 (#c5, #c4, 2026-08-27 오너 지시)
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

// #c5 (2026-08-27 오너 지시) — Director 진입만으로 실사 i2i 가 발사되던 로직 제거.
//   "previz 를 손볼 틈도 없이 과금이 먼저 난다"가 이유였다. 실사 생성은 사람의 명시적
//   행동 셋 중 하나로만 시작한다: 전체 버튼 / 개별 버튼 / 채팅.
// #c4 (같은 날) — Node 뷰에서 생성 버튼을 누르면 화면이 Storyboard 로 튀던 것 제거.
//
// 되돌아가기 쉬운 종류의 수정이라(진입 훅 한 줄, set() 한 줄) 파일 수준으로 잠근다.

const page = readFileSync('src/app/studio/director/page.tsx', 'utf8')
const syncHook = readFileSync('src/features/director/hooks/use-writer-director-sync.ts', 'utf8')
const batchClient = readFileSync('src/lib/director/real-batch-client.ts', 'utf8')
const store = readFileSync('src/stores/director-store.ts', 'utf8')
const globalChatStore = readFileSync('src/stores/global-chat-store.ts', 'utf8')
const chatRoute = readFileSync('src/app/api/director/chat/route.ts', 'utf8')

describe('C5 — 직접 시작하지 않으면 실사 그림을 만들지 않는다', () => {
  it('사용자가 직접 시작하지 않으면 그림을 자동으로 만들지 않는다', () => {
    // 함수가 살아 있으면 누군가 다시 부를 수 있다 — 정의 자체를 없앤 상태를 잠근다.
    expect(batchClient).not.toContain('export function triggerRealBatchAutofill')
    expect(page).not.toContain('triggerRealBatchAutofill')
    expect(syncHook).not.toContain('triggerRealBatchAutofill')
  })

  it('화면에 들어갈 때 그림을 자동으로 채우지 않는다', () => {
    // Pass 2.7 자리는 주석으로 남기되 호출은 없어야 한다(왜 껐는지 다음 사람이 알게).
    expect(syncHook).toContain('Pass 2.7')
    expect(syncHook).not.toMatch(/if \(projectId\) triggerRealBatchAutofill\(projectId\)/)
  })

  it('전체 만들기 버튼을 누르면 모든 그림을 한꺼번에 만들 수 있다', () => {
    expect(batchClient).toContain('export async function runRealBatch')
    expect(page).toContain('runRealBatch')
  })
})

describe('C5 — 채팅으로 요청하면 실사 그림을 만들 수 있다', () => {
  it('채팅에서 그림 만들기 요청을 선택할 수 있다', () => {
    expect(chatRoute).toContain("'generateImage'")
    // 모델이 쓸 수 있도록 프롬프트에도 문서화돼야 한다 — 허용 목록만 열면 모델은 못 쓴다.
    expect(chatRoute).toContain('"type":"generateImage"')
  })

  it('대상을 지정하면 해당 그림만, 지정하지 않으면 남은 그림을 모두 만든다', () => {
    expect(chatRoute).toMatch(/asString\(rec\.id\)\s*\?\s*\{ type: 'generateImage', id: rec\.id \}\s*:\s*\{ type: 'generateImage' \}/)
    expect(store).toContain("case 'generateImage'")
    expect(store).toContain('generateStoryboardImage(imgId)')
    expect(store).toContain("import('@/lib/director/real-batch-client')")
  })

  it('그림 대상이 아니면 작업하지 않는다', () => {
    expect(store).toContain('generateImage target must be Shot node')
  })

  it('채팅으로 그림 만들기를 요청하면 먼저 확인 카드를 보여준다', () => {
    expect(globalChatStore).toContain("update.type === 'generateImage'")
    expect(globalChatStore).toContain("kind: 'directorGenerateStoryboardImage'")
    expect(globalChatStore).toContain('payload: { updates: imageUpdates }')
    expect(globalChatStore).toContain('.applyUpdates(immediateUpdates, {')
  })

  it('사용자가 그림 생성을 분명히 요청할 때만 그림 만들기를 시작한다', () => {
    expect(chatRoute).toContain('<hybrid_intent_rule>')
    expect(chatRoute).toContain('Never infer or append generateImage.')
    expect(chatRoute).toContain('only when the user explicitly asks to generate or regenerate an image.')
    expect(chatRoute).toContain('client presents an approval card before it runs.')
  })
})

describe('#영상거짓수락 — 채팅에서 영상 생성 요청을 거짓 수락하지 않는다', () => {
  it('채팅의 영상 만들기는 전체 장면에 대해서만 허용한다고 안내한다', () => {
    expect(chatRoute).toContain('<video_request_rule>')
    expect(chatRoute).toContain('do NOT emit generateVideo and do NOT emit addVideoTake')
    // 약속 E3(2026-09-04): 일괄(generateVideos)은 승인 카드로 허용, 샷 하나는 여전히 불가.
    expect(chatRoute).toContain('chat only starts the whole batch')
  })

  it('한 장면 영상 만들기를 거절하면 그 이유를 사용자에게 솔직히 알린다', () => {
    expect(globalChatStore).toContain("result.skipped.some((s) => s.update.type === 'generateVideo')")
    expect(globalChatStore).toContain('Chat can start videos only for all remaining shots at once.')
    expect(globalChatStore).toContain('saveChatMessage(projectId, stage, \'model\', honestNotice)')
  })
})

describe('C4 — 생성 버튼이 보고 있던 화면을 빼앗지 않는다', () => {
  it('그림 만들기를 눌러도 보고 있던 화면을 바꾸지 않는다', () => {
    // 이 한 줄이 Node 뷰에서 누른 사람을 Storyboard 로 튕겨보내던 원인이다.
    expect(store).not.toContain("viewMode: 'storyboard', storyboardMediaMode: 'real'")
    expect(store).not.toMatch(/set\(\{ viewMode: 'storyboard'/)
  })

  it('스토리보드 화면에서 그림을 만들 때만 실사 보기로 맞춘다', () => {
    const guarded = store.match(/if \(get\(\)\.viewMode === 'storyboard'\) set\(\{ storyboardMediaMode: 'real' \}\)/g)
    // 이미지 생성·영상 생성 두 지점 모두
    expect(guarded?.length).toBe(2)
  })
})

describe('Director 채팅 — 영상의 시작·끝·참조 그림 연결을 안내한다', () => {
  it('영상의 시작·끝·참조 그림을 연결하는 방법을 안내하고 허용한다', () => {
    expect(chatRoute).toContain('"type":"connectFrame"')
    expect(chatRoute).toContain("'connectFrame'")
    expect(chatRoute).toContain("'frame-start'")
    expect(chatRoute).toContain("'frame-end'")
    expect(chatRoute).toContain("'frame-ref'")
    expect(chatRoute).toContain('VALID_FRAME_TARGET_HANDLES')
  })

  it('영상 연결 요청은 기존 연결 규칙으로 적용한다', () => {
    expect(store).toContain("case 'connectFrame'")
    expect(store).toContain('wireFrameToVideo')
  })
})

describe('Director 채팅 — 장면에 참고 그림을 연결한다', () => {
  it('장면에 참고 그림을 연결하는 방법을 안내하고 허용한다', () => {
    expect(chatRoute).toContain('"type":"connectImage"')
    expect(chatRoute).toContain("'connectImage'")
    expect(chatRoute).toContain("'image-reference'")
    expect(chatRoute).toContain('VALID_IMAGE_TARGET_HANDLES')
  })

  it('참고 그림 연결 요청은 기존 연결 규칙으로 적용한다', () => {
    expect(store).toContain("case 'connectImage'")
    expect(store).toContain('wireImageToShot')
  })
})
