// Director 노드 보기의 카드를 ⌘/Ctrl+클릭하면 채팅 고르기 목록과 같은 @이름이 들어가고 다른 탭과 같은 비행이 나며, 카드 고르기 · 캔버스 선택은 일어나지 않는지 검사한다 (오너 D9 2026-11-22)
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const held = vi.hoisted(() => ({ value: false }))
vi.mock('@xyflow/react', () => ({ Handle: () => null, Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' } }))
vi.mock('@/hooks/use-modifier-held', () => ({ useModifierHeld: () => held.value }))
vi.mock('@/lib/i18n', async () => {
  const { translate } = await import('@/lib/i18n/translate')
  return { translate, useT: () => (text: string, params?: Record<string, string | number>) => translate('ko', text, params) }
})

import { sceneShotMentions } from '@/lib/card-mention'
import { BaseNode } from '@/features/director/canvas-nodes/BaseNode'
import { boardNodeNames, directorMentionTargets, directorNodeLabel, realMentionLabel } from '@/features/director/node-label'
import type { DirectorNode } from '@/types/director'

const names = boardNodeNames({ scenes: [{ sceneId: 'sc_01' }, { sceneId: 'sc_02' }] }, [
  { shotId: 'sh_01_01', sceneId: 'sc_01' },
  { shotId: 'sh_02_01', sceneId: 'sc_02' },
  { shotId: 'sh_02_02', sceneId: 'sc_02' },
], 'ko')
const nodes = [
  { id: 'S2', data: { kind: 'scene', label: 'sc_02', writerSceneId: 'sc_02' } },
  { id: 'b2', data: { kind: 'shot', label: 'sh_02_02', writerShotId: 'sh_02_02', parentSceneNodeId: 'S2' } },
] as unknown as DirectorNode[]

const source = (file: string) => readFileSync(file, 'utf8')

describe('노드 멘션 이름', () => {
  it('샷 카드 · 그 샷의 Take 카드를 ⌘/Ctrl+클릭하면 채팅 고르기 목록과 같은 "@실사 샷 N" 이 들어간다', () => {
    // 왜: 입력칸의 @이름이 고르기 목록(global-chat 의 Director 목록)과 같아야 채팅이 어느 샷인지 알아보고 강조한다(혼자 정한 것 h20).
    //   Take 는 Director 채팅이 샷 번호로만 부르므로 그 샷의 이름을 넣는다.
    const listed = sceneShotMentions(directorMentionTargets(nodes, names), 'real', 'ko').find((item) => item.ref === 'real:shot:b2')!.label
    expect(realMentionLabel('shot', 'b2', directorNodeLabel(nodes[1]!.data, names), 'ko')).toBe(listed)
    expect(listed).toBe('실사 샷 3')
    expect(source('src/features/director/canvas-nodes/ShotNode.tsx')).toMatch(/mention=\{/)
    expect(source('src/features/director/canvas-nodes/VideoNode.tsx')).toMatch(/realMentionLabel\('shot', parentShotId/)
  })

  it('씬 단추 · 인물 · 배경 카드도 멘션되고, 샷 없는 영상 · 프롬프트 노드는 멘션하지 않는다', () => {
    // 왜: 오너 D9 "모든 탭에서" — 이름이 있는 카드는 다 멘션한다. 이름으로 부를 수 없는 카드는 입력칸을 건드리지 않는다.
    expect(realMentionLabel('scene', 'S2', directorNodeLabel(nodes[0]!.data, names), 'ko')).toBe('실사 씬 2')
    expect(source('src/features/director/canvas-nodes/AssetNode.tsx')).toMatch(/mention=\{data\.label\}/)
    expect(source('src/features/director/canvas-nodes/VideoNode.tsx')).toMatch(/parentShotId && parentShotTitle \? realMentionLabel/)
    expect(source('src/features/director/canvas-nodes/PromptNode.tsx')).not.toMatch(/mention=/)
  })
})

describe('노드 ⌘/Ctrl+클릭', () => {
  it('⌘/Ctrl+클릭은 카드 뿌리에서 캡처 단계로 끊고 다른 탭과 같은 길(방향 보기 → 멘션 토글 → 비행)을 부른다', () => {
    // 왜: 끊지 않으면 노드 고르기(샷 고름) · 캔버스 여러 개 선택 · 끌기가 같이 일어난다(지금 ⌘/Ctrl+클릭은 xyflow 여러 개 고르기였다). 비행은 Producer 와 같은 길(오너 D9 "애니메이션도 동일하게").
    const base = source('src/features/director/canvas-nodes/BaseNode.tsx')
    expect(base).toMatch(/onPointerDownCapture=/)
    expect(base).toMatch(/onClickCapture=/)
    expect(base).toMatch(/const removing = chatInputHasMention\(mention\)/)
    expect(base).toMatch(/requestMentionToggle\(mention\)/)
    expect(base).toMatch(/launchMentionFlight\(\{ label: mention, clickX: event\.clientX, clickY: event\.clientY, toChat: !removing \}\)/)
  })

  it('⌘/Ctrl 을 누르고 있으면 멘션되는 카드 위에서 복사 커서가 보이고, 멘션 이름이 없는 카드는 그대로다', () => {
    // 왜: 이 카드가 멘션된다는 것을 누르기 전에 알린다(Producer 카드와 같은 신호, 혼자 정한 것 h21).
    held.value = true
    try {
      const withName = renderToStaticMarkup(createElement(BaseNode, { id: 'b2', theme: 'shot', title: '샷 3', mention: '실사 샷 3' }))
      const without = renderToStaticMarkup(createElement(BaseNode, { id: 'p1', theme: 'shot', title: 'Prompt' }))
      expect(withName).toMatch(/^<div class="[^"]*cursor-copy/)
      expect(without).not.toMatch(/cursor-copy/)
    } finally {
      held.value = false
    }
  })
})
