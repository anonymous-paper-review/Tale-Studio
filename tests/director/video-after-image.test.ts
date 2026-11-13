// "영상까지 이어서"를 켜고 만들면 이미지가 끝난 샷부터 영상이 저절로 시작된다 — 이 화면(브라우저)이 이어 보낸다 (시안 D4 406:5275 · R 416:4941, 오너 답 6)
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { translate } from '@/lib/i18n/translate'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { chainMissed, chainStep } from '@/lib/director/toolbar-work'
import type { DirectorShotState } from '@/lib/director/shot-state'

const ko = (text: string, params?: Record<string, string | number>) => translate('ko', text, params)
const page = () => readFileSync('src/app/studio/director/page.tsx', 'utf8')

beforeEach(() => {
  useDirectorCanvasStore.setState({ projectId: 'p1', chainVideoAfterImage: false, chainWaitingShotIds: [] })
})

describe('영상까지 이어서 스위치', () => {
  it('"영상까지 이어서"를 켜면 이미지 단추 이름이 "이미지+영상 만들기"가 된다', () => {
    // 왜: 시안 R "'영상까지 이어서'를 켜면 이미지 버튼이 '이미지+영상 만들기'로".
    expect(ko('Make images + videos')).toBe('이미지+영상 만들기')
    expect(ko('Also make videos')).toBe('영상까지 이어서')
    expect(page()).toMatch(/chainVideoAfterImage \? t\('Make images \+ videos'\)/)
  })

  it('스위치는 화면에 들어오면 꺼져 있고, 다른 프로젝트로 가면 꺼지며 기다림도 비운다', () => {
    // 왜: 돈 드는 기본값을 남기지 않는다(혼자 정한 것 c, 오너 답 6 = 브라우저가 이어 보냄).
    useDirectorCanvasStore.getState().setChainVideoAfterImage(true)
    useDirectorCanvasStore.getState().setChainWaitingShots(['a'])
    useDirectorCanvasStore.getState().setProjectId('p2')
    expect(useDirectorCanvasStore.getState().chainVideoAfterImage).toBe(false)
    expect(useDirectorCanvasStore.getState().chainWaitingShotIds).toEqual([])
  })

  it('켜 둔 채 [이미지+영상 만들기]를 누르면 먼저 영상 확인 창을 거치고, 확인하면 "이 화면을 닫으면 영상은 시작되지 않아요"를 알린다', () => {
    // 왜: Take 를 쓰니 확인을 받는다(약속 E) · 오너 답 6 "브라우저가 이어 보내고 화면을 닫으면 시작되지 않음을 알린다".
    expect(ko("If you close this screen, the videos won't start.")).toBe('이 화면을 닫으면 영상은 시작되지 않아요')
    expect(page()).toContain('setConfirmChain(true)')
    expect(page()).toContain(`toast.info(t("If you close this screen, the videos won't start."))`)
  })
})

describe('이미지가 끝나면 영상 시작', () => {
  const step = (waiting: string[], states: Record<string, DirectorShotState>, imageBusy: boolean) =>
    chainStep(waiting, new Map(Object.entries(states)), imageBusy)

  it('기다리던 샷의 이미지가 끝나면 그 샷 영상을 시작하고 기다림에서 뺀다', () => {
    // 왜: 시안 D4 "이미지가 끝나면 자동으로 시작해요".
    expect(step(['a', 'b'], { a: 'image_done', b: 'image_generating' }, true)).toEqual({ start: ['a'], drop: [], keep: ['b'] })
  })

  it('이미지가 실패하거나, 일괄이 끝났는데도 이미지가 없으면 영상을 시작하지 않고 기다림에서 뺀다', () => {
    // 왜: 쓸 그림이 없다(혼자 정한 것 b).
    expect(step(['a', 'b', 'c'], { a: 'image_failed', b: 'image_needed', c: 'image_needed' }, false)).toEqual({ start: [], drop: ['a', 'b', 'c'], keep: [] })
    expect(step(['b'], { b: 'image_needed' }, true)).toEqual({ start: [], drop: [], keep: ['b'] })
  })

  it('다른 길로 이미 영상을 만들고 있거나 영상이 있으면 다시 시작하지 않고 기다림에서 뺀다', () => {
    // 왜: 같은 샷 영상을 두 번 만들어 Take 를 두 번 쓰지 않게.
    expect(step(['a', 'b'], { a: 'video_generating', b: 'video_done' }, false)).toEqual({ start: [], drop: ['a', 'b'], keep: [] })
  })

  it('기다리는 영상 노드는 "이미지가 끝나면 자동으로 시작해요"를 보인다', () => {
    // 왜: 시안 D4 의 기다리는 영상 노드 글.
    expect(ko('Starts by itself when the image is done')).toBe('이미지가 끝나면 자동으로 시작해요')
    const videoNode = readFileSync('src/features/director/canvas-nodes/VideoNode.tsx', 'utf8')
    expect(videoNode).toContain("t('Starts by itself when the image is done')")
  })
})

describe('이어 보내기가 약속한 만큼 · 이 화면에서만', () => {
  const chainEffect = () => {
    const src = page()
    const start = src.indexOf('useEffect(() => {\n    if (chainWaitingShotIds.length === 0) return')
    return src.slice(start, start + 1200)
  }

  it('이미지가 끝난 샷의 영상은 서버 영상 묶음으로 한꺼번에 보내, 사람당 한도를 넘는 샷도 묶음이 차례로 낸다', () => {
    // 왜: 한 샷씩 바로 보내면 한도(기본 3)를 넘은 샷이 거절되고 Take 노드가 지워진 채 기다림에서 빠졌다 —
    //   확인 창이 말한 수보다 적게 만들어졌다(리드 검토 a S5 보통 3).
    expect(chainEffect()).toContain('void runVideoBatch(pid, { shotIds: step.start })')
    expect(chainEffect()).not.toContain('generateVideoForShot')
  })

  it('영상 묶음이 이미 돌고 있으면 이미지가 끝난 샷도 기다림에 남겨 두고, 묶음이 끝나면 보낸다', () => {
    // 왜: 묶음이 도는 중에 보내면 말없이 무시됐다(리드 검토 a S5 보통 3).
    expect(chainStep(['a', 'b'], new Map([['a', 'image_done'], ['b', 'image_generating']]), true, undefined, true)).toEqual({ start: [], drop: [], keep: ['a', 'b'] })
    expect(chainEffect()).toContain('chainStep(chainWaitingShotIds, shotStates, realBatchBusy, resumeWaitingNodeIds, videoBatchBusy)')
  })

  it('스위치를 끄면 이어 보내기 기다림도 비우고, 기다리는 샷이 있으면 이미지 일이 없어도 스위치를 끌 수 있다', () => {
    // 왜: 스위치를 꺼도 기다림이 남아 영상이 시작됐다(리드 검토 a S5 보통 4). 만드는 중에는 이미지 일이 0 이라 스위치가 꺼져 있었다.
    useDirectorCanvasStore.getState().setChainVideoAfterImage(true)
    useDirectorCanvasStore.getState().setChainWaitingShots(['a'])
    useDirectorCanvasStore.getState().setChainVideoAfterImage(false)
    expect(useDirectorCanvasStore.getState().chainWaitingShotIds).toEqual([])
    expect(page()).toContain("disabled={(imageMode.mode !== 'make' || imageWork.length === 0) && chainWaitingShotIds.length === 0}")
  })

  it('Director 화면을 떠나면 이어 보내기 기다림을 비우고 스위치를 끈다', () => {
    // 왜: 기다림이 남아 있다가 나중에 돌아오면 그사이 끝난 이미지의 영상이 확인 없이 시작됐다 —
    //   "이 화면을 닫으면 영상은 시작되지 않아요"와 어긋났다(리드 검토 a S5 보통 4).
    const src = page()
    const cleanup = src.slice(src.indexOf('export default function DirectorCanvasPage'), src.indexOf('export default function DirectorCanvasPage') + 1500)
    expect(cleanup).toContain('useDirectorCanvasStore.getState().setChainVideoAfterImage(false)')
  })

  it('[모두 멈추기]는 이어 보내기 기다림도 비운다', () => {
    // 왜: 멈춘 뒤에도 이미 보낸 이미지가 끝나면 그 영상이 시작됐다(Take) — 오너 답 7 "아직 보내지 않은 것은 보내지 않는다"(리드 검토 a 보통 6).
    const src = page()
    const stopAll = src.slice(src.indexOf('const stopAll = async () => {'), src.indexOf('const stopAll = async () => {') + 700)
    expect(stopAll).toContain('run.setChainWaitingShots([])')
  })

  it('Take 가 없어도 [이미지+영상 만들기]는 이미지를 만들고, 영상은 Take 가 없어 못 만든다고 알린다', () => {
    // 왜: Take 가 0 이면 이미지도 만들지 않고 경고만 떴다 — 이미지는 Take 를 쓰지 않는다(리드 검토 a 낮음 9).
    const src = page()
    const confirm = src.slice(src.indexOf('open={confirmChain}'), src.indexOf('open={confirmChain}') + 1200)
    expect(confirm).toMatch(/if \(chainPlan\.runCount === 0\) \{\s*toast\.warning\(t\('No videos can be made until you add Takes\.'\)\)\s*startImages\(\)\s*return\s*\}/)
  })

  it('좁은 화면에서 스위치 글자가 숨어도 스위치 이름을 읽을 수 있다', () => {
    // 왜: 글자를 숨기면 화면 읽기가 이름 없는 스위치를 읽었다(리드 검토 a 낮음 9).
    expect(page()).toMatch(/role="switch"\s*aria-checked=\{chainVideoAfterImage\}\s*aria-label=\{t\('Also make videos'\)\}/)
  })

  it('이미지를 못 만들어 영상을 시작하지 못한 샷이 있으면 몇 개인지 알린다', () => {
    // 왜: 확인 창이 약속한 영상이 말없이 빠지면 안 된다. 다른 길로 영상이 생긴 샷은 알리지 않는다.
    expect(chainMissed(['a', 'b', 'c'], new Map([['a', 'image_failed'], ['b', 'image_needed'], ['c', 'video_done']]))).toEqual(['a', 'b'])
    expect(ko("{count} videos didn't start because their images weren't made.", { count: 2 })).toBe('이미지를 못 만들어 영상 2개는 시작하지 않았어요')
    expect(chainEffect()).toContain("countText(t, missed.length, \"1 video didn't start because its image wasn't made.\", \"{count} videos didn't start because their images weren't made.\", { count: missed.length })")
  })
})
