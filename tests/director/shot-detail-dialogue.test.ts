// Director 샷 상세(스토리보드형 팝업 · 노드형 왼쪽 패널)에 그 샷의 대사가 늘 보이는지 — 영상이 쓰는 그 Writer 샷의 대사, 대사 없음과 넣을 곳 · 고칠 곳 안내, Writer 자료를 아직 못 읽었으면 "대사 없음" 대신 불러오는 중 · 불러오지 못함 — 을 상세를 실제로 그려 검사한다 (오너 2026-11-27 P1 · 검토 rev-flow-2-2)
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/generation-queue', async (original) => ({
  ...await original<typeof import('@/lib/generation-queue')>(),
  useActiveGenerationJobs: () => [],
  useGenerationQueueStatus: () => 'ready',
}))
vi.mock('@/lib/use-debug-prompts', () => ({ useDebugPrompts: () => false }))
vi.mock('@/lib/billing/use-take-balance', () => ({ useTakeBalance: () => ({ balance: 100, mode: 'shadow', loading: false }), fetchTakeBalance: async () => ({ failed: false }) }))
// 정적 그리기에는 누르기가 없다 — 단추는 그대로 그리고, data-testid 가 있는 단추의 누르기만 받아 둔다(시험이 대신 누른다).
const clicks = vi.hoisted(() => new Map<string, () => void>())
vi.mock('@/components/ui/button', async (original) => {
  const real = await original<typeof import('@/components/ui/button')>()
  const { createElement: h } = await import('react')
  return {
    ...real,
    Button: (props: Parameters<typeof real.Button>[0] & { 'data-testid'?: string }) => {
      const id = props['data-testid']
      if (id && props.onClick) clicks.set(id, props.onClick as () => void)
      return h(real.Button, props)
    },
  }
})

import { DirectorShotDetail } from '@/features/director/shot-detail/director-shot-detail'
import { shotDetailDialogue } from '@/lib/director/shot-detail'
import { dialogueLinesView } from '@/lib/writer/board-card'
import { translate } from '@/lib/i18n/translate'
import { useDirectorCanvasStore as director } from '@/stores/director-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useProjectFormatStore } from '@/stores/project-format-store'
import { useWriterStore } from '@/stores/writer-store'
import type { SceneManifest, Shot } from '@/types'

// 이 시험을 위해 지은 Writer 자료 — sh_01_02 는 대사 두 줄(미나 · 내레이션), sh_01_03 은 대사가 없다(빈 줄 하나만).
const PROJECT = 'detail-project'
const MANIFEST = {
  scenes: [{ sceneId: 'sc_01', narrativeSummary: '', originalTextQuote: '', location: '', timeOfDay: '', mood: '', charactersPresent: ['mina'], estimatedDurationSeconds: 10, sortOrder: 0 }],
  characters: [{ characterId: 'mina', name: '미나', role: 'protagonist', description: '', fixedPrompt: '', referenceImages: [] }],
  locations: [],
} as unknown as SceneManifest
const WRITER_SHOTS = [
  { shotId: 'sh_01_02', sceneId: 'sc_01', sortOrder: 0, dialogueLines: [{ characterId: 'mina', text: '가자, 버스 온다.' }, { characterId: null, text: '그날 밤은 길었다.' }] },
  { shotId: 'sh_01_03', sceneId: 'sc_01', sortOrder: 1, dialogueLines: [{ characterId: 'mina', text: '  ' }] },
] as unknown as Shot[]
const EDIT_HINT = 'Edit the dialogue in the rough storyboard on the Writer screen or in the Dialogue tab on Storyboard. New videos use the edited dialogue.'
const ADD_HINT = 'Add dialogue in the rough storyboard on the Writer screen. New videos use the added dialogue.'
const LOADING = 'Loading the dialogue…'
const FAILED = "Couldn't load the dialogue."
const RETRY = 'Load it again'
const IMAGE = { url: 'https://media.test/start.png', status: 'completed' as const, errorMessage: null, generatedAt: 1, frames: { start: 'https://media.test/start.png', direction: 'https://media.test/dir.png', end: 'https://media.test/end.png' } }
const realLoadProject = useWriterStore.getState().loadProject

let shotId = ''
function setLocale(locale: 'ko' | 'en') {
  useLocaleStore.setState({ locale })
}
/** 정적 그리기는 store 의 처음 값을 읽는다 — 지금 값을 처음 값으로 옮긴다(shot-detail-view 와 같은 방법). */
function syncStores() {
  Object.assign(director.getInitialState(), director.getState())
  Object.assign(useWriterStore.getInitialState(), useWriterStore.getState())
  Object.assign(useProjectFormatStore.getInitialState(), useProjectFormatStore.getState())
  Object.assign(useLocaleStore.getInitialState(), useLocaleStore.getState())
}
/** writerShotId 인 샷의 상세를 그린다 — null 이면 Director 에서 손으로 더한 샷. */
function render(writerShotId: string | null, opts: { layout?: 'popup' | 'panel'; tab?: 'image' | 'video' } = {}) {
  director.getState().updateNodeData<'shot'>(shotId, { writerShotId })
  syncStores()
  return renderToStaticMarkup(createElement(DirectorShotDetail, { shotNodeId: shotId, initialTab: opts.tab ?? 'image', layout: opts.layout ?? 'popup', onClose: () => {} }))
}
/** 대사 칸만 — 다른 칸(프롬프트 등)의 글과 섞어 읽지 않게. */
function dialogueBlock(html: string) {
  const at = html.indexOf('data-testid="shot-dialogue"')
  expect(at).toBeGreaterThan(-1)
  return html.slice(html.lastIndexOf('<', at), html.indexOf('</section>', at))
}
const ko = (text: string) => translate('ko', text)
/** 정적 그리기가 쓰는 글자 꼴 — 따옴표 ' 는 &#x27; 로 나온다. */
const shown = (text: string) => text.replaceAll('&', '&amp;').replaceAll("'", '&#x27;').replaceAll('"', '&quot;')

beforeEach(() => {
  clicks.clear()
  director.setState({ projectId: PROJECT, nodes: [], edges: [], realBatchBusy: false, generatingNodeIds: {} })
  shotId = director.getState().addShotNode(null, { x: 0, y: 0 })
  director.getState().updateNodeData<'shot'>(shotId, { storyboardImage: IMAGE })
  useProjectFormatStore.setState({ format: 'vertical_9:16' })
  // 기본: 캔버스 프로젝트의 Writer 자료를 다 읽은 상태.
  useWriterStore.setState({ sceneManifest: MANIFEST, shots: WRITER_SHOTS, loadedProjectId: PROJECT, loadAttempt: null, loadProject: realLoadProject })
  setLocale('ko')
})

describe('Director 샷 상세의 대사', () => {
  // 왜(오너 P1 — 대사는 Director 까지 고칠 수 있게 할 것): 영상은 낼 때 그 샷의 Writer 대사(shots.dialogue_lines, writerShotId)를 지시문에 싣는다 —
  //   상세가 보이는 대사가 영상이 쓰는 대사와 다르면 무엇이 영상에 들어가는지 알 수 없다.
  it('Director 샷 상세의 대사는 영상이 쓰는 그 Writer 샷(writerShotId)의 대사다', () => {
    expect(shotDetailDialogue(WRITER_SHOTS, 'sh_01_02', 'ready')).toEqual({ status: 'ready', lines: WRITER_SHOTS[0].dialogueLines, editable: true })
    expect(shotDetailDialogue(WRITER_SHOTS, 'sh_01_03', 'ready')).toEqual({ status: 'ready', lines: WRITER_SHOTS[1].dialogueLines, editable: true })
  })

  // 왜(오너 P1 · 보드 카드와 같은 규칙): 같은 대사가 카드 · 대사 탭 · 팝업에서 다른 이름으로 보이면 누가 하는 말인지 헷갈린다.
  it('대사 줄의 말하는 사람은 보드 카드와 같은 규칙이다 — 인물 id 는 이름, 내레이션은 V.O., 모르는 id 는 그대로, 빈 줄은 뺀다', () => {
    expect(dialogueLinesView([
      { characterId: 'mina', text: ' 가자. ' },
      { characterId: null, text: '그날 밤.' },
      { characterId: 'ghost', text: '누구?' },
      { characterId: 'mina', text: '   ' },
    ] as never, new Map([['mina', '미나']]))).toEqual([
      { speaker: '미나', text: '가자.' },
      { speaker: 'V.O.', text: '그날 밤.' },
      { speaker: 'ghost', text: '누구?' },
    ])
  })

  // 왜(오너 P1 "카드 클릭 시 나타나는 팝업에 대사 꼭 보이게"): 카드는 대사 첫 줄만 보인다 — 상세에서 그 샷의 대사 전부를 누가 하는지와 함께 보고,
  //   여기서는 보기만 하니 고칠 곳과 고친 대사가 새로 만드는 영상부터 들어간다는 것을 알린다(이미 만든 Take 는 그대로).
  it('대사가 있는 샷의 상세는 대사 칸에 줄마다 말하는 사람과 대사를 보이고, 고칠 곳과 새 영상부터 들어간다는 안내를 단다', () => {
    const block = dialogueBlock(render('sh_01_02'))
    expect(block).toContain(ko('Dialogue'))
    expect(block).toContain('미나')
    expect(block).toContain('가자, 버스 온다.')
    expect(block).toContain('V.O.')
    expect(block).toContain('그날 밤은 길었다.')
    expect(block).toContain(ko(EDIT_HINT))
    expect(block).not.toContain(ko('No dialogue'))
    expect(block).not.toContain(ko(ADD_HINT))
  })

  // 왜(검토 3번): Storyboard 대사 탭은 이미 있는 줄의 글만 고친다 — 대사 없는 샷에 "대사 탭에서 고쳐요"라고 하면 가도 누를 줄이 없다. 대사를 넣는 곳은 Writer 콘티다.
  it('대사가 없는 샷의 상세는 "대사 없음"과 함께 대사는 Writer 콘티에서 넣는다는 안내를 달고, 대사 탭에서 고친다는 안내는 달지 않는다', () => {
    const block = dialogueBlock(render('sh_01_03'))
    expect(block).toContain(ko('Dialogue'))
    expect(block).toContain(ko('No dialogue'))
    expect(block).toContain(ko(ADD_HINT))
    expect(block).not.toContain(ko(EDIT_HINT))
  })

  // 왜(정상 경로 고정): Director 에서 손으로 더한 샷은 Writer 샷이 없어 영상에도 대사가 실리지 않는다 — Writer 자료를 기다릴 것 없이 "대사 없음"이고 넣을 곳 · 고칠 곳도 없다.
  it('Director 에서 더한 샷(Writer 샷 없음)의 상세는 Writer 자료를 기다리지 않고 "대사 없음"만 보이고 안내는 달지 않는다', () => {
    useWriterStore.setState({ sceneManifest: null, shots: [], loadedProjectId: null, loadAttempt: { projectId: PROJECT, status: 'loading' } })
    const block = dialogueBlock(render(null))
    expect(block).toContain(ko('No dialogue'))
    expect(block).not.toContain(ko(LOADING))
    expect(block).not.toContain(ko(EDIT_HINT))
    expect(block).not.toContain(ko(ADD_HINT))
  })

  // 왜(검토 1번 ①): 새로 고침하거나 Director 로 바로 들어오면 캔버스가 먼저 그려지고 Writer 자료는 그 뒤에 온다 —
  //   그 사이 카드를 누르면 대사가 있는 샷도 "대사 없음"으로 보였다. 거짓 "대사 없음"을 보고 대사를 새로 넣으러 갈 수 있다.
  it('Writer 자료를 아직 읽는 중이면 "대사 없음" 대신 대사를 불러오는 중이라고 한다', () => {
    useWriterStore.setState({ sceneManifest: null, shots: [], loadedProjectId: null, loadAttempt: { projectId: PROJECT, status: 'loading' } })
    const block = dialogueBlock(render('sh_01_02'))
    expect(block).toContain(ko(LOADING))
    expect(block).not.toContain(ko('No dialogue'))
    expect(block).not.toContain(ko(ADD_HINT))
    expect(block).not.toContain(ko(EDIT_HINT))
  })

  // 왜(검토 1번 ②): 읽기가 실패하거나 로그인이 끊겨 빈 목록이 오면 Director 는 다시 읽지 않는다 — 그 세션 내내 모든 샷이 거짓 "대사 없음"이었다.
  //   못 읽었다고 말하고, 그 자리에서 다시 읽게 한다.
  it('Writer 자료를 읽지 못했으면 "대사 없음" 대신 불러오지 못했다고 하고, [다시 불러오기]를 누르면 Writer 자료를 다시 읽는다', () => {
    const load = vi.fn(async () => {})
    useWriterStore.setState({ sceneManifest: null, shots: [], loadedProjectId: null, loadAttempt: { projectId: PROJECT, status: 'failed' }, loadProject: load })
    const block = dialogueBlock(render('sh_01_02'))
    expect(block).toContain(ko(FAILED))
    expect(block).toContain(ko(RETRY))
    expect(block).not.toContain(ko('No dialogue'))
    expect(block).not.toContain(ko(ADD_HINT))
    const retry = clicks.get('shot-dialogue-retry')
    expect(retry).toBeTypeOf('function')
    retry?.()
    expect(load).toHaveBeenCalledTimes(1)
  })

  // 왜(검토 2번): 샷 id 는 프로젝트마다 겹친다(sh_01_01 …) — 다른 프로젝트 자료가 남아 있으면 같은 이름 샷의 남의 대사가
  //   "고칠 곳 · 새 영상부터" 안내와 함께 보였다. 그 캔버스 프로젝트 자료일 때만 쓴다.
  it('캔버스와 다른 프로젝트의 Writer 자료만 있으면 같은 이름 샷이 있어도 그 대사를 보이지 않는다', () => {
    useWriterStore.setState({ loadedProjectId: 'other-project', loadAttempt: null })
    const block = dialogueBlock(render('sh_01_02'))
    expect(block).not.toContain('가자, 버스 온다.')
    expect(block).not.toContain(ko(EDIT_HINT))
    expect(block).not.toContain(ko('No dialogue'))
    expect(block).toContain(ko(LOADING))
  })

  // 왜(오너 P1 — 카드 클릭 시 나타나는 팝업): 스토리보드형 팝업과 노드형 왼쪽 패널이 같은 상세다 — 이미지 · 영상 어느 탭으로 열어도 대사가 먼저 보이게 탭 내용 위에 둔다.
  it('팝업 · 왼쪽 패널, 이미지 탭 · 영상 탭 어느 쪽으로 열어도 대사 칸은 탭 내용 위에 있다', () => {
    for (const layout of ['popup', 'panel'] as const) {
      for (const tab of ['image', 'video'] as const) {
        const html = render('sh_01_02', { layout, tab })
        const content = html.indexOf(`data-testid="shot-detail-${tab}-tab"`)
        expect(content, `${layout} · ${tab}`).toBeGreaterThan(-1)
        expect(html.indexOf('data-testid="shot-dialogue"'), `${layout} · ${tab}`).toBeLessThan(content)
        expect(dialogueBlock(html), `${layout} · ${tab}`).toContain('가자, 버스 온다.')
      }
    }
  })

  // 왜(화면 문구 두 말 규칙): 영어 화면의 대사 칸에 한국어가 섞이면 안 된다(대사 글 자체는 그 프로젝트 말 그대로라 대사 없는 경우로 본다).
  it('영어 화면이면 상세 대사 칸의 머리 · 대사 없음 · 안내 · 불러오는 중 · 불러오지 못함이 모두 영어다', () => {
    setLocale('en')
    const empty = dialogueBlock(render('sh_01_03'))
    expect(empty).toContain('Dialogue')
    expect(empty).toContain('No dialogue')
    expect(empty).toContain(ADD_HINT)
    useWriterStore.setState({ loadedProjectId: null, loadAttempt: { projectId: PROJECT, status: 'loading' } })
    const loading = dialogueBlock(render('sh_01_02'))
    expect(loading).toContain(LOADING)
    useWriterStore.setState({ loadAttempt: { projectId: PROJECT, status: 'failed' } })
    const failed = dialogueBlock(render('sh_01_02'))
    expect(failed).toContain(shown(FAILED))
    expect(failed).toContain(RETRY)
    for (const block of [empty, loading, failed]) expect(block).not.toMatch(/[가-힣]/)
    for (const text of [ADD_HINT, LOADING, FAILED]) expect(ko(text), text).not.toBe(text)
  })
})
