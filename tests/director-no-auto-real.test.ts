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
const chatRoute = readFileSync('src/app/api/director/chat/route.ts', 'utf8')

describe('C5 — Director 진입이 실사 생성을 발사하지 않는다', () => {
  it('자동 채움 함수가 코드베이스에 남아 있지 않다', () => {
    // 함수가 살아 있으면 누군가 다시 부를 수 있다 — 정의 자체를 없앤 상태를 잠근다.
    expect(batchClient).not.toContain('export function triggerRealBatchAutofill')
    expect(page).not.toContain('triggerRealBatchAutofill')
    expect(syncHook).not.toContain('triggerRealBatchAutofill')
  })

  it('sync 훅 Pass 2.7 의 자율 채움 호출이 없다', () => {
    // Pass 2.7 자리는 주석으로 남기되 호출은 없어야 한다(왜 껐는지 다음 사람이 알게).
    expect(syncHook).toContain('Pass 2.7')
    expect(syncHook).not.toMatch(/if \(projectId\) triggerRealBatchAutofill\(projectId\)/)
  })

  it('수동 일괄 경로(runRealBatch)는 살아 있다 — 전체 버튼이 쓰는 길', () => {
    expect(batchClient).toContain('export async function runRealBatch')
    expect(page).toContain('runRealBatch')
  })
})

describe('C5 — 채팅으로도 실사 생성이 가능하다', () => {
  it('채팅 액션 목록에 generateImage 가 있다', () => {
    expect(chatRoute).toContain("'generateImage'")
    // 모델이 쓸 수 있도록 프롬프트에도 문서화돼야 한다 — 허용 목록만 열면 모델은 못 쓴다.
    expect(chatRoute).toContain('"type":"generateImage"')
  })

  it('id 가 있으면 개별 샷, 없으면 전체 일괄로 갈린다', () => {
    expect(chatRoute).toMatch(/asString\(rec\.id\)\s*\?\s*\{ type: 'generateImage', id: rec\.id \}\s*:\s*\{ type: 'generateImage' \}/)
    expect(store).toContain("case 'generateImage'")
    expect(store).toContain('generateStoryboardImage(imgId)')
    expect(store).toContain("import('@/lib/director/real-batch-client')")
  })

  it('Shot 노드가 아니면 건너뛴다', () => {
    expect(store).toContain('generateImage target must be Shot node')
  })
})

describe('C4 — 생성 버튼이 보고 있던 화면을 뺏지 않는다', () => {
  it('생성 액션이 viewMode 를 강제로 바꾸지 않는다', () => {
    // 이 한 줄이 Node 뷰에서 누른 사람을 Storyboard 로 튕겨보내던 원인이다.
    expect(store).not.toContain("viewMode: 'storyboard', storyboardMediaMode: 'real'")
    expect(store).not.toMatch(/set\(\{ viewMode: 'storyboard'/)
  })

  it('스토리보드 뷰에 있을 때만 실사 모드로 맞춘다', () => {
    const guarded = store.match(/if \(get\(\)\.viewMode === 'storyboard'\) set\(\{ storyboardMediaMode: 'real' \}\)/g)
    // 이미지 생성·영상 생성 두 지점 모두
    expect(guarded?.length).toBe(2)
  })
})
