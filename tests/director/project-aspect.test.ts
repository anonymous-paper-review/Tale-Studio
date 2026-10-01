// 이 파일이 검사하는 동작: Producer 에서 정한 화면비(세로 9:16 등)를 Director 의 실사 이미지·영상 생성과 노드 뷰·스토리보드 뷰 화면이 그대로 따른다 (2026-09-30 오너 지시).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { mediaFrameStyle, videoAspectRatioFromFormat } from '@/lib/project-aspect'

const read = (rel: string) => readFileSync(rel, 'utf8')

describe('생성 — 영상과 실사 이미지의 화면비', () => {
  // 왜: 영상 모델은 16:9·9:16·1:1 만 받는다. 시네마(2.39:1)를 그대로 보내면 제출이 깨지므로 지금처럼 16:9 로 보낸다.
  it('Producer 포맷이 세로면 영상은 9:16, 정사각이면 1:1, 가로·시네마면 16:9 로 보낸다', () => {
    expect(videoAspectRatioFromFormat('vertical_9:16')).toBe('9:16')
    expect(videoAspectRatioFromFormat('square_1:1')).toBe('1:1')
    expect(videoAspectRatioFromFormat('horizontal_16:9')).toBe('16:9')
    expect(videoAspectRatioFromFormat('cinema_2.39:1')).toBe('16:9')
    // 포맷이 없는 옛 프로젝트는 판단하지 않는다(호출부가 종전 값으로 대비).
    expect(videoAspectRatioFromFormat(null)).toBeNull()
  })

  // 왜: 실측(2026-09-30 script_test): 세로 프로젝트인데 영상이 1280×720 가로로 나왔다. 화면이 16:9 를 박아 보냈고 서버가 그대로 썼다.
  it('영상 서버는 화면이 보낸 비율보다 프로젝트 포맷을 따르고, 포맷이 없는 옛 프로젝트만 화면 값을 쓴다', () => {
    const submit = read('src/lib/director/video-submit.ts')
    expect(submit).toMatch(/from\('projects'\)\.select\('[^']*settings[^']*'\)/)
    expect(submit).toMatch(/videoAspectRatioFromFormat\(/)
    // 제출 요청과 기록 스냅샷이 같은 값을 쓴다 — 요청 본문의 aspectRatio 를 직접 쓰는 곳이 남아 있으면 안 된다.
    expect(submit).not.toMatch(/aspectRatio \?\? '16:9'/)
  })

  // 왜: 서버가 정하므로 화면이 16:9 를 박아 보낼 이유가 없다. 남아 있으면 포맷 없는 경로에서 다시 가로로 샌다.
  it('Director 화면은 영상 요청(단건·일괄)에 16:9 를 박아 보내지 않는다', () => {
    const store = read('src/stores/director-store.ts')
    const batch = read('src/lib/director/video-batch-inputs.ts')
    expect(batch).not.toMatch(/aspectRatio: '16:9'/)
    // 단건 영상 요청 본문(generationMethod 옆)에 16:9 고정값이 없다.
    expect(store).not.toMatch(/aspectRatio: '16:9',\s*\n\s*generationMethod:/)
  })

  // 왜: 실측: 노드 뷰에서 새로 만든 수동 샷("New Shot")의 실사 이미지가 16:9 로 나갔다(Writer 샷은 서버가 이미 포맷을 따랐다).
  it('노드 뷰의 수동 샷 실사 이미지는 프로젝트 포맷의 비율로 만든다', () => {
    // 화면은 비율을 계산하지 않고 "프로젝트 비율로" 표시만 보낸다 — 서버가 Producer 포맷을 읽는다(아래 라우트 테스트).
    const store = read('src/stores/director-store.ts')
    expect(store).toMatch(/aspectFromProject: true,/)
    expect(store).not.toMatch(/prompt,\s*\n\s*aspectRatio: '16:9',\s*\n\s*referenceImageUrls,/)
    const route = read('src/app/api/generate/image/route.ts')
    expect(route).toMatch(/aspectFromProject === true \? shotImageAspectRatio\(/)
  })
})

describe('화면 — 노드 뷰와 스토리보드 뷰의 틀', () => {
  // 왜: 가로 프로젝트는 지금 모양이 맞다. 새 틀은 가로가 아닌 포맷에만 적용해 기존 화면을 바꾸지 않는다.
  it('가로(16:9) 프로젝트와 포맷을 모르는 프로젝트의 화면 틀은 지금과 같다', () => {
    expect(mediaFrameStyle('horizontal_16:9')).toBeNull()
    expect(mediaFrameStyle(null)).toBeNull()
  })

  // 왜: 세로 그림을 가로 틀에 잘라 넣으면(object-cover) 가운데 띠만 보여 "16:9 로 강제된" 것처럼 보였다.
  it('세로 프로젝트의 실사 이미지·영상 틀은 세로(9:16)이고, 높이 상한이 있으면 그 안에서 가운데 정렬된다', () => {
    expect(mediaFrameStyle('vertical_9:16')).toMatchObject({ aspectRatio: '9 / 16', width: '100%' })
    const capped = mediaFrameStyle('vertical_9:16', 280)!
    expect(capped.aspectRatio).toBe('9 / 16')
    expect(capped.maxWidth).toBe('158px') // 280 × 9/16 — 높이가 280 을 넘지 않는다
    expect(capped.marginInline).toBe('auto')
    expect(mediaFrameStyle('cinema_2.39:1')).toMatchObject({ aspectRatio: '2.39 / 1' })
    expect(mediaFrameStyle('square_1:1', 200)).toMatchObject({ aspectRatio: '1 / 1', maxWidth: '200px' })
  })

  // 왜: 노드 캔버스는 샷을 560px 간격으로 쌓는다. 카드 폭(280px) 그대로 세로로 늘리면 아래 샷과 겹친다.
  it('노드 뷰의 세로 틀은 캔버스 줄 간격을 넘지 않도록 높이가 제한된다', () => {
    const node = read('src/features/director/canvas-nodes/ShotNode.tsx')
    expect(node).toMatch(/mediaFrameStyle\(projectFormat, SHOT_NODE_MEDIA_MAX_H\)/)
    const { SHOT_OFFSET_Y } = { SHOT_OFFSET_Y: 560 }
    expect(Number(node.match(/SHOT_NODE_MEDIA_MAX_H = (\d+)/)?.[1])).toBeLessThan(SHOT_OFFSET_Y / 2)
  })

  // 왜: 두 뷰가 같은 규칙을 써야 한 프로젝트 안에서 모양이 갈리지 않는다.
  it('노드 뷰와 스토리보드 뷰, 영상 창은 프로젝트 포맷으로 틀을 정한다', () => {
    for (const f of [
      'src/features/director/canvas-nodes/ShotNode.tsx',
      'src/features/director/canvas-nodes/VideoNode.tsx',
      'src/features/director/canvas-views/StoryboardGridView.tsx',
      'src/features/director/canvas-panels/VideoDetailPanel.tsx',
      'src/features/director/canvas-popups/VideoNodePopup.tsx',
    ]) {
      const src = read(f)
      expect(src, f).toMatch(/useProjectFormatStore\(\(s\) => s\.format\)/)
      expect(src, f).toMatch(/mediaFrameStyle\(/)
    }
  })

  // 왜: 상세 패널이 "16:9"를 고정 표시해 세로 프로젝트에서 틀린 정보를 보였다.
  it('샷 상세 패널의 화면비 칸은 프로젝트 비율을 보여 준다', () => {
    const panel = read('src/features/director/canvas-panels/ShotDetailPanel.tsx')
    expect(panel).not.toMatch(/value="16:9"/)
    expect(panel).toMatch(/aspectRatioFromFormat\(/)
  })

  // 왜: Director 를 URL 로 바로 열어도(Producer 화면을 안 거쳐도) 포맷을 알아야 한다.
  it('프로젝트를 열면 화면이 그 프로젝트의 포맷을 불러온다', () => {
    const store = read('src/stores/project-store.ts')
    expect(store).toMatch(/\.select\('locale, locale_locked, settings'\)/)
    expect(store).toMatch(/useProjectFormatStore\.getState\(\)\.setFormat\(parseProjectFormat\(/)
    // Producer 가 설정을 저장하면 새로고침 없이 Director 가 따라간다.
    expect(read('src/stores/producer-store.ts')).toMatch(/useProjectFormatStore\.getState\(\)\.setFormat\(producerSettings\.format/)
  })
})
