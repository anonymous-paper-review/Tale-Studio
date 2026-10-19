// 홈 · 프로젝트 목록에서 프로젝트를 누르면 그 단계의 화면으로 열고, 단계 이름표는 새 화면 이름으로 보인다 (리뉴얼 1차 검토 2026-10-19)
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { STAGES } from '@/lib/constants'
import { projectOpenPath, projectStageLabel } from '@/lib/project/open-path'

describe('목록에서 프로젝트 열기', () => {
  it('홈 목록에서 아직 시작하지 않은 프로젝트를 누르면 Producer 시작 화면으로 연다', () => {
    // 왜: 새 프로젝트의 단계 값은 entry 인데 주소를 단계 값으로 만들면 없는 화면(/studio/entry)이 열린다 — 만들고 나갔다가 홈에서 다시 누른 사람이 길을 잃는다.
    expect(projectOpenPath('entry', 'p1')).toBe('/studio/start?projectId=p1')
  })

  it('Writer · Artist · Storyboard 단계 프로젝트는 각자의 화면으로 연다', () => {
    // 왜: 정상 경로 고정 — 단계 값과 화면 주소가 다른 단계(Writer = producer, Storyboard = writer)도 제 화면으로 간다.
    expect(projectOpenPath('producer', 'p1')).toBe('/studio/producer?projectId=p1')
    expect(projectOpenPath('artist', 'p1')).toBe('/studio/artist?projectId=p1')
    expect(projectOpenPath('writer', 'p1')).toBe('/studio/writer?projectId=p1')
  })

  it('모르는 단계 값이면 Producer 시작 화면으로 연다', () => {
    // 왜: 예전 데이터에 남은 이상한 단계 값으로 없는 화면을 열지 않는다.
    expect(projectOpenPath('meeting-room', 'p1')).toBe('/studio/start?projectId=p1')
  })

  it('모든 단계의 주소에는 실제 화면이 있다', () => {
    // 왜: 단계 표의 주소가 화면과 어긋나면 그 단계로 가는 모든 버튼이 없는 화면을 연다.
    for (const stage of STAGES) expect(existsSync(`src/app${stage.path}/page.tsx`), stage.path).toBe(true)
  })

  it('홈과 프로젝트 목록은 단계 값으로 주소를 직접 만들지 않는다', () => {
    // 왜: 홈만 따로 주소를 만들다가 새 단계(entry)를 빠뜨렸다(검토 지적) — 두 목록이 같은 규칙 하나로 연다.
    for (const file of ['src/app/page.tsx', 'src/app/projects/page.tsx']) {
      const source = readFileSync(file, 'utf8')
      expect(source, file).not.toMatch(/\/studio\/\$\{/)
      expect(source, file).toContain('projectOpenPath')
    }
  })
})

describe('목록의 단계 이름표', () => {
  it('홈 목록의 단계 이름표는 새 화면 이름으로 보인다', () => {
    // 왜: 단계 값은 예전 이름(producer = Writer, writer = Storyboard)이라 그대로 보이면 사람이 엉뚱한 단계로 읽는다.
    expect(projectStageLabel('entry')).toBe('Producer')
    expect(projectStageLabel('producer')).toBe('Writer')
    expect(projectStageLabel('artist')).toBe('Artist')
    expect(projectStageLabel('writer')).toBe('Storyboard')
    expect(projectStageLabel('director')).toBe('Director')
  })

  it('단계 값이 없거나 모르는 값이면 Producer 로 보인다', () => {
    // 왜: 이름표가 비거나 이상한 글자로 보이지 않게 한다 — 그런 프로젝트는 Producer 시작 화면으로 열린다.
    expect(projectStageLabel(null)).toBe('Producer')
    expect(projectStageLabel('meeting-room')).toBe('Producer')
  })
})
