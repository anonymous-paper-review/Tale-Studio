// Tale 로고 묶음(v3 Logo/Tale Lockup) — 심볼(public/brand/tale-symbol.svg, 11/5 새 심볼) + 글자 "tale studio"(Pretendard 800, 자간 좁게).
//   어두운 바탕용 하나. 심볼의 색 · 기울기 · 겹침은 바꾸지 않는다(브랜드 가이드 "로고 쓰는 법"). 대시보드 머리 · 랜딩 머리 · 꼬리말에 쓴다.
//   글자는 "Tale Studio" 로 쓰고 모양만 소문자(lowercase) — 화면 읽기 · 문구 규칙(영어 첫 글자 대문자)은 고유명 그대로.
import { cn } from '@/lib/utils'

/** size = 심볼 틀 높이(px, 11/5 시안: 로그인 32 · 홈 36 · 프로젝트 목록 26). 틀은 225:198 이고 그림자 자리를 품는다.
 *  글자 크기 · 사이는 시안 비율(틀 26 : 글자 14.4 · 사이 4.25)을 따른다. */
export function TaleLockup({ size = 28, className }: { size?: number; className?: string }) {
  const symbolWidth = Math.round((size * 225) / 198)
  return (
    <span className={cn('inline-flex items-center', className)} style={{ gap: Math.round(size * 0.16) }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- 작은 심볼 SVG, 최적화 불필요 */}
      <img src="/brand/tale-symbol.svg" alt="" width={symbolWidth} height={size} draggable={false} style={{ width: symbolWidth, height: size }} />
      <span className="font-extrabold lowercase leading-none tracking-[-0.03em] text-foreground" style={{ fontSize: Math.round(size * 0.555) }}>
        Tale Studio
      </span>
    </span>
  )
}
