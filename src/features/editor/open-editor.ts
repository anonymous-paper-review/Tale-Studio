// Editor 를 여는 마무리 — 저장한 편집을 되살렸으면 바로 열고, 처음 여는 프로젝트면 영상 실제 길이를 잰 뒤 그 자리에
//   영상마다 소리를 오디오 칸에 나누어 놓고 파형을 채워 저장한 다음에 편집 화면을 연다(오너 2026-11-10 "비디오랑 오디오랑
//   분리해서 DB에 다 올라왔을 때 Editor 탭에서 내용이 보여지게 하고 아니면 로딩 화면을 띄워줘").
//   준비하는 동안은 editorPrep 이 서 있어 화면은 기다리는 카드를 보이고 편집 상태를 저장하지 않는다.
//   약속: tests/editor/first-open.test.ts
import { saveEditorNow, selectTimelineLayout, useEditorStore } from '@/stores/editor-store'

/** 처음 열 때 소리 나누기(실제 길이 재기 + 파형 채우기)를 기다리는 한도 — 넘으면 편집 화면을 먼저 열고 남은 파형은 뒤이어 채운다. */
export const AUDIO_SPLIT_LIMIT_MS = 30_000
/** 다 나눈 결과를 서버에 저장하는 답을 기다리는 한도 — 넘거나 실패해도 편집 화면은 연다(서버 저장은 뒤에서 다시 시도한다). */
export const FIRST_SAVE_WAIT_MS = 10_000
/** 영상 길이 재기 · 파형 받기(영상 파일 전체)를 한 번에 몇 개까지 할지 — 한꺼번에 다 받으면 연결과 메모리를 한꺼번에 쓴다(검토 A E6). */
export const EDITOR_FETCH_LIMIT = 4

type Decoded = { durationSec: number; peaks: number[] }

export interface FinishEditorOpenInput {
  projectId: string | null
  /** loadPersisted 가 이 브라우저에 저장한 편집을 되살렸는가. */
  restored: boolean
  /** 화면이 닫혔거나 처음부터 다시 읽기로 바뀌었는가 — 그러면 더 바꾸거나 저장하지 않는다. */
  isCancelled: () => boolean
  /** 오디오 클립 이름(예: "MS 오디오"). */
  audioName: (shotType: string | undefined) => string
  /** 영상 실제 길이 재기(#d11) — 화면(page.tsx)이 영상 머리만 받아 재고 store 에 적는다. 다 재면 끝난다. */
  measureClips: () => Promise<void>
  decodeAudio: (url: string) => Promise<Decoded>
}

/** 정한 때까지만 기다린다 — 끝났으면 true, 한도에 걸렸으면 false. */
function within(work: Promise<unknown>, deadline: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const limit = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), Math.max(0, deadline - Date.now()))
  })
  return Promise.race([work.then(() => true, () => true), limit]).finally(() => clearTimeout(timer))
}

/** 일을 한 번에 limit 개까지만 돌린다 — 하나가 실패해도 나머지는 이어 간다. */
export async function runLimited<T>(items: readonly T[], limit: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const lane = async () => {
    while (next < items.length) {
      const item = items[next++]
      await work(item).catch(() => {})
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane))
}

/** 오디오 클립의 파형을 채운다(파형 칸 · 실제 소리 길이만) — 사람이 옮기거나 자른 자리는 그대로 둔다. */
function fillPeaks(clips: readonly { id: string; url: string }[], input: FinishEditorOpenInput, onDone?: () => void): Promise<void> {
  return runLimited(clips, EDITOR_FETCH_LIMIT, async ({ id, url }) => {
    try {
      const { durationSec, peaks } = await input.decodeAudio(url)
      if (input.isCancelled() || !(durationSec > 0)) return
      useEditorStore.getState().updateAudioClip(id, { peaks, sourceDurationSec: durationSec })
    } catch {
      // 무음 · CORS → 파형만 생략(소리는 재생된다)
    } finally {
      onDone?.()
    }
  })
}

export async function finishEditorOpen(input: FinishEditorOpenInput): Promise<'opened' | 'split' | 'split-late' | 'cancelled' | 'failed'> {
  try {
    return await openSteps(input)
  } catch (err) {
    // 여는 길 어디서든 예외가 나면 준비 표시를 내려 편집 화면을 연다 — 기다리는 카드가 끝나지 않았다(검토 A E3).
    console.error('[editor] opening failed:', err)
    if (!input.isCancelled()) useEditorStore.getState().setEditorPrep(null)
    return 'failed'
  }
}

async function openSteps(input: FinishEditorOpenInput): Promise<'opened' | 'split' | 'split-late' | 'cancelled'> {
  const { projectId, isCancelled } = input
  const store = useEditorStore
  // 화면을 떠났으면 준비 표시를 그대로 둔다 — 반쯤 된 상태를 저장하지 않고, 다음에 열 때 처음부터 다시 준비한다.
  if (isCancelled()) return 'cancelled'
  if (input.restored || !projectId || store.getState().shots.length === 0) {
    // 다시 들어옴(저장한 편집을 되살림) · 샷 없음: 바로 연다. 실제 길이 재기는 화면 뒤에서(예전 그대로).
    store.getState().setEditorPrep(null)
    // 옛 형식(1판) 저장본을 처음 새 형식으로 옮기는 열기는 잰 길이를 붙은 줄 그대로 맞춘다 — 옛 화면이 보이던 자리 그대로(검토 c 낮음 2).
    //   그사이 사람이 만든 빈 곳은 그대로 둔다. 새 형식 저장본은 잰 길이가 달라도 뒤 클립이 제자리에 머문다.
    if (store.getState().restoredOldFormat) {
      store.setState({ firstOpenMeasuring: true })
      void input.measureClips().finally(() => store.setState({ firstOpenMeasuring: false }))
    } else {
      void input.measureClips()
    }
    // 30초를 넘겨 먼저 연 뒤 파형이 덜 찬 채 떠난 오디오는 열고 나서 뒤에서 채운다(검토 A E5).
    const bare = store.getState().audioClips.filter((a) => a.url && !a.peaks?.length).map((a) => ({ id: a.id, url: a.url }))
    if (bare.length) void fillPeaks(bare, input)
    return 'opened'
  }

  // 처음 열기 — 한도 안에서 실제 길이 재기 → 그 자리에 영상마다 소리 놓기(영상은 소리 없이 재생, 소리는 오디오 칸) → 파형 채우기.
  const deadline = Date.now() + AUDIO_SPLIT_LIMIT_MS
  // 놓기 전이라 잰 길이는 붙은 줄 그대로 맞춘다 — 빈 곳을 만들지 않는다(자유 배치, 2026-11-14). 놓은 뒤 잰 길이는 뒤 클립이 제자리에 머문다.
  store.setState({ firstOpenMeasuring: true })
  try {
    await within(input.measureClips(), deadline)
  } finally {
    store.setState({ firstOpenMeasuring: false })
  }
  if (isCancelled()) return 'cancelled'

  const st = store.getState()
  const trackId = st.audioTracks[0]?.id
  const created: { id: string; url: string }[] = []
  for (const item of selectTimelineLayout(st)) {
    const src = st.videoClips.find((c) => c.shotId === item.shotId)
    if (!src?.url) continue
    const shot = st.shots.find((s) => s.shotId === item.shotId)
    const id = store.getState().addAudioClip({
      name: input.audioName(shot?.shotType),
      url: src.url,
      startSec: item.startSec,
      durationSec: item.durationSec,
      peaks: [],
      sourceOffsetSec: 0,
      sourceDurationSec: item.durationSec,
      trackId,
      // 영상 클립에 잇는다 — 영상을 숨기 · 자르기 · 옮기기 · 속도를 바꾸면 소리도 같이 움직인다(오너 2026-11-10 결정 4).
      linkedShotId: item.shotId,
    })
    created.push({ id, url: src.url })
  }

  let done = 0
  store.getState().setEditorPrep({ done, total: created.length })
  const decoding = fillPeaks(created, input, () => {
    done += 1
    // 한도를 넘겨 먼저 열었으면 진행 표시를 다시 세우지 않는다.
    if (!isCancelled() && store.getState().editorPrep) store.getState().setEditorPrep({ done, total: created.length })
  })
  const finished = await within(decoding, deadline)
  if (isCancelled()) return 'cancelled'

  // 처음 놓은 소리는 사람이 고친 것이 아니다 — 되돌리기 칸에 남기지 않고, 마지막에 놓은 소리 조각도 고르지 않은 채 연다(2단계 ②).
  store.setState({ past: [], future: [], selectedAudioId: null, selectedAudioIds: [] })
  await within(saveEditorNow(projectId), Date.now() + FIRST_SAVE_WAIT_MS)
  if (isCancelled()) return 'cancelled'
  store.getState().setEditorPrep(null)
  return finished ? 'split' : 'split-late'
}
