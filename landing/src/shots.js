// 실제 Tale에서 만든 이미지(Under the Same Umbrella)로 장면을 채워요.
// 예전 SVG 장면의 viewBox 키를 그대로 받아, 같은 자리에 실제 이미지의 알맞은 부분을 보여 줘요.
import a1 from '../assets/gen/artist-01.webp' // 서윤 인물 시트
import a2 from '../assets/gen/artist-02.webp' // 도현 인물 시트
import s1 from '../assets/gen/sb-01.webp'
import s2 from '../assets/gen/sb-02.webp'
import s3 from '../assets/gen/sb-03.webp'
import s4 from '../assets/gen/sb-04.webp'
import d1 from '../assets/gen/dir-01.webp'
import d2 from '../assets/gen/dir-02.webp'
import d3 from '../assets/gen/dir-03.webp'
import d4 from '../assets/gen/dir-04.webp'
import bg from '../assets/gen/bg-01.webp' // 배경 · 외곽 버스 정류장 (사람 없음)

const W = 512, H = 288
const CUT = { '0 0 320 180': 0, '112 66 96 54': 1, '128 79 46 25.9': 2, '118 58 120 67.5': 3 }
const REAL = [d1, d2, d3, d4]
const ROUGH = [s1, s2, s3, s4]

// 인물 시트 안의 부분: 얼굴 · 앞모습 · 뒷모습
const SHEET = {
  '128 76 40 53': [a1, '0 0 132 140'],
  '150 72 40 53': [a2, '0 0 132 140'],
  '120 60 56 110': [a1, '150 18 100 252'],
  '142 56 56 110': [a2, '150 18 100 252'],
}

const svg = (src, vb = `0 0 ${W} ${H}`) =>
  `<svg viewBox="${vb}" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><image href="${src}" width="${W}" height="${H}" preserveAspectRatio="none"/></svg>`

/** kind: 'real'(실사 컷, 기본) | 'rough'(러프 콘티) */
export function shot(vb, flip, kind = 'real') {
  if (vb === 'sheet-seoyun') return svg(a1)
  if (vb === 'sheet-dohyun') return svg(a2)
  if (SHEET[vb]) {
    const [src, crop] = SHEET[vb]
    // 뒤집힌 쪽은 시트의 뒷모습 자리
    return svg(src, flip ? crop.replace(/^150 /, '322 ') : crop)
  }
  const i = CUT[vb]
  if (i !== undefined) return svg((kind === 'rough' ? ROUGH : REAL)[i])
  // 배경(정류장 넓은 화면): 보내 준 배경 이미지
  return svg(kind === 'rough' ? s1 : bg, '0 0 512 286')
}
