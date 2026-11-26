// 단계를 옮기거나 프로젝트를 여는 동안 단계 화면이 내용 대신 Editor 와 같은 기다리는 카드를 보이는지, 그 카드가 잠금이 아닌지 검사한다 (오너 2026-11-26 m1126 G1)
import { existsSync, readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/i18n', async () => {
  const { translate } = await import('@/lib/i18n/translate')
  return { translate, useT: () => (text: string, params?: Record<string, string | number>) => translate('ko', text, params) }
})

import { StageWaitCard } from '@/components/feedback/stage-wait'
import { STAGE_WAIT_TITLE, artistRead, settleRead, stageWaitPersona, stageWaiting, storyboardRead, type StageWaitScreen } from '@/lib/stage-wait'
import { STAGE_PERSONA } from '@/lib/lumi'
import { translate } from '@/lib/i18n/translate'
import { STAGES } from '@/lib/constants'

const read = (file: string) => readFileSync(file, 'utf8')
const card = (stage: StageWaitScreen) => renderToStaticMarkup(createElement(StageWaitCard, { stage }))
/** 카드가 덮는 화면 — 단계 표(STAGES)와, 단계 등록이 합쳐지기 전의 Writer 콘티 화면(O1). 합친 뒤에는 STAGES 에 들어 있어 겹치지 않는다. */
const SCREENS: StageWaitScreen[] = [...new Set<StageWaitScreen>([...STAGES.map(({ id }) => id), 'conti'])]

describe('언제 기다리는 카드를 보이나', () => {
  // 왜: 프로젝트 목록에서 프로젝트를 열거나 바꾸는 동안(projectId 가 비어 있음)과, 레일로 옮겨 온 단계가 아직 자기 자료를 다 읽기 전이다.
  //   그동안 단계 화면은 "아직 산문이 없어요" · "아직 생성된 씬·샷이 없어요" 같은 틀린 안내를 먼저 보였다(2026-11-26 실측).
  it('프로젝트를 여는 중이거나 그 단계가 지금 프로젝트를 아직 다 읽지 못했으면 단계 화면은 내용 대신 기다리는 카드를 보인다', () => {
    expect(stageWaiting({ projectId: null, initLoading: true, read: true })).toBe(true)
    expect(stageWaiting({ projectId: null, initLoading: false, read: false })).toBe(true)
    expect(stageWaiting({ projectId: 'p1', initLoading: true, read: true })).toBe(true)
    expect(stageWaiting({ projectId: 'p1', initLoading: false, read: false })).toBe(true)
    expect(stageWaiting({ projectId: 'p1', initLoading: false, read: true })).toBe(false)
  })

  // 왜: 정상 경로 고정 — 읽기가 끝났는데 정말 비어 있으면 왜 비었는지 알리는 지금 안내(Artist [완료하기] 안내 · 다시 시도)가 나와야 한다.
  //   읽기가 실패(네트워크 끊김)해도 기다림이 끝나야 한다 — 안 끝나면 카드에 갇힌다.
  it('다 읽은 뒤 정말 비어 있으면(읽기가 실패해도) 지금 빈 상태 안내 · 다시 시도를 그대로 보인다', async () => {
    await expect(settleRead(() => Promise.reject(new Error('network')))).resolves.toBeUndefined()
    await expect(settleRead(() => Promise.resolve({ ok: true }))).resolves.toBeUndefined()
    expect(artistRead({ hasAssets: false, firstRead: true, statusRead: true })).toBe(true)
    expect(storyboardRead({ hasShots: false, firstRead: true, statusRead: true })).toBe(true)
    expect(stageWaiting({ projectId: 'p1', initLoading: false, read: storyboardRead({ hasShots: false, firstRead: true, statusRead: true }) })).toBe(false)
    expect(read('src/hooks/use-first-read.ts')).toContain('settleRead(load)')
  })

  // 왜: 다른 단계가 이미 받아 둔 자료(1.5초 뒤 미리 받기 · 앞서 본 단계)가 있으면 카드를 띄울 까닭이 없다 — 바로 보이던 화면이 카드로 늦어지지 않게.
  it('이미 받아 둔 내용이 있으면(인물 · 배경이나 샷이 있음) 기다리는 카드 없이 바로 보인다', () => {
    expect(artistRead({ hasAssets: true, firstRead: false, statusRead: true })).toBe(true)
    expect(storyboardRead({ hasShots: true, firstRead: false, statusRead: false })).toBe(true)
    // 받아 둔 내용이 있으면 읽지 않고 바로 참이고, 그 뒤 비어도(마지막 샷을 지움) 다시 기다리지 않는다.
    expect(read('src/hooks/use-first-read.ts')).toContain('if (have && projectId && readFor !== projectId) setReadFor(projectId)')
  })
})

describe('기다리는 카드', () => {
  // 왜: 오너 2026-11-26 "탭 전환 시 로딩되기 전에 Editor의 탭처럼 로딩창 띄우기" — Editor 의 카드(그 단계 옷 Lumi · 제목 한 줄 · 설명 없음)와 같은 모양이다.
  //   설명을 비우지 않으면 카드가 "AI가 작업하는 동안은 화면과 채팅이 잠겨요" 잠금 안내를 붙인다 — 읽기는 AI 작업이 아니다.
  it('기다리는 카드는 그 단계 옷의 Lumi 와 무엇을 읽는지 한 줄 제목을 보이고, AI 잠금 안내는 붙이지 않는다', () => {
    for (const { id } of STAGES) {
      const html = card(id)
      expect(html, id).toContain(`/lumi/full/${STAGE_PERSONA[id]}-loading`)
      expect(html, id).toContain(`>${translate('ko', STAGE_WAIT_TITLE[id])}</h2>`)
      expect(html, id).not.toContain('AI가 작업하는 동안은 화면과 채팅이 잠겨요')
      expect(html, id).toContain('data-testid="stage-wait"')
    }
  })

  // 왜: Editor 와 같다 — 읽는 동안에도 레일로 다른 단계에 가거나 채팅을 쓸 수 있어야 한다. AI 잠금(덮개 · inert · 레일 붙잡기)을 쓰면 읽기가 느린 동안 갇힌다.
  it('기다리는 카드가 떠 있어도 화면을 잠그지 않아 레일로 다른 단계에 갈 수 있다', () => {
    const html = card('writer')
    expect(html).not.toContain('ai-busy-overlay')
    // 주석을 뺀 코드에 잠금 장치(덮개 · 레일 붙잡기 · inert)가 없다.
    const code = read('src/components/feedback/stage-wait.tsx').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(code).not.toMatch(/AiBusyOverlay|holdAiBusy|useAiBusyHold|\binert\b/)
  })

  // 왜: m-qa 통합 확인(2026-11-27) — 새로 열 때 첫 0.1~0.2초 기다리는 카드 글이 영어("Loading the prose…")였다. 서버는 그 사람 화면 언어를 모른다
  //   (언어는 브라우저 저장소 · 계정에만 있다) — 앱이 붙기 전 첫 그림에서는 제목 줄 자리만 두고 글은 보이지 않게, 붙은 뒤 그 사람 언어로 보인다.
  it('새로 열 때 앱이 붙기 전 첫 그림에서는 기다리는 카드 제목을 보이지 않고 Lumi 만 보인다', () => {
    // 정적 그림 = 서버 · 하이드레이션 첫 그림. 제목 줄은 자리만 지킨다(보이지 않음) — 붙은 뒤 카드가 흔들리지 않게.
    const html = card('producer')
    expect(html).toMatch(/<div[^>]*class="[^"]*\[&amp;_h2\]:invisible[^"]*"[^>]*data-testid="stage-wait"/)
    expect(html).toContain('/lumi/full/writer-loading')
    // 붙은 뒤(브라우저)에는 보인다 — 서버 · 하이드레이션 첫 그림만 false 인 값으로 가린다.
    const source = read('src/components/feedback/stage-wait.tsx')
    expect(source).toMatch(/const inBrowser = useSyncExternalStore\(subscribeNothing, \(\) => true, \(\) => false\)/)
    expect(source).toMatch(/!inBrowser && '\[&_h2\]:invisible'/)
  })

  // 왜: 오너 O1(2026-11-26 "콘티를 Artist 앞에") — 산문 확정 뒤 · Artist 앞에 Writer 칸 안 콘티 화면(/studio/conti)이 생긴다.
  //   리드 지시: 단계 등록이 합쳐지기 전에도 그 경로의 기다리는 카드는 Writer 옷으로 미리 둔다(레일에서 Writer 칸에 묶인다).
  it('콘티 화면을 여는 동안에도 Writer 옷 기다리는 카드에 "콘티를 불러오는 중…"을 보인다', () => {
    const html = card('conti')
    expect(html).toContain('/lumi/full/writer-loading')
    expect(html).toContain('>콘티를 불러오는 중…</h2>')
    expect(stageWaitPersona('conti')).toBe('writer')
    expect(read('src/app/studio/conti/loading.tsx')).toContain('<StageWaitCard stage="conti" />')
  })

  // 왜: generic "불러오는 중…" 대신 무엇을 읽는지 동사로 말한다(design §16.2). Editor 는 오너가 본보기로 든 예전 글 그대로다.
  it('기다리는 카드 제목은 단계마다 무엇을 불러오는지 말하고 Editor 는 예전 그대로 "클립 준비 중…"이다', () => {
    expect(Object.fromEntries(SCREENS.map((id) => [id, translate('ko', STAGE_WAIT_TITLE[id])]))).toEqual({
      entry: '시작 화면을 불러오는 중…',
      producer: '산문을 불러오는 중…',
      conti: '콘티를 불러오는 중…',
      artist: '인물 · 배경을 불러오는 중…',
      writer: '스토리보드를 불러오는 중…',
      director: '샷을 불러오는 중…',
      editor: '클립 준비 중…',
    })
  })
})

describe('레일을 누른 순간', () => {
  // 왜: 개발 서버에서 Storyboard → Director 는 누른 뒤 0.6~1.8초 동안 옛 화면이 멈춰 있었다(2026-11-26 실측). 운영도 첫 클릭 · 느린 연결이면 화면 코드가 늦게 온다.
  it('레일을 누른 순간 단계 화면 코드가 오기 전에도 그 단계의 기다리는 카드를 보인다', () => {
    for (const { id, path } of STAGES) {
      const file = `src/app${path}/loading.tsx`
      expect(existsSync(file), file).toBe(true)
      expect(read(file), file).toContain(`<StageWaitCard stage="${id}" />`)
    }
    // Producer 시작 화면은 위 막대를 스스로 그린다 — 기다리는 동안에도 같은 막대를 둬 카드가 내려앉지 않게.
    expect(read('src/app/studio/start/loading.tsx')).toContain('<StudioTopBar stage="entry" />')
  })
})
