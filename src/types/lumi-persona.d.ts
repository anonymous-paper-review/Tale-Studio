// <lumi-persona> 태그 타입(Lumi 개발 가이드 global.d.ts) — public/lumi-persona.js 가 정의하는 웹 컴포넌트.
//   쓰는 곳은 components/lumi/lumi.tsx 한 곳이다(파일을 늦게 불러오고, 동작 줄이기 · WebGL 없음을 거기서 처리한다).
import type { DetailedHTMLProps, HTMLAttributes } from 'react'
import type { LumiPersona, LumiState, LumiVariant } from '@/lib/lumi'

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- JSX 내장 태그 목록은 이 이름공간을 넓혀야 한다.
  namespace JSX {
    interface IntrinsicElements {
      'lumi-persona': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        persona?: LumiPersona
        state?: LumiState
        variant?: LumiVariant
        /** 있기만 하면 멈춘다(속성 존재로 판정) — 빈 문자열로 붙이고, 없앨 때는 undefined. */
        paused?: boolean | ''
      }
    }
  }
}
