import { describe, expect, it } from 'vitest'
import {
  classifyMediaObject,
  projectIdOfPath,
  type ClassifyContext,
} from '@/lib/storage/migration-plan'

const WS = 'ce053575-62d5-4c8d-898f-34a1a5c6b40b'
const LIVE = '9d6efa6d-3216-40b0-8a2c-184ab56f02ec'
const DEAD = '00000000-0000-4000-8000-000000000000'
const TEST_PROJECT = 'a003a8c6-82a1-4b6a-95d6-889a1f57ee08'

const ctx: ClassifyContext = {
  liveProjectIds: new Set([LIVE, TEST_PROJECT]),
  testProjectIds: new Set([TEST_PROJECT]),
}

const verdict = (path: string) => classifyMediaObject(path, ctx).disposition

describe('projectIdOfPath', () => {
  it('작업공간/프로젝트 형태에서 프로젝트 id를 꺼낸다', () => {
    expect(projectIdOfPath(`${WS}/${LIVE}/shots/a.png`)).toBe(LIVE)
  })

  it('공용 자산 경로는 null', () => {
    expect(projectIdOfPath('templates/rough-storyboard-grid-abc.png')).toBeNull()
    expect(projectIdOfPath('style-anchors/watercolor.png')).toBeNull()
    expect(projectIdOfPath(`${WS}/inventory/item-1.png`)).toBeNull()
  })
})

describe('classifyMediaObject', () => {
  it('화면에 쓰이는 결과물은 옮긴다', () => {
    expect(verdict(`${WS}/${LIVE}/shots/v1-abc_rough_start.png`)).toBe('migrate')
    expect(verdict(`${WS}/${LIVE}/characters/v1-abc_portrait.png`)).toBe('migrate')
    expect(verdict(`${WS}/${LIVE}/videos/clip-1/job-1.mp4`)).toBe('migrate')
  })

  it('작은 그림도 같이 옮긴다 — 다시 만들려면 원본과 변환 도구가 필요하다', () => {
    expect(verdict(`${WS}/${LIVE}/shots/v1-abc_rough_start_thumb.webp`)).toBe('migrate')
  })

  it('공용 자산은 프로젝트와 무관하게 옮긴다', () => {
    expect(verdict('templates/rough-storyboard-grid-abc123.png')).toBe('migrate')
    expect(verdict('style-anchors/watercolor.png')).toBe('migrate')
    expect(verdict(`${WS}/inventory/item-1.png`)).toBe('migrate')
  })

  it('생성용 임시 시트는 옮기지 않는다', () => {
    expect(verdict(`${WS}/${LIVE}/shots/real_grid_ref_v1-abc.png`)).toBe('skip-temp')
    expect(verdict(`${WS}/${LIVE}/shots/real_grid_ref_1786970763976_sh_02_04.png`)).toBe('skip-temp')
    expect(verdict(`${WS}/${LIVE}/shots/v1-abc_storyboard_ref_strip.png`)).toBe('skip-temp')
  })

  it('임시물 판정이 시험 프로젝트 판정보다 먼저다', () => {
    // 시험 프로젝트 안에 있어도 임시물은 사람에게 물을 필요가 없다.
    expect(verdict(`${WS}/${TEST_PROJECT}/shots/real_grid_ref_v1-x.png`)).toBe('skip-temp')
  })

  it('주인 프로젝트가 없으면 옮기지 않는다', () => {
    expect(verdict(`${WS}/${DEAD}/shots/v1-abc_rough_start.png`)).toBe('skip-orphan')
  })

  it('시험·샘플 프로젝트는 사람이 정한다', () => {
    expect(verdict(`${WS}/${TEST_PROJECT}/shots/v1-abc_rough_start.png`)).toBe('review')
  })

  it('업로드 원본은 보류, 잘라낸 조각은 옮긴다', () => {
    expect(verdict(`${WS}/${LIVE}/uploads/up-1/original.png`)).toBe('review')
    expect(verdict(`${WS}/${LIVE}/uploads/up-1/s000.jpg`)).toBe('migrate')
  })

  it('앞의 슬래시가 붙어도 같은 판정', () => {
    expect(verdict(`/${WS}/${LIVE}/shots/a.png`)).toBe('migrate')
  })

  it('빈 경로는 사람이 본다', () => {
    expect(verdict('')).toBe('review')
  })

  it('판정마다 사람이 읽을 근거가 붙는다', () => {
    for (const path of [
      `${WS}/${LIVE}/shots/a.png`,
      `${WS}/${LIVE}/shots/real_grid_ref_x.png`,
      `${WS}/${DEAD}/shots/a.png`,
      `${WS}/${TEST_PROJECT}/shots/a.png`,
    ]) {
      expect(classifyMediaObject(path, ctx).reason.length).toBeGreaterThan(0)
    }
  })
})
