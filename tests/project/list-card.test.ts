// 프로젝트 목록 머리와 카드 — 머리에 큰 Lumi 없이, 카드마다 단계 이름 앞에 그 단계 색 점(11/5 시안 R2, 오너 2026-11-09 추천대로)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { projectStageDot } from '@/features/projects/project-list'

const page = () => readFileSync('src/app/projects/page.tsx', 'utf8')

describe('프로젝트 목록 머리와 카드', () => {
  // 왜: 시안 R2 머리는 제목 · 전체 수 · 찾기 · 정렬뿐이다. 프로젝트가 하나도 없을 때의 첫 화면은 Lumi 가 맞는다.
  it('프로젝트 목록 머리에는 큰 Lumi 를 두지 않고, 프로젝트가 없을 때만 첫 화면에 Lumi 를 둔다', () => {
    const source = page()
    expect(source.match(/<Lumi\b/g)).toHaveLength(1)
    const empty = source.slice(source.indexOf('projects.length === 0 ? ('), source.indexOf("{t('Create your first project')}"))
    expect(empty).toContain('<Lumi ')
  })

  // 왜: 카드만 보고 어느 단계까지 왔는지 색으로 바로 가른다 — 점 색은 단계 이름표와 같은 화면 이름 색이다.
  it('프로젝트 카드는 단계 이름 앞에 그 단계 색 점을 붙인다', () => {
    expect(projectStageDot('entry')).toBe('bg-stage-producer')
    expect(projectStageDot('producer')).toBe('bg-stage-writer')
    expect(projectStageDot('artist')).toBe('bg-stage-artist')
    expect(projectStageDot('writer')).toBe('bg-stage-storyboard')
    expect(projectStageDot('director')).toBe('bg-stage-director')
    expect(projectStageDot('editor')).toBe('bg-stage-editor')
    // 단계 값이 없거나 모르는 값이면 이름표처럼 Producer 로 본다.
    expect(projectStageDot(null)).toBe('bg-stage-producer')
    expect(projectStageDot('unknown')).toBe('bg-stage-producer')
    expect(page()).toContain('projectStageDot(project.current_stage)')
  })
})
