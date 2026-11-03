// 단계를 넘기기 전 확인 창에 지금 단계 옷을 입은 큰 Lumi가 기본 모습으로 나오는지 검사한다 (오너 2026-11-03 "큰 3D Lumi: 가이드 자리 모두 · 확인 창")
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ConfirmLumi } from '@/components/handoff/confirm-lumi'

describe('단계 넘기기 확인 창의 Lumi', () => {
  it('단계를 넘기기 전 확인 창에는 지금 단계 옷을 입은 큰 Lumi가 기본 모습으로 나온다', () => {
    // 왜: 오너 결정 8 — 큰 Lumi 는 가이드가 말한 자리 모두(확인 창 포함). 옷은 넘기기 전 지금 단계, 모습은 기본(idle).
    //   (서버 그리기 · 파일을 다 불러오기 전에는 같은 모습의 그림이라 그림 주소로 옷 · 모습을 본다.)
    expect(renderToStaticMarkup(createElement(ConfirmLumi, { stage: 'artist' }))).toContain('/lumi/full/artist-idle.webp')
    expect(renderToStaticMarkup(createElement(ConfirmLumi, { stage: 'producer' }))).toContain('/lumi/full/writer-idle.webp')
    expect(renderToStaticMarkup(createElement(ConfirmLumi, { stage: 'writer' }))).toContain('/lumi/full/storyboard-idle.webp')
  })

  it('Writer 로 넘기기 전 확정 창과 Director 로 넘기기 창이 둘 다 지금 단계로 이 Lumi 를 띄운다', () => {
    // 왜: 넘김 확인 창은 둘이다(스튜디오 레이아웃의 HandoffConfirmDialogs) — 하나만 바꾸면 창마다 모양이 갈린다.
    for (const file of ['src/components/handoff/producer-lock-dialog.tsx', 'src/components/handoff/director-readiness-dialog.tsx']) {
      expect(readFileSync(file, 'utf8'), file).toMatch(/<ConfirmLumi stage=\{currentStage\} \/>/)
    }
  })
})
