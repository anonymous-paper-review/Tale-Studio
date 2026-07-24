#!/usr/bin/env node
// BKM 리뷰 문서 생성 → assets/arm-bkm/README.md
//   테이크마다: [IN-start | IN-end] 스트립 + 한국어 요약 + 커버 컷 + 영상 프롬프트(원문 접힘) + 페이로드.
//   QC 게이트(신원·시선·소품 접촉·카메라 위치)의 검수 대상 문서를 겸한다.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const EXP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const A = path.join(EXP, 'assets')
const F = path.join(A, 'arm-bkm/frames')
const T = path.join(A, 'arm-bkm/thumbs')
fs.mkdirSync(T, { recursive: true })
const { takes, bible, bible_two, negative } = JSON.parse(fs.readFileSync(path.join(EXP, 'takes.json'), 'utf8'))
const jobs = JSON.parse(fs.readFileSync(path.join(EXP, 'jobs.bkm.json'), 'utf8'))

// 한국어 요약 (카메라 · 동작 · 사건)
const KO = {
  T01: '광각 세면대 안에서 올려다본 얼굴 CU, 고정 — 림 너머로 숙이며 배수구를 살핀다. 희미한 목소리의 근원을 찾는 중.',
  T02: '로우앵글 얼굴 CU, 고정 — 몸을 숙이며 시선 아래로. 세면대 쪽에 신경이 쏠려 있다.',
  T03: '거울벽 앞 하반신 미디엄, 고정 — 거의 정지, 체중 이동 한 번. 조용한 순간.',
  T04: '바닥 구두 매크로, 고정 — 발 거의 정지. 디테일 쉼표.',
  T05: '거울벽 뒷모습 미디엄(거울에 문 반사), 고정 — 거울로 빈 화장실을 살핀다. 입장 직후.',
  T06: '카운터 옆 전신 프로필, 고정 — 립글로스를 꺼내 든다. 루틴 시작.',
  T07: '거울 정면 CU(50mm), 고정 — 립을 천천히 바른다. 희미한 "somebody help me"가 스치지만 거의 못 알아챈다. 끝에서 손이 한 박자 멈칫.',
  T08: '오버숄더 거울 반사, 고정 — 립 마무리, 반사 확인. 목소리는 사라졌고 미묘하게 불안.',
  T09: '마스터 와이드(대칭·1점 투시), 고정 — 카운터에 거의 정지. 넓은 쉼표.',
  T10: '3/4 얼굴 CU, 고정 — 더 또렷한 "help me"에 놀람 → 거울 훑고 → 시선이 세면대로 떨어진다. (17s 비트)',
  T11: '세면대 안 광각 POV, 고정 — 림 위로 천천히 숙이며 귀 기울인다. 배수구 확신.',
  T12: '배수구 매크로(무인물), 고정·정지 — 마른 배수구, 크롬에 빛 일렁임만.',
  T13: '수전 옆 프로필 CU, 고정 — 귀를 수전 쪽으로 기울여 살핀다. 대답 없음.',
  T14: '림 너머 정면 하이앵글, 고정 — 세면대 안을 훑는다. 평정이 금 가기 시작.',
  T15: '마스터 와이드(동일 구도), 고정 — 카운터를 따라 천천히 왼쪽으로 이동하며 세면대들을 확인.',
  T16a: '85mm 정면 타이트 CU, 고정 — 숨죽이고 듣는다, 눈만 움직임. 완전한 정적.',
  T16b: '무릎 높이 프로필, 고정 — 쪼그려 카운터 아래를 본다. 마지막 남은 곳.',
  T17: '카운터 앞 하반신, 고정 — 한 걸음 이동 후 정지. 조심스러워졌다.',
  T18: '세면대 하부 배관 인서트(무인물), 고정·정지 — 목소리가 살 만한 곳.',
  T19a: '림 위 정수리/목덜미 탑 CU, 고정 — 세면대 깊이 숙임, 머리카락이 커튼처럼. 귀가 배수구 직전.',
  T19b: '바닥 로우 광각(양말/다리 전경), 고정 — 정적이 길어지다… 여자 비명과 함께 암전 직전 프리즈. (47s 비트)',
  T20a: '바닥 레벨 CU, 고정 — 타일 위에 쓰러져 눈 감고 미동 없음. 암전 이후.',
  T20b: '와이드(2인!), 고정 — 똑같이 생긴 소녀가 쓰러진 소녀의 팔을 잡고 칸막이 쪽으로 끌고 간다. 도플갱어.',
  T21: '변기 칸 탑다운, 고정 — 변기 옆에 미동 없이 누워 있음. (s05 플래시+s28 겸용)',
  T22: '칸 내부 정면 미디엄, 고정 — 도플갱어가 구두를 들고 변기 뚜껑에 앉아 있다. 서두름 없음.',
  T23: '칸막이 복도, 고정 — 칸에서 나와 멈칫. 도플갱어 퇴장 시작.',
  T24: '마스터 와이드, 고정 — 화장실을 가로질러 퇴장, 방은 다시 빈다. 칸에 남은 것만 빼고.',
}

const IW = 420, IH = 236, PAD = 6, LH = 22
async function strip(t) {
  const out = path.join(T, `${t.id}.jpg`)
  if (fs.existsSync(out)) return
  const comps = []
  let x = PAD
  for (const k of ['start', 'end']) {
    const buf = await sharp(path.join(F, `${t.id}_${k}.jpg`)).resize(IW, IH, { fit: 'cover' }).jpeg().toBuffer()
    comps.push({ input: buf, left: x, top: PAD + LH })
    comps.push({ input: Buffer.from(`<svg width="${IW}" height="${LH}"><text x="4" y="16" font-family="Helvetica" font-size="14" font-weight="bold" fill="#111">${t.id} ${k.toUpperCase()}</text></svg>`), left: x, top: PAD })
    x += IW + PAD
  }
  await sharp({ create: { width: x, height: PAD * 2 + LH + IH, channels: 3, background: '#fff' } })
    .composite(comps).jpeg({ quality: 85 }).toFile(out)
}

const L = []
L.push('# BKM 테이크 리뷰 — 입력 이미지 + 프롬프트 한눈 보기 (영상 생성 직전 상태)')
L.push('')
L.push('> 테이크 27개 × [시작|끝] 프레임 + 영상 프롬프트. 이 문서가 **QC 게이트 검수 대상**이다 —')
L.push('> 신원(정본과 같은 인물인가) · 시선 방향 · 소품 접촉 · 카메라 구도(원본 컷과 대응하는가)를 보고,')
L.push('> 불합격 테이크를 짚으면 재생성한다. 발사 준비물: [`../../jobs.bkm.json`](../../jobs.bkm.json)')
L.push('> · 컷 대응/원본 프레임: [`../../conti_full.md`](../../conti_full.md) · 시나리오: [`../../scenario.md`](../../scenario.md)')
L.push('')
L.push('공통 계약(전 테이크 프롬프트 뒤에 붙음): 연속성 바이블 · 네거티브 배터리 — 원문은 문서 말미.')
L.push('')
for (const t of takes) {
  await strip(t)
  const job = jobs.find((j) => j.id === `bkm_${t.id}`)
  L.push(`## ${t.id} — 컷 ${t.cuts.join('·')} · ${t.secs}초${t.two ? ' · **2인(도플갱어)**' : ''}`)
  L.push('')
  L.push(`![](thumbs/${t.id}.jpg)`)
  L.push('')
  L.push(`- **요약(한국어)**: ${KO[t.id]}`)
  L.push(`- **페이로드**: \`${job.image}\` + \`${job.end_image}\` → \`${job.out}\` (${job.seconds}s)`)
  L.push('')
  L.push('<details><summary>영상 프롬프트 원문 (카메라 4요소 + 동작 + 사건 + 공통 계약)</summary>')
  L.push('')
  L.push('```')
  L.push(t.video_prompt)
  L.push('```')
  L.push('</details>')
  L.push('')
}
L.push('## 공통 계약 원문')
L.push('')
L.push('```')
L.push(bible)
L.push('')
L.push('--- (2인 테이크용 변형) ---')
L.push(bible_two)
L.push('')
L.push(negative)
L.push('```')
fs.writeFileSync(path.join(A, 'arm-bkm/README.md'), L.join('\n'))
console.log(`README: ${takes.length}테이크 · thumbs ${fs.readdirSync(T).length}장`)
