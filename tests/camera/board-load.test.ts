// 샷 정보를 다 읽기 전 · 읽다가 실패했을 때 Cinema 가 "아직 샷이 없어요" 대신 "샷을 불러오고 있어요" · "샷 정보를 불러오지 못했어요"+[다시 불러오기]를 보이고 만들기 단추를 끄는지 검사한다 (fb-blur QA 2026-11-23 · 리드)
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// 화면 말 — 서버 그리기는 스토어의 처음 값(영어)을 읽으므로 번역 훅을 직접 고른 말로 돌린다(scene-buttons 시험과 같은 방법).
const lang = vi.hoisted(() => ({ locale: 'ko' as 'ko' | 'en' }))
vi.mock('@/lib/i18n', async () => {
  const { translate } = await import('@/lib/i18n/translate')
  return { translate, useT: () => (text: string, params?: Record<string, string | number>) => translate(lang.locale, text, params) }
})

// 씬 수 세기 — DB 는 흉내만 낸다(읽은 길만 적는다).
const db = vi.hoisted(() => ({ count: 0 as number | null, error: null as { message: string } | null, reads: [] as string[] }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      const query: Record<string, unknown> = {}
      query.select = (columns: string, options?: { count?: string; head?: boolean }) => {
        db.reads.push(`${table}.select(${columns}) count=${options?.count} head=${options?.head}`)
        return query
      }
      query.eq = (column: string, value: unknown) => {
        db.reads.push(`${table}.${column}=${String(value)}`)
        return query
      }
      query.then = (resolve: (value: unknown) => unknown) => resolve({ data: null, count: db.count, error: db.error })
      return query
    },
  }),
}))

import { BoardLoadState } from '@/components/board-load-state'
import { boardLoadBlockText, cameraBoardView, writerProjectHasNoScenes } from '@/lib/director/board-load'
import { boardLoadStatusOf, forgetBoardLoad, markBoardLoad, retryBoardLoad, useBoardLoadStore } from '@/stores/board-load-store'

const src = (path: string) => readFileSync(path, 'utf8')
const SYNC = 'src/features/director/hooks/use-writer-director-sync.ts'
const BOARD = 'src/features/camera/camera-board.tsx'
const BAR = 'src/features/camera/work-bar.tsx'
const PIECE = 'src/components/board-load-state.tsx'
const render = (status: 'loading' | 'failed') => renderToStaticMarkup(createElement(BoardLoadState, { status, onRetry: () => {} }))
const retryBody = (sync: string) => {
  const start = sync.indexOf('function retryBoardNow(')
  return sync.slice(start, sync.indexOf('\n}\n', start))
}

beforeEach(() => {
  lang.locale = 'ko'
  db.count = 0
  db.error = null
  db.reads = []
  useBoardLoadStore.setState({ projectId: null, status: 'loading', retry: null })
})

describe('Cinema 판 읽기 — 같이 정한 것(리드 11/23)', () => {
  it('샷 정보를 읽다가 다시 시도까지 모두 실패하면 Cinema 는 "아직 샷이 없어요" 대신 "샷 정보를 불러오지 못했어요"와 [다시 불러오기]를 보인다', () => {
    // 왜: 샷 설정 읽기(/api/writer/shot-configs)만 실패해도 샷 12개 프로젝트에 "아직 샷이 없어요 · Writer에서 먼저 샷을 만들어 주세요"가 떠
    //   샷이 사라진 것처럼 보였다(fb-blur QA 11/23). "다시 시도까지" = 동기화 훅이 자동 다시 시도 몫을 다 쓴 때.
    expect(cameraBoardView({ status: 'failed', shotCount: 0, hasScene: false })).toBe('failed')
    const html = render('failed')
    expect(html).toContain('샷 정보를 불러오지 못했어요.')
    expect(html).toContain('샷은 그대로 있어요. 다시 불러와 주세요.')
    expect(html).toMatch(/<button[^>]*>[\s\S]*다시 불러오기[\s\S]*<\/button>/)
    expect(html).not.toContain('아직 샷이 없어요')
    lang.locale = 'en'
    const en = render('failed')
    expect(en).toContain('Could not load the shots.')
    expect(en).toContain('Your shots are still there. Try loading them again.')
    expect(en).toContain('Load again')
    // 판은 못 불러옴 · 불러오는 중이면 이 조각을 "아직 샷이 없어요"보다 먼저 세운다.
    const board = src(BOARD)
    expect(board).toMatch(/const view = cameraBoardView\(\{ status: load, shotCount, hasScene: !!scene \}\)/)
    expect(board.indexOf('<BoardLoadState')).toBeGreaterThan(-1)
    expect(board.indexOf('<BoardLoadState')).toBeLessThan(board.indexOf("t('No shots yet')"))
    // 동기화 훅: 자동 다시 시도 몫을 다 쓰면 못 불러옴과 [다시 불러오기]가 부를 일을 적는다.
    const sync = src(SYNC)
    const exhausted = sync.slice(sync.indexOf('retry budget exhausted'), sync.indexOf('retryAttemptsRef.current.set(retryProjectId'))
    expect(exhausted).toMatch(/markBoardLoad\(retryProjectId, 'failed', \(\) => retryBoardNow\(retryProjectId, \{/)
  })

  it('샷 정보를 불러오지 못한 동안 Cinema 위쪽 [이미지 만들기] · [영상 만들기]는 꺼지고 까닭 한 줄이 보인다', () => {
    // 왜: 읽지 못한 판은 샷이 0개(또는 그림 · Take 없는 샷)로 세어져 단추 숫자가 사실과 다르다. 다 읽기 전도 같다 —
    //   읽기 전 숫자로 [이미지 만들기 · 3]을 누르면 이미 그림이 있는 샷을 확인 없이 다시 그린다(QA B 11/23).
    expect(boardLoadBlockText('failed')).toBe('Could not load the shots.')
    expect(boardLoadBlockText('loading')).toBe('Loading the shots.')
    expect(boardLoadBlockText('ready')).toBeNull()
    const bar = src(BAR)
    expect(bar).toMatch(/const boardLoadLine = boardLoadBlockText\(useBoardLoadStatus\(boardProjectId\)\)/)
    expect(bar).toMatch(/disabled=\{imageBlock !== null \|\| boardOff\}/)
    expect(bar).toMatch(/disabled=\{videoBlock !== null \|\| boardOff\}/)
    // 까닭 줄은 읽기 상태가 먼저 — 그 밖은 지금처럼(Take 못 읽음 · 단추별 까닭).
    expect(bar).toMatch(/const blockLine = boardLoadLine \? t\(boardLoadLine\) : takesUnknown && takeState\.failed \? t\(TAKES_UNKNOWN_TEXT\) : workBlockLine\(imageBlock, videoBlock, t\)/)
    // 누르는 길도 막고(단추가 꺼지기 직전에 눌러도), 예상 칸 · 크림 [다음] 도 읽기 전 숫자로 서지 않는다.
    expect(bar).toMatch(/const runImages = async \(\) => \{\s*if \(boardOff\) return/)
    expect(bar).toMatch(/const runVideos = async \(\) => \{\s*if \(boardOff\) return/)
    expect(bar).toMatch(/canHandOff: !boardOff && !making && boardWorkLeft === 0/)
    expect(bar).toMatch(/\) : estimate && !boardOff \? \(/)
    // 꺼진 단추에는 읽기 전 판으로 센 숫자를 적지 않는다.
    expect(bar).toMatch(/\{!boardOff && \(\s*<>\s*<span aria-hidden className="opacity-60">·<\/span>\s*<span className="font-num tabular-nums">\{imageMode\.shotIds\.length\}<\/span>/)
    expect(bar).toMatch(/\{!boardOff && \(\s*<>\s*<span aria-hidden className="opacity-60">·<\/span>\s*<span className="font-num tabular-nums">\{videoWork\.length\}<\/span>/)
  })

  it('[다시 불러오기]를 누르면 샷 정보를 다시 읽고, 읽히면 샷 줄이 선다', () => {
    // 왜: 잠깐 끊긴 뒤 페이지를 새로 고치지 않고 이어 가게. 다시 읽기는 동기화 훅이 적어 둔 일을 부른다.
    let retried = 0
    markBoardLoad('p1', 'failed', () => { retried += 1 })
    retryBoardLoad()
    expect(retried).toBe(1)
    // 판의 [다시 불러오기]가 그 일을 부른다.
    expect(src(BOARD)).toMatch(/<BoardLoadState status=\{view\} onRetry=\{retryBoardLoad\} \/>/)
    expect(src(PIECE)).toMatch(/onClick=\{onRetry\}/)
    // 훅의 다시 읽기: 자동 다시 시도 몫을 새로 세고 · 불러오는 중으로 바꾸고 · 동기화를 다시 돌린다.
    const body = retryBody(src(SYNC))
    expect(body).toMatch(/retry\.attempts\.delete\(retryProjectId\)/)
    expect(body).toMatch(/markBoardLoad\(retryProjectId, 'loading'\)/)
    expect(body).toMatch(/retry\.rerun\(\)/)
    expect(src(SYNC)).toMatch(/attempts: retryAttemptsRef\.current,\s*rerun: \(\) => setRetryEpoch\(\(epoch\) => epoch \+ 1\),/)
    // 읽히면(그림 · Take 까지, 겹쳐 돈 다른 재수화도 끝난 뒤) 다 읽음 → 샷 줄.
    expect(src(SYNC)).toMatch(/videoTakeHydratedProjectIdRef\.current = projectId\s*retryAttemptsRef\.current\.delete\(projectId\)[\s\S]{0,400}?void directorHydrationsSettled\(\)\.then\(\(\) => \{\s*if \(mountedRef\.current && useDirectorCanvasStore\.getState\(\)\.projectId === projectId\) boardReady\(projectId\)/)
    markBoardLoad('p1', 'ready')
    expect(cameraBoardView({ status: boardLoadStatusOf(useBoardLoadStore.getState(), 'p1'), shotCount: 3, hasScene: true })).toBe('board')
  })
})

describe('Cinema 판 읽기 — 혼자 정한 것(되돌리기 쉬움)', () => {
  it('인물 · 배경, 샷 설정, 그림 · Take 중 하나라도 다시 시도까지 실패하거나 동기화가 코드 오류로 멈추면 같은 "불러오지 못했어요"가 된다', () => {
    // 왜: 셋 다 같은 길로 멈춘다 — 앞 둘은 판이 비고, 셋째는 그림 · Take 없는 줄이 서서 모두 "없음"처럼 보인다.
    //   코드 오류로 멈추면 다시 시도로 가지 않아 "불러오는 중"에 영영 머문다.
    const sync = src(SYNC)
    expect(sync).toMatch(/scheduleRetry\(assetProjectId, 'Director asset hydration'\)/)
    expect(sync).toMatch(/scheduleRetry\(cfgProjectId, 'shot config load'\)/)
    expect(sync).toMatch(/scheduleRetry\(projectId, 'video take hydration'\)/)
    expect(sync).toMatch(/\}\)\(\)\.catch\(\(error\) => \{[\s\S]*?scheduleRetry\(syncProjectId, 'Director sync'\)[\s\S]*?\}\)\.finally\(/)
  })

  it('Writer 를 읽은 뒤 씬이 하나도 없으면 씬 수를 한 번 더 세어 0개면 "아직 샷이 없어요"이고, 셀 수 없거나 씬이 있으면 읽기 실패로 보고 다시 시도한다', async () => {
    // 왜: writer-store.loadProject 는 읽기 실패를 삼키고 씬이 없을 때와 똑같이 끝난다 — 연결이 끊기면 같은 "아직 샷이 없어요"가 이쪽으로도 난다.
    db.count = 0
    await expect(writerProjectHasNoScenes('p1')).resolves.toBe(true)
    expect(db.reads).toEqual(['scenes.select(scene_id) count=exact head=true', 'scenes.project_id=p1'])
    db.count = 4
    await expect(writerProjectHasNoScenes('p1')).resolves.toBe(false)
    db.count = null
    db.error = { message: 'network' }
    await expect(writerProjectHasNoScenes('p1')).rejects.toThrow()
    // 훅: 씬이 없는데 셀 수 없거나 씬이 있으면 던져 다시 시도로, 정말 0개면 다 읽음("아직 샷이 없어요").
    const sync = src(SYNC)
    expect(sync).toMatch(/if \(!useWriterStore\.getState\(\)\.sceneManifest && !\(await writerProjectHasNoScenes\(pid\)\)\) throw new Error\('Writer data did not load'\)/)
    expect(sync).toMatch(/if \(!useWriterStore\.getState\(\)\.sceneManifest\) boardReady\(pid\)/)
  })

  it('다 읽기 전에는 샷 줄 대신 "샷을 불러오고 있어요"를 보이고 만들기 단추를 끄며, 다 읽은 뒤에만(샷이 0개여도) 지금 화면이 선다', () => {
    // 왜: 지금은 열자마자 0.25~0.6초(한 번은 5초 넘게) 그림 · Take 없는 줄과 켜진 [이미지 만들기 · 3]이 보이고,
    //   이 단추는 확인 없이 바로 그린다(QA B 11/23). 대가: 들어올 때마다 잠깐 불러오는 줄이 보인다.
    expect(cameraBoardView({ status: 'loading', shotCount: 3, hasScene: true })).toBe('loading')
    expect(cameraBoardView({ status: 'ready', shotCount: 0, hasScene: false })).toBe('empty')
    expect(cameraBoardView({ status: 'ready', shotCount: 3, hasScene: true })).toBe('board')
    const html = render('loading')
    expect(html).toContain('샷을 불러오고 있어요.')
    expect(html).not.toContain('<button')
    lang.locale = 'en'
    expect(render('loading')).toContain('Loading the shots.')
    // 적힌 것이 없는 프로젝트(처음 열 때 · 훅이 떠난 뒤)는 불러오는 중이다 — 기록은 한 프로젝트만 남는다.
    expect(boardLoadStatusOf(useBoardLoadStore.getState(), 'p1')).toBe('loading')
    markBoardLoad('p1', 'ready')
    expect(boardLoadStatusOf(useBoardLoadStore.getState(), 'p1')).toBe('ready')
    expect(boardLoadStatusOf(useBoardLoadStore.getState(), 'p2')).toBe('loading')
    expect(boardLoadStatusOf(useBoardLoadStore.getState(), null)).toBe('loading')
    forgetBoardLoad('p2')
    expect(boardLoadStatusOf(useBoardLoadStore.getState(), 'p1')).toBe('ready')
    forgetBoardLoad('p1')
    expect(boardLoadStatusOf(useBoardLoadStore.getState(), 'p1')).toBe('loading')
    // 다 읽음은 겹쳐 돈 재수화가 모두 끝난 뒤 — 뒤에 시작한 재수화가 앞 재수화의 결과를 버리고 조금 늦게 적기 때문이다(e2e 11/23: 0.12~0.25초 그림 없는 줄).
    expect(src('src/stores/director-store.ts')).toMatch(/export async function directorHydrationsSettled\(\): Promise<void> \{\s*while \(hydrationsInFlight > 0\)/)
    // 훅: 이 화면에서 아직 다 읽지 않은 프로젝트면 동기화를 시작할 때 불러오는 중으로 적고, 떠나거나 프로젝트가 바뀌면 기록을 지운다.
    const sync = src(SYNC)
    expect(sync).toMatch(/if \(boardProjectId && boardReadyProjectIdRef\.current !== boardProjectId\) markBoardLoad\(boardProjectId, 'loading'\)/)
    expect(sync).toMatch(/retryTimersRef\.current\.clear\(\)\s*[^\n]*\n?\s*forgetBoardLoad\(projectId\)/)
  })

  it('자동 다시 시도 동안은 "불러오는 중"이고, [다시 불러오기]는 새로 고침 없이 그 자리에서 다시 읽으며 자동 다시 시도 횟수를 새로 센다', () => {
    // 왜: 잠깐 끊겨도 바로 실패가 뜨지 않게(지금의 자동 다시 시도 약 6초는 그대로), 새로 고침은 채팅에 쓰던 말 · 열린 창을 날린다.
    const sync = src(SYNC)
    // 못 불러옴은 자동 다시 시도 몫을 다 쓴 한 곳에서만 적는다.
    expect(sync.match(/markBoardLoad\([^)]*'failed'/g)?.length).toBe(1)
    expect(sync).toMatch(/if \(attempts >= 3\) \{\s*console\.error\(`\[director\] \$\{label\} retry budget exhausted for \$\{retryProjectId\}`\)\s*markBoardLoad\(retryProjectId, 'failed'/)
    const body = retryBody(sync)
    expect(body).toMatch(/clearTimeout\(/)
    expect(body).not.toMatch(/location\.reload/)
    expect(src(PIECE)).not.toMatch(/location\.reload/)
  })

  it('불러오지 못했으면 이 브라우저에 남아 있던 옛 샷 줄도 보이지 않는다', () => {
    // 왜: 판은 이 브라우저에 저장된 옛 노드로 먼저 설 수 있는데, DB 에서 다시 읽지 못한 옛 줄에서 만들기를 누르면 옛 상태로 만든다.
    expect(cameraBoardView({ status: 'failed', shotCount: 12, hasScene: true })).toBe('failed')
    expect(cameraBoardView({ status: 'loading', shotCount: 12, hasScene: true })).toBe('loading')
  })
})
