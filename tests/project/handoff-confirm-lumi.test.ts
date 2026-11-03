// 단계를 넘기기 전 확인 창에 지금 단계 옷을 입은 큰 Lumi가 기본 모습으로 나오는지 검사한다 (오너 2026-11-03 "큰 3D Lumi: 가이드 자리 모두 · 확인 창")
import { readFileSync } from 'node:fs'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

// 창은 열려 있을 때 내용을 그대로 그린다(정적 렌더에는 창 겉껍데기가 없다 — card-version-badge 와 같은 방법).
vi.mock('@/components/ui/dialog', async () => {
  const { createElement: h } = await import('react')
  type Props = { children?: ReactNode; className?: string; open?: boolean }
  const plain = (tag: string) => ({ children, className }: Props) => h(tag, { className }, children)
  return {
    Dialog: ({ open, children }: Props) => (open ? children : null),
    DialogContent: plain('div'),
    DialogHeader: plain('div'),
    DialogFooter: plain('div'),
    DialogTitle: plain('h2'),
    DialogDescription: plain('p'),
  }
})

import { ConfirmLumi } from '@/components/handoff/confirm-lumi'
import { RegenerateConfirmDialog } from '@/features/director/regenerate-confirm-dialog'

describe('단계 넘기기 확인 창의 Lumi', () => {
  it('단계를 넘기기 전 확인 창에는 지금 단계 옷을 입은 큰 Lumi가 기본 모습으로 나온다', () => {
    // 왜: 오너 결정 8 — 큰 Lumi 는 가이드가 말한 자리 모두(확인 창 포함). 옷은 넘기기 전 지금 단계, 모습은 기본(idle).
    //   (서버 그리기 · 파일을 다 불러오기 전에는 같은 모습의 그림이라 그림 주소로 옷 · 모습을 본다.)
    expect(renderToStaticMarkup(createElement(ConfirmLumi, { stage: 'artist' }))).toContain('/lumi/full/artist-idle.webp')
    expect(renderToStaticMarkup(createElement(ConfirmLumi, { stage: 'producer' }))).toContain('/lumi/full/writer-idle.webp')
    expect(renderToStaticMarkup(createElement(ConfirmLumi, { stage: 'writer' }))).toContain('/lumi/full/storyboard-idle.webp')
  })

  it('Director 에서 다시 만들기 · 영상 만들기를 묻는 확인 창에도 지금 단계(Director) 옷의 같은 Lumi 가 나온다', () => {
    // 왜: 검토 B B5 — 이 창만 큰 Lumi 를 따로 그려 크기 · 자리가 다른 확인 창과 어긋날 수 있었다. 확인 창 Lumi 는 한 곳(ConfirmLumi)이 정한다.
    const out = renderToStaticMarkup(createElement(RegenerateConfirmDialog, {
      open: true, onOpenChange: () => {}, title: 'Regenerate every storyboard image?', description: '', impact: [], confirmLabel: 'Regenerate', onConfirm: () => {},
    }))
    expect(out).toContain('data-testid="confirm-lumi"')
    expect(out).toContain('/lumi/full/director-idle.webp')
    expect(readFileSync('src/features/director/regenerate-confirm-dialog.tsx', 'utf8')).toMatch(/<ConfirmLumi stage="director" \/>/)
  })

  it('Writer 로 넘기기 전 확정 창과 Director 로 넘기기 창이 둘 다 지금 단계로 이 Lumi 를 띄운다', () => {
    // 왜: 넘김 확인 창은 둘이다(스튜디오 레이아웃의 HandoffConfirmDialogs) — 하나만 바꾸면 창마다 모양이 갈린다.
    for (const file of ['src/components/handoff/producer-lock-dialog.tsx', 'src/components/handoff/director-readiness-dialog.tsx']) {
      expect(readFileSync(file, 'utf8'), file).toMatch(/<ConfirmLumi stage=\{currentStage\} \/>/)
    }
  })
})
