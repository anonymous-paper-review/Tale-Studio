#!/usr/bin/env node
// 샷비디오 ↔ 입력(이미지·프롬프트) 연결 리뷰 문서 생성 → assets/compare/README.md
//   샷마다: [입력 시작 | 산출 첫 프레임 | 산출 끝 프레임 | 입력 끝] 4패널 스트립(sharp 합성, 라벨 SVG)
//   + 클립 임베드 + 프롬프트 원문 + SSIM + 프로버넌스(provider/jobId/초).
//   재료: payloads.json(입력·프롬프트) · compare/frames/*(산출 프레임) · metrics.json · gen_state.json.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const EXP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const A = path.join(EXP, 'assets')
const C = path.join(A, 'compare')
const T = path.join(C, 'thumbs')
const payloads = JSON.parse(fs.readFileSync(path.join(A, 'payloads/payloads.json'), 'utf8'))
const metrics = JSON.parse(fs.readFileSync(path.join(C, 'metrics.json'), 'utf8'))
const state = JSON.parse(fs.readFileSync(path.join(A, 'gen_state.json'), 'utf8'))

const ARMS = [
  ['r', 'R — 상한 대조군 (원본 프레임 직입력)'],
  ['b1', 'B1 — 시작+끝 프레임 쌍'],
  ['b2', 'B2 — 콘티 시트 셀 수확'],
  ['c', 'C — 클러스터 체이닝 (1·3·4는 B1 클립 재사용)'],
  ['a', 'A — 자산+연출 텍스트 (끝 프레임 없음)'],
]

// 팔별 개요 — "이 팔은 뭘 하려던 건가" (섹션 상단)
const ARM_OVERVIEW = {
  r: '**방식이 아니라 눈금이다.** 원본 영상의 진짜 프레임을 시작·끝으로 그대로 넣어, 이 영상 모델이 낼 수 있는 **최고치**를 잰다. 다른 팔이 R보다 나쁜 만큼이 "우리 이미지 제작 계층에서 온 손실"이고, 원본과 R의 격차가 "영상 모델 자체의 한계"다. (원본 프레임이라 DAAIKEEM 워터마크가 보여도 결함으로 세지 말 것.)',
  b1: '샷마다 **시작·끝 그림 2장을 먼저 확정**하고, 모델에게 "이 두 그림 사이만 메워라"고 시킨다. 카메라·동작의 도착점이 그림으로 못박히면 AI가 멋대로 카메라를 움직일 자유가 사라진다는 가설 — 설계 시점의 **유력 승자 후보**.',
  b2: '6샷의 시작 그림을 **한 번의 이미지 생성 안에 격자(콘티 시트)로** 그리게 한 뒤 셀을 잘라 쓴다. "한 생성 안 6컷"은 인물·공간 일관성이 공짜라는 가설. 끝 그림·영상 단계는 B1과 완전 동일 — **B1과의 유일한 차이는 시작 그림의 출신**(개별 생성 vs 시트 수확)이다. 대가: 셀 해상도 손실(~344×286→720p 업스케일).',
  c: 'B1과 같되, 같은 사건 묶음에서는 **앞 샷 클립의 "실제 마지막 화면"을 뽑아** 다음 샷 시작 그림을 만든다(샷 2·5·6). 설계값이 아니라 실물로 잇는 것 — 동작이 컷을 관통하는 느낌이 가장 충실하리라는 가설. 대가: 순차 실행 + 앞 샷 오류가 뒤로 전파. 샷 1·3·4는 B1과 입력이 동일해 **B1 클립을 그대로 재사용**(B1 vs C 비교가 체이닝 효과만 격리하도록).',
  a: '**현행 워크플로우의 강화판이자 대조 팔.** 캐릭터 시트+빈 배경 플레이트로 시작 그림을 만들어 주되, **끝 그림은 주지 않는다**. 움직임의 도착점이 텍스트("Camera locked")뿐이면 임의 카메라 무브를 못 막을 것이라는 약점 가설을 검증한다. B1이 A를 얼마나 이기는지가 이 실험의 핵심 대조.',
}

// ── 프롬프트 한국어 번역 (샷별 고유분 — 공통 계약은 문서 상단 1회) ──
const MOTION_SE_KO = {
  1: '시작 자세에서 끝 자세까지 립글로스를 바른다.',
  2: '바르던 동작을 마치고 완드를 살짝 내린다.',
  3: '거의 정지한 채 서 있다.',
  4: '고개가 거울 쪽으로 살짝 돌아간다.',
  5: '세면대 위로 천천히 몸을 기울인다.',
  6: '정지 샷, 희미한 빛 일렁임만.',
}
const MOTION_A_KO = {
  1: '천천히 립글로스를 바른다 — 손과 입술만 움직임. 카메라 고정, 무브 없음.',
  2: '프로필인 채 계속 바른다 — 고개 미세 조정만. 카메라 고정.',
  3: '거의 정지, 체중만 살짝 이동. 카메라 고정.',
  4: '거울 속 자신을 살핀다, 고개 몇 도 회전. 카메라 고정.',
  5: '세면대 위로 조금 더 다가가고 시선은 아래를 훑는다. 카메라 고정.',
  6: '정지 인서트 — 희미한 빛 일렁임만. 카메라 고정.',
}
const END_KO = {
  1: '시작 프레임과 같은 장면·같은 고정 카메라. 끝 상태: 글로스 완드가 입술에 닿고, 턱이 살짝 들리고, 입술엔 갓 바른 광.',
  2: '같은 프로필 프레이밍. 끝 상태: 완드를 입술에서 몇 cm 내리고, 눈은 거울을 확인.',
  3: '같은 와이드 마스터 프레이밍. 끝 상태: 거의 동일, 체중만 반대 다리로.',
  4: '같은 오버숄더 프레이밍. 끝 상태: 고개가 몇 도 돌아가 거울 속 자신과 시선이 마주침.',
  5: '같은 세면대 탑다운 POV. 끝 상태: 얼굴이 림에 조금 더 가까이, 시선은 아래에 고정.',
  6: '같은 배수구 매크로 프레이밍, 변화 없음(정지 인서트). 세면대는 마른 채 비어 있음 — 물·수도 틀기 금지.',
}
const CHAIN_KO = {
  2: '이 순간을 정확히 이어서: 같은 여자, 완드도 입술에 같은 위치 — 단, 카운터 왼쪽 프로필에서 본 모습으로. 같은 조명, 같은 방.',
  5: '바로 다음 순간: 시선이 거울에서 아래 세면대로 떨어진다 — 이제 세면대 안에서 주황 림 너머 그녀 얼굴을 올려다보는 시점.',
  6: '그녀가 보고 있는 것: 같은 주황 세면대와 크롬 배수구의 익스트림 클로즈업, 인물 없음.',
}
const BIBLE_KO =
  '연속성 바이블(LOCKED): 모든 샷에 같은 젊은 여자 — 입술길이 검은 단발+잔머리 앞머리, 은색 참 초커 레이어드, 흰 데이지 레이스 트림 페일블루 새틴 슬립 드레스; 의상·헤어 절대 불변. 장소: 레트로 파스텔 공중화장실 — 민트 타일, 민트 카운터 위 주황 원형 세면대, 세로 튜브 조명 달린 큰 원형 거울. 빛: 거울 위쪽 웜 형광, 일정, 같은 시각. 그녀는 180도 라인의 같은 쪽에서 거울 벽을 향한다. 시그니처 소품: 작은 립글로스 완드, 크롬 배수구.'
const NEGATIVE_KO =
  '금지: 지시 외 카메라 움직임 일체, 의상·헤어 변경, 그림자 방향 반전, 낮밤 점프, 인물 추가, 얼굴 중복, 플라스틱 피부, 손 모핑, 화면 내 텍스트, 워터마크.'
const BETA_KO =
  '전체 시퀀스를 만들어라: 각 행이 샷 하나, 순서대로, 적힌 길이대로. 샷 사이는 컷. 시트 자체를 화면에 보여주지 말 것.'

const IW = 300, IH = 169, PAD = 6, LABEL_H = 22

async function strip(outFile, panels) {
  if (fs.existsSync(outFile)) return
  const comps = []
  let x = PAD
  for (const p of panels) {
    const buf = await sharp(p.img).resize(IW, IH, { fit: 'cover' }).jpeg().toBuffer()
    comps.push({ input: buf, left: x, top: PAD + LABEL_H })
    comps.push({
      input: Buffer.from(`<svg width="${IW}" height="${LABEL_H}"><text x="4" y="16" font-family="Helvetica" font-size="13" font-weight="bold" fill="#222">${p.label}</text></svg>`),
      left: x, top: PAD,
    })
    x += IW + PAD
  }
  await sharp({ create: { width: x, height: PAD * 2 + LABEL_H + IH, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .composite(comps).jpeg({ quality: 85 }).toFile(outFile)
  console.log(`[strip] ${path.basename(outFile)}`)
}

const abs = (rel) => path.join(EXP, rel) // payloads 경로는 실험 루트 기준
const lines = []
lines.push('# 샷비디오 ↔ 입력 연결 리뷰 (자동 생성 — tools/build_review_doc.mjs)')
lines.push('')
lines.push('> 샷마다 **무엇을 넣어서(입력 시작/끝 + 프롬프트) 무엇이 나왔나(산출 첫/끝 프레임 + 클립)** 를 한 줄에 묶었다.')
lines.push('> 스트립 읽는 법: `IN-start`(모델에 넣은 시작 그림) → `OUT-first`(클립 실제 첫 프레임) → `OUT-last`(클립 실제 끝 프레임) → `IN-end`(모델에 넣은 끝 그림).')
lines.push('> IN↔OUT이 다를수록 모델이 재렌더/이탈한 것. 수치는 SSIM(1.0=동일). 판정 문서: [`../../result.md`](../../result.md)')
lines.push('')
lines.push('## 공통 텍스트 계약 — 전 샷 동일 (샷 프롬프트 = 동작·결말 문장 + 아래 두 층)')
lines.push('')
lines.push(`- **연속성 바이블(번역)**: ${BIBLE_KO}`)
lines.push(`- **네거티브 배터리(번역)**: ${NEGATIVE_KO}`)
lines.push('')
lines.push('<details><summary>공통 계약 영어 원문</summary>')
lines.push('')
lines.push('```')
lines.push(payloads.common.bible)
lines.push('')
lines.push(payloads.common.negative)
lines.push('```')
lines.push('</details>')
lines.push('')

for (const [arm, title] of ARMS) {
  lines.push(`## ${title}`)
  lines.push('')
  lines.push(`> ${ARM_OVERVIEW[arm]}`)
  lines.push('')
  for (const shot of payloads.arms[arm].shots) {
    const n = shot.shot
    const m = metrics.find((x) => x.arm === arm && x.shot === n) ?? {}
    // C 체인 샷: 시작 프레임은 런타임 제작분
    const startImg = shot.start_image ? abs(shot.start_image) : path.join(A, `arm-c/frames/s${n}_start.jpg`)
    const endImg = shot.end_image ? abs(shot.end_image) : null
    const panels = [
      { img: startImg, label: `IN-start${shot.start_image ? '' : ' (체인 생성)'}` },
      { img: path.join(C, `frames/${arm}_s${n}_first.jpg`), label: 'OUT-first' },
      { img: path.join(C, `frames/${arm}_s${n}_last.jpg`), label: 'OUT-last' },
      ...(endImg ? [{ img: endImg, label: 'IN-end' }] : []),
    ]
    const stripRel = `thumbs/review_${arm}_s${n}.jpg`
    await strip(path.join(C, stripRel), panels)

    const st = state[`${arm}_s${n}`] ?? {}
    const prov = [
      st.provider === 'reuse-b1' ? '**B1 클립 재사용**' : st.provider ?? '?',
      st.jobId ? `job \`${st.jobId.slice(0, 8)}\`` : null,
      m.clip_s ? `생성 ${m.clip_s}s → 목표 ${m.target_s}s (리타임)` : null,
    ].filter(Boolean).join(' · ')

    lines.push(`### ${arm} 샷 ${n}`)
    lines.push('')
    lines.push(`![](${stripRel})`)
    lines.push('')
    lines.push(`![](../clips/arm-${arm}/s${n}.mp4)`)
    lines.push('')
    const motionKo = arm === 'a' ? MOTION_A_KO[n] : MOTION_SE_KO[n]
    lines.push(`- **프롬프트(번역)**: ${motionKo} — ${END_KO[n]} *(+ 공통 계약 2층, 문서 상단)*`)
    lines.push(`- **SSIM**: 첫 프레임 ${m.first_frame_ssim?.toFixed(3) ?? '—'} · 끝 도달 ${m.end_frame_ssim?.toFixed(3) ?? '— (끝 입력 없음)'}`)
    lines.push(`- **입력 이미지**: \`${shot.start_image ?? `assets/arm-c/frames/s${n}_start.jpg (런타임 체인 생성)`}\`${shot.end_image ? ` + \`${shot.end_image}\`` : ''}`)
    lines.push(`- **프로버넌스**: ${prov}`)
    if (shot.chain) {
      lines.push(`- **체인**: 클립 s${shot.chain.from_shot_clip}의 마지막 프레임 → 편집 모델 → 시작 프레임`)
      lines.push(`  - 체인 프롬프트(번역): ${CHAIN_KO[n]}`)
      lines.push(`  - 체인 프롬프트(원문): "${shot.chain.chain_prompt}"`)
    }
    lines.push('')
    lines.push('<details><summary>영상 프롬프트 원문</summary>')
    lines.push('')
    lines.push('```')
    lines.push(shot.video_prompt)
    lines.push('```')
    lines.push('</details>')
    lines.push('')
  }
}

// B2β
const beta = payloads.arms.b2.beta
lines.push('## B2β — 시트 통째 입력 (판정 제외, 오작동 기록용)')
lines.push('')
lines.push('> **원안 그대로의 SNS 소문 검증**: 시작·끝 그림과 연출 노트가 행마다 박힌 연출 시트 한 장을 영상 모델에 통째로 넣고 "이 표대로 만들어라"고 시키면 되는가? 격자가 화면에 그대로 나오는 오작동만 기록하고 판정에선 제외한다.')
lines.push('')
lines.push(`![](../arm-b2/beta_sheet.jpg)`)
lines.push('')
lines.push(`![](../clips/arm-b2/beta_full.mp4)`)
lines.push('')
lines.push(`- **입력**: \`${beta.sheet_image}\` 1장 + 아래 프롬프트 · 15초 요청 · 1차 nsfw 차단 → 재시도 성공`)
lines.push(`- **프롬프트(번역)**: ${BETA_KO}`)
lines.push('')
lines.push('```')
lines.push(beta.full_prompt)
lines.push('```')
lines.push('')

fs.writeFileSync(path.join(C, 'README.md'), lines.join('\n'))
console.log(`review doc → assets/compare/README.md (${payloads.arms.r.shots.length * ARMS.length}샷 + β)`)
