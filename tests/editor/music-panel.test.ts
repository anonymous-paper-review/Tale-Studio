// Editor [생성] 음악 만들기 — 위 왼쪽 판 [생성] 탭 · 모델 둘(ElevenLabs Music · MiniMax Music 2.6) · 칸 · 세 상태(만드는 중 · 실패 · 끝) · 만든 곡을 타임라인 소리 조각으로 놓기 · 다른 브라우저에서도 같은 목록과 소리인지 검사한다 (m1126 E1 · 리드 O2 · O3, 2026-11-26)
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  ;(globalThis as { window?: unknown }).window = globalThis
  return {
    projectId: 'project-music' as string | null,
    poll: vi.fn(),
    decode: vi.fn(),
    toast: { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    takes: { balance: 10 as number | null, mode: 'enforce' as 'off' | 'shadow' | 'enforce', loading: false },
  }
})
vi.mock('@/stores/project-store', () => ({
  useProjectStore: Object.assign((pick: (s: { projectId: string | null }) => unknown) => pick({ projectId: mocks.projectId }), {
    getState: () => ({ projectId: mocks.projectId }),
  }),
}))
vi.mock('@/lib/generation-jobs-client', () => ({ pollGenerationJob: mocks.poll }))
vi.mock('@/lib/audio-waveform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/audio-waveform')>()),
  decodeAudioPeaks: mocks.decode,
}))
vi.mock('sonner', () => ({ toast: mocks.toast }))
vi.mock('@/lib/billing/use-take-balance', () => ({ useTakeBalance: () => mocks.takes, refetchTakeBalance: () => {} }))

import { useEditorStore } from '@/stores/editor-store'
import { useEditorMusicStore, type EditorMusicItem } from '@/stores/editor-music-store'
import { useLocaleStore } from '@/stores/locale-store'
import {
  DEFAULT_MUSIC_MODEL,
  MUSIC_LENGTH_MAX_SEC,
  MUSIC_MODELS,
  MUSIC_MODEL_ORDER,
  buildMusicInput,
  defaultMusicLengthSec,
  formatMusicLength,
  musicRequestProblem,
  musicTitle,
} from '@/lib/editor/music-models'
import { rehydrateAudioUrls } from '@/lib/editor-persistence'
import { editorFeatureLines } from '@/lib/editor/editor-features'
import { TopLeftTabs } from '@/features/editor/top-left-tabs'
import { MusicPanel } from '@/features/editor/music-panel'
import { ProjectPanel } from '@/features/editor/video-source-panel'
import type { AudioTrackClip } from '@/types'

const api = () => useEditorStore.getState()
const music = () => useEditorMusicStore.getState()
const read = (file: string) => readFileSync(file, 'utf8')
function html(el: ReturnType<typeof createElement>) {
  for (const store of [useLocaleStore, useEditorStore, useEditorMusicStore] as Array<{ getState: () => object; getInitialState: () => object }>) {
    Object.assign(store.getInitialState(), store.getState())
  }
  return renderToStaticMarkup(el)
}
const text = (markup: string) => markup.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
const pressed = (markup: string) => [...markup.matchAll(/aria-pressed="true"[^>]*>([^<]*)</g)].map((m) => m[1].trim())

const item = (patch: Partial<EditorMusicItem> = {}): EditorMusicItem => ({
  id: 'm1',
  title: '잔잔한 피아노와 새벽 바다',
  model: 'elevenlabs-music',
  prompt: '잔잔한 피아노와 새벽 바다',
  lyrics: null,
  instrumental: true,
  requestedDurationSec: 30,
  status: 'completed',
  url: 'https://media.test/ws/project/editor/music/m1.mp3',
  error: null,
  jobId: 'job-1',
  createdAt: '2026-11-26T10:00:00.000Z',
  ...patch,
})
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const fetchMock = vi.fn()

beforeEach(() => {
  useLocaleStore.setState({ locale: 'ko' })
  api().reset()
  music().reset()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  mocks.poll.mockReset()
  mocks.poll.mockImplementation(() => new Promise(() => {}))
  mocks.decode.mockReset()
  mocks.decode.mockResolvedValue({ durationSec: 30, peaks: [0.2, 0.5, 0.9] })
  mocks.takes.mode = 'enforce'
  for (const fn of Object.values(mocks.toast)) fn.mockReset()
})
afterEach(() => {
  vi.unstubAllGlobals()
  useLocaleStore.setState({ locale: 'en' })
})

describe('같이 정한 것', () => {
  it('Editor 위 왼쪽 판은 [소스] · [효과 컨트롤] · [생성] 세 탭이다', () => {
    // 왜: 오너 요청 E1 "왼쪽 위 패널에 '소스'/'효과컨트롤' 옆에 '생성' 버튼 추가". 정상 경로 고정.
    const markup = html(createElement(TopLeftTabs, { value: 'generate', onChange: () => {} }))
    expect(text(markup)).toBe('소스 효과 컨트롤 생성')
    expect(markup).toMatch(/aria-selected="true"[^>]*>생성</)
    // 화면이 이 탭 줄을 쓰고, [생성]이면 음악 판을 그린다.
    const page = read('src/app/studio/editor/page.tsx')
    expect(page).toContain('<TopLeftTabs')
    expect(page).toMatch(/topLeftTab === 'generate' \? <MusicPanel/)
  })

  it('[생성]에서 고를 수 있는 모델은 ElevenLabs Music(처음 값) · MiniMax Music 2.6 두 칩이고, 둘 다 fal 로만 만든다', () => {
    // 왜: 리드 답 O2(2026-11-26) — 두 모델을 칩으로 고르고 Lyria 는 넣지 않는다. 처리 업체는 정책 문서가 밝힌 fal 뿐이다.
    expect(MUSIC_MODEL_ORDER).toEqual(['elevenlabs-music', 'minimax-music-2.6'])
    expect(DEFAULT_MUSIC_MODEL).toBe('elevenlabs-music')
    expect(MUSIC_MODEL_ORDER.map((key) => MUSIC_MODELS[key].endpoint)).toEqual(['fal-ai/elevenlabs/music', 'fal-ai/minimax-music/v2.6'])
    const markup = html(createElement(MusicPanel))
    expect(text(markup)).toContain('ElevenLabs Music MiniMax Music 2.6')
    expect(pressed(markup)).toContain('ElevenLabs Music')
  })

  it('분위기 글을 쓰고 [만들기]를 누르면 고른 모델 · 글 · 반주/노래 · 길이로 한 곡을 만들어 달라고 보내고, 그 곡이 "만드는 중"으로 목록 맨 위에 선다', async () => {
    // 왜: 오너 요청 E1 "음악 생성". 정상 경로 고정 — 만들기는 서버가 하고 화면은 그 곡을 목록에서 지켜본다.
    music().setProject('project-music')
    music().setDraft({ prompt: '잔잔한 피아노와 새벽 바다', durationSec: 45 })
    fetchMock.mockResolvedValueOnce(json({ item: item({ id: 'm2', status: 'queued', url: null, jobId: 'job-2', requestedDurationSec: 45 }) }))
    const ok = await music().create(33)
    expect(ok).toBe(true)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/editor/music')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({
      projectId: 'project-music',
      model: 'elevenlabs-music',
      prompt: '잔잔한 피아노와 새벽 바다',
      instrumental: true,
      durationSec: 45,
    })
    expect(music().items.map((x) => [x.id, x.status])).toEqual([['m2', 'queued']])
    expect(mocks.poll).toHaveBeenCalledWith('job-2', expect.anything())
  })

  it('다 만든 곡은 프로젝트 판 "만든 음악"에 올라 다른 소리처럼 끌어 오디오 줄에 놓을 수 있다', () => {
    // 왜: 오너 요청 E1 "편집" — 만든 곡이 다른 소리처럼 타임라인에 올라가야 자르기 · 볼륨을 한다. 정상 경로 고정.
    const markup = html(
      createElement(ProjectPanel, {
        shots: [],
        videoClips: [],
        audioSources: [],
        newItems: [],
        music: [
          { id: 'm1', title: '잔잔한 피아노와 새벽 바다', url: 'https://media.test/m1.mp3', durationSec: 30, peaks: [0.1] },
        ],
        onAddMusic: () => {},
        onOpenSource: () => {},
        onAddClip: () => {},
        onAddClipAtPlayhead: () => {},
        onAddAudioFromSource: () => {},
        onAddAudioSource: () => {},
        onRemoveAudioSource: () => {},
        onBinDragStart: () => {},
        onBinDragEnd: () => {},
        onSetBinDropSec: () => {},
      }),
    )
    expect(text(markup)).toContain('만든 음악 · 1 잔잔한 피아노와 새벽 바다 A · 30:00')
    expect(markup).toContain('data-music-id="m1"')
  })

  it('타임라인에 놓은 곡은 다른 소리 조각처럼 자르기 · 볼륨 · 페이드가 되고, 내보낸 영상에도 다른 소리 조각처럼 들어간다', () => {
    // 왜: 오너 요청 E1 "음악 생성 및 편집". 만든 곡은 보통 소리 조각이라 지금 소리 편집 · 내보내기 길을 그대로 탄다.
    useEditorStore.setState({ audioTracks: [{ id: 'atrack_1' }, { id: 'atrack_2' }], audioClips: [] })
    const id = api().addAudioClipFromMusic({ id: 'm1', title: '잔잔한 피아노', url: 'https://media.test/m1.mp3', durationSec: 30, peaks: [0.5] }, 2, 'atrack_2')
    expect(id).toBeTruthy()
    const placed = api().audioClips.find((a) => a.id === id) as AudioTrackClip
    expect(placed).toMatchObject({ name: '잔잔한 피아노', url: 'https://media.test/m1.mp3', startSec: 2, durationSec: 30, sourceDurationSec: 30, sourceOffsetSec: 0, trackId: 'atrack_2', linkedShotId: null, sourceId: 'music:m1' })
    expect(placed.blobKey).toBeUndefined()
    api().setAudioVolume(id as string, 0.4)
    api().updateAudioClip(id as string, { fadeInSec: 1 })
    api().splitAudioClipAt(id as string, 12)
    const pieces = api().audioClips.filter((a) => a.url === 'https://media.test/m1.mp3')
    expect(pieces.map((a) => [a.startSec, a.durationSec, a.sourceOffsetSec])).toEqual([[2, 10, 0], [12, 20, 10]])
    expect(pieces.every((a) => a.volume === 0.4)).toBe(true)
    // 내보내기는 소리 조각을 주소로 받아 섞는다 — 만든 곡도 같은 목록(audioClips)으로 넘어간다.
    expect(read('src/app/studio/editor/page.tsx')).toMatch(/audioClips: st\.audioClips,/)
  })

  it('만든 곡 목록은 서버에서 읽어 다른 브라우저에서 열어도 같고, 타임라인에 놓은 곡은 그 브라우저에 파일이 없어도 소리가 난다', async () => {
    // 왜: 오너 요청 E1 "프로젝트에 저장". 올린 소리(이 브라우저 저장소)와 달리 만든 곡은 보관함 주소라 다른 브라우저 · 기기에서도 들린다.
    fetchMock.mockResolvedValueOnce(json({ items: [item()] }))
    await music().load('project-music')
    expect(fetchMock.mock.calls[0][0]).toBe('/api/editor/music?projectId=project-music')
    expect(music().items.map((x) => x.id)).toEqual(['m1'])
    const saved = {
      audioClips: [{ id: 'a1', name: '잔잔한 피아노', url: 'https://media.test/m1.mp3', startSec: 0, durationSec: 30, volume: 1, muted: false, linkedShotId: null, sourceId: 'music:m1' }] as AudioTrackClip[],
      audioSources: [],
    }
    await rehydrateAudioUrls(saved, true)
    expect(saved.audioClips[0].url).toBe('https://media.test/m1.mp3')
  })

  it('한 곡에 1 Take 를 쓴다 — [만들기]에 "1 Take"가 보이고, Take 가 꺼진 배포에서는 숫자 없이 [음악 만들기]다', () => {
    // 왜: 리드 답 O3(2026-11-26) "한 곡 1 Take". Take 값은 영상 단추와 같은 규칙으로 보인다(takeValuesShown).
    music().setDraft({ prompt: '잔잔한 피아노' })
    expect(text(html(createElement(MusicPanel)))).toContain('음악 만들기 · 1 Take')
    mocks.takes.mode = 'off'
    const off = text(html(createElement(MusicPanel)))
    expect(off).toContain('음악 만들기')
    expect(off).not.toContain('1 Take')
  })
})

describe('혼자 정한 것', () => {
  it('길이 칸 처음 값은 지금 시퀀스 길이(초, 올림)이고 3초 ~ 3분 안이며, 시퀀스가 비었으면 30초다', () => {
    // 왜: 영상 길이에 맞는 배경음이 가장 흔한 쓰임이다. 상한 3분은 리드가 정했다(O3, API 는 10분까지 받는다).
    expect(MUSIC_LENGTH_MAX_SEC).toBe(180)
    expect(defaultMusicLengthSec(39.1)).toBe(40)
    expect(defaultMusicLengthSec(1.2)).toBe(3)
    expect(defaultMusicLengthSec(600)).toBe(180)
    expect(defaultMusicLengthSec(0)).toBe(30)
    useEditorStore.setState({ audioClips: [{ id: 'x', name: 'x', url: 'https://a.test/x.mp3', startSec: 0, durationSec: 39.1, volume: 1, muted: false }] })
    expect(html(createElement(MusicPanel))).toMatch(/aria-label="길이"[^>]*value="40"/)
  })

  it('반주/노래 처음 값은 [반주만]이고, ElevenLabs [반주만]은 반주만 보장 · [노래]는 분위기 글을 따르며 길이를 밀리초로 보낸다', () => {
    // 왜: 영상 배경음은 반주가 흔하다. ElevenLabs 는 force_instrumental 일 때만 반주를 보장한다(fal 문서).
    expect(pressed(html(createElement(MusicPanel)))).toContain('반주만')
    expect(buildMusicInput({ model: 'elevenlabs-music', prompt: ' 잔잔한 피아노 ', instrumental: true, durationSec: 45 })).toEqual({
      endpoint: 'fal-ai/elevenlabs/music',
      input: { prompt: '잔잔한 피아노', music_length_ms: 45000, force_instrumental: true, output_format: 'mp3_44100_128' },
    })
    expect(buildMusicInput({ model: 'elevenlabs-music', prompt: '여자 목소리 발라드', instrumental: false, durationSec: 999 }).input).toMatchObject({ music_length_ms: 180000, force_instrumental: false })
  })

  it('MiniMax 를 고르면 길이 칸 대신 "길이는 모델이 정해요"가 보이고, 노래면 가사 칸이 생기며 가사를 비우면 모델이 분위기 글로 가사를 짓는다', () => {
    // 왜: MiniMax Music 2.6 은 길이를 받지 않고, 노래일 때 가사가 없으면 lyrics_optimizer 로 지어 달라고 해야 만든다(fal 문서).
    music().setDraft({ model: 'minimax-music-2.6', instrumental: false })
    const markup = text(html(createElement(MusicPanel)))
    expect(markup).toContain('길이는 모델이 정해요')
    expect(markup).toContain('가사')
    expect(buildMusicInput({ model: 'minimax-music-2.6', prompt: '시티팝, 80년대, 따뜻한 여자 목소리', instrumental: false, lyrics: '' }).input).toEqual({
      prompt: '시티팝, 80년대, 따뜻한 여자 목소리',
      is_instrumental: false,
      lyrics_optimizer: true,
    })
    expect(buildMusicInput({ model: 'minimax-music-2.6', prompt: '시티팝, 80년대, 따뜻한 여자 목소리', instrumental: false, lyrics: '[verse]\n밤바람' }).input).toEqual({
      prompt: '시티팝, 80년대, 따뜻한 여자 목소리',
      is_instrumental: false,
      lyrics: '[verse]\n밤바람',
    })
    expect(buildMusicInput({ model: 'minimax-music-2.6', prompt: '잔잔한 피아노 반주 음악', instrumental: true, lyrics: '버려질 가사' }).input).toEqual({
      prompt: '잔잔한 피아노 반주 음악',
      is_instrumental: true,
    })
  })

  it('분위기 글이 비었거나(MiniMax 는 10자 미만) 2000자를 넘거나 가사가 3500자를 넘으면 [만들기]를 보내지 않고 까닭을 알린다', async () => {
    // 왜: 모델이 받지 않는 글을 보내면 Take 를 묶었다 돌려주는 헛걸음이 된다(MiniMax 10 ~ 2000자 · 가사 3500자, fal 문서).
    expect(musicRequestProblem({ model: 'elevenlabs-music', prompt: '  ', instrumental: true })).toBe('prompt_empty')
    expect(musicRequestProblem({ model: 'minimax-music-2.6', prompt: '짧은 글', instrumental: true })).toBe('prompt_short')
    expect(musicRequestProblem({ model: 'elevenlabs-music', prompt: '가'.repeat(2001), instrumental: true })).toBe('prompt_long')
    expect(musicRequestProblem({ model: 'minimax-music-2.6', prompt: '시티팝 따뜻한 여자 목소리', instrumental: false, lyrics: '가'.repeat(3501) })).toBe('lyrics_long')
    expect(musicRequestProblem({ model: 'elevenlabs-music', prompt: '피아노', instrumental: true })).toBeNull()
    music().setProject('project-music')
    music().setDraft({ model: 'minimax-music-2.6', prompt: '짧은 글' })
    expect(await music().create(30)).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mocks.toast.error).toHaveBeenCalledWith('MiniMax Music 2.6 은 분위기 글을 10자 이상 써 주세요.')
  })

  it('만든 곡의 길이는 [생성] 목록에 분:초로 보인다 — 20초는 0:20, 2분 32초는 2:32', () => {
    // 왜: 목록에는 "A ·" 같은 줄 표시가 없어 타임코드(초:장, "20:01")가 20분으로 읽힌다(개발 서버 화면 확인 2026-11-26). 프로젝트 판은 다른 줄과 같은 "A · 초:장" 그대로다.
    expect(formatMusicLength(20.06)).toBe('0:20')
    expect(formatMusicLength(152)).toBe('2:32')
    useEditorMusicStore.setState({ items: [item({ requestedDurationSec: 20 })], decoded: { m1: { durationSec: 152.4, peaks: [] } } })
    expect(text(html(createElement(MusicPanel)))).toContain('잔잔한 피아노와 새벽 바다 2:32')
  })

  it('곡 이름은 분위기 글 첫 줄 앞 40자다', () => {
    // 왜: 목록 · 타임라인 조각에서 곡을 구별할 이름이 필요하다. 따로 이름 칸을 두지 않는다.
    expect(musicTitle('잔잔한 피아노\n둘째 줄')).toBe('잔잔한 피아노')
    expect(musicTitle('가'.repeat(45))).toBe(`${'가'.repeat(40)}…`)
  })

  it('만드는 중인 곡은 "만드는 중… 몇 분 걸릴 수 있어요"를 보이고, 끝나면 목록을 다시 읽어 끝 상태로 바뀐다 — 화면을 다시 열어도 만드는 중인 곡을 이어서 지켜본다', async () => {
    // 왜: 몇 분을 막고 기다리게 하지 않는다. 만들기는 서버가 하므로 다른 단계에 갔다 와도(다시 열어도) 이어진다.
    //   걸리는 시간은 모델마다 다르다(개발 서버 실측 2026-11-26: ElevenLabs 20초 곡 12초 · MiniMax 노래 165초) — "보통 1~2분"이라 하지 않는다.
    let finish: (url: string) => void = () => {}
    mocks.poll.mockImplementationOnce(() => new Promise<string>((resolve) => (finish = resolve)))
    fetchMock.mockResolvedValueOnce(json({ items: [item({ status: 'queued', url: null })] }))
    await music().load('project-music')
    expect(mocks.poll).toHaveBeenCalledWith('job-1', expect.anything())
    expect(text(html(createElement(MusicPanel)))).toContain('만드는 중… 몇 분 걸릴 수 있어요')
    fetchMock.mockResolvedValueOnce(json({ items: [item()] }))
    finish('https://media.test/ws/project/editor/music/m1.mp3')
    await vi.waitFor(() => expect(music().items[0]?.status).toBe('completed'))
    await vi.waitFor(() => expect(music().decoded.m1).toEqual({ durationSec: 30, peaks: [0.2, 0.5, 0.9] }))
  })

  it('실패한 곡은 "만들지 못했어요" · 까닭 한 줄 · [다시 만들기]를 보이고, [다시 만들기]는 그 곡의 글 · 모델 · 반주/노래 · 길이로 칸을 채운다', () => {
    // 왜: 실패해도 다시 쓰지 않고 바로 다시 한다. 까닭은 고칠 수 있는 말로(내용 규칙 · Take 부족 · 그 밖).
    useEditorMusicStore.setState({ items: [item({ id: 'm3', status: 'failed', url: null, error: 'content_policy', model: 'minimax-music-2.6', prompt: '어두운 신스웨이브 노래', instrumental: false, lyrics: '[verse] 밤', requestedDurationSec: null })] })
    const markup = text(html(createElement(MusicPanel)))
    expect(markup).toContain('만들지 못했어요')
    expect(markup).toContain('음악 서비스가 이 글을 받지 않았어요. 분위기 글을 고쳐 다시 만들어 주세요.')
    expect(markup).toContain('다시 만들기')
    music().retry('m3')
    expect(music().draft).toMatchObject({ model: 'minimax-music-2.6', prompt: '어두운 신스웨이브 노래', instrumental: false, lyrics: '[verse] 밤' })
  })

  it('너무 오래 걸려 멈춘 곡에는 묶인 Take 를 돌려받는 길(프로젝트 목록 위 [대기열]에서 그 작업 지우기)을 한 줄로 알린다', () => {
    // 왜: 접수 여부를 모르는 작업은 Take 를 묶은 채 기다리는 정책이라(영상과 같음) Editor 만으로는 그 Take 를 풀 수 없다 — [대기열]에서 지우면 돌려받는다(검토 rev-billing 2026-11-26).
    useEditorMusicStore.setState({ items: [item({ id: 'm5', status: 'failed', url: null, error: 'timed_out' })] })
    const markup = text(html(createElement(MusicPanel)))
    expect(markup).toContain('너무 오래 걸려 멈췄어요.')
    expect(markup).toContain('Take 가 묶여 있으면 프로젝트 목록 위 [대기열]에서 이 작업을 지우면 돌아와요.')
  })

  it('[타임라인 추가]는 만든 곡을 플레이헤드 자리에 놓고, 그 자리가 빈 첫 오디오 줄을 고르며 빈 줄이 없으면 새 줄을 만든다', () => {
    // 왜: 끌기 없이 한 번에 넣는다. 같은 줄의 소리끼리 겹치지 않게(조언 목록 "같은 줄에서 클립 겹치기 없음").
    const taken = (id: string, trackId: string, startSec: number, durationSec: number) => ({ id, name: id, url: `https://a.test/${id}.mp3`, startSec, durationSec, volume: 1, muted: false, trackId, linkedShotId: null })
    useEditorStore.setState({ currentTime: 5, audioTracks: [{ id: 'atrack_1' }, { id: 'atrack_2' }], audioClips: [taken('x', 'atrack_1', 0, 10)] })
    const song = { id: 'm1', title: '잔잔한 피아노', url: 'https://media.test/m1.mp3', durationSec: 30, peaks: [] }
    const first = api().placeMusicAtPlayhead(song)
    expect(api().audioClips.find((a) => a.id === first)).toMatchObject({ trackId: 'atrack_2', startSec: 5 })
    const second = api().placeMusicAtPlayhead(song)
    const placed = api().audioClips.find((a) => a.id === second)
    expect(api().audioTracks).toHaveLength(3)
    expect(placed).toMatchObject({ trackId: api().audioTracks[2].id, startSec: 5 })
  })

  it('[빼기]는 그 곡을 목록에서만 빼고, 이미 타임라인에 놓은 조각은 그대로 둔다 — 만드는 중인 곡은 뺄 수 없다', async () => {
    // 왜: 놓은 소리가 갑자기 사라지면 안 된다(파일은 지우지 않는다). 만드는 중인 곡은 Take 를 이미 묶었고 서버가 만들고 있다.
    useEditorMusicStore.setState({ projectId: 'project-music', items: [item(), item({ id: 'm2', status: 'queued', url: null, jobId: 'job-2' })] })
    useEditorStore.setState({ audioClips: [{ id: 'a1', name: '잔잔한 피아노', url: 'https://media.test/ws/project/editor/music/m1.mp3', startSec: 0, durationSec: 30, volume: 1, muted: false, sourceId: 'music:m1', linkedShotId: null }] })
    fetchMock.mockResolvedValueOnce(json({ ok: true }))
    await music().remove('m1')
    expect(fetchMock.mock.calls[0][0]).toBe('/api/editor/music/m1?projectId=project-music')
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('DELETE')
    expect(music().items.map((x) => x.id)).toEqual(['m2'])
    expect(api().audioClips.map((a) => a.id)).toEqual(['a1'])
    await music().remove('m2')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const markup = html(createElement(MusicPanel))
    expect(markup).not.toMatch(/data-music-remove="m2"/)
  })

  it('Lumi 조언 기능 목록에 [생성]에서 음악을 만드는 법이 한 줄로 실리고, Lumi 는 음악을 만들지 않는다고 말한다', () => {
    // 왜: 예전 목록대로면 Lumi 가 "Editor 에는 음악 만들기가 없다"고 틀리게 조언한다. 만들기는 사람이 [생성]에서 한다.
    const ko = editorFeatureLines('ko').join('\n')
    expect(ko).toContain('"효과 컨트롤" 옆 "생성" 탭')
    expect(ko).toContain('"ElevenLabs Music"')
    expect(ko).toContain('"MiniMax Music 2.6"')
    expect(ko).toContain('"만든 음악 · N"')
    expect(ko).toContain('Lumi 는 음악을 만들지 않음')
    const en = editorFeatureLines('en').join('\n')
    expect(en).toContain('The "Generate" tab next to "Effect controls"')
    expect(en).toContain('Lumi does not make music.')
  })
})
