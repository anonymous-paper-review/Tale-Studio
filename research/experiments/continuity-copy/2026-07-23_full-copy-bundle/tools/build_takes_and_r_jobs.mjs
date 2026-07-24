#!/usr/bin/env node
// BKM 텍스트 계층(테이크 27개 — 카메라 4요소 긍정 명시 + 사건 맥락 + 3층 계약) 확정 +
// R팔(전범위 29컷, 원본 프레임 직입력) jobs 생성.
//   - 카메라 층은 원본 분석(conti_full.md·콘택트 시트) 기반 수기 — BKM "고점" 정의 그대로.
//   - R은 컷 단위(원본 프레임이 컷 단위로만 존재), 텍스트는 커버 테이크의 것을 공유
//     (R vs BKM의 변수는 "이미지 출신"뿐이어야 하므로 텍스트 동일 — design.md §3).
//   산출: takes.json (BKM 생성 계획) · jobs.r.json (디스패처 입력)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const EXP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const BIBLE =
  'Continuity bible (LOCKED): the same young woman (black lip-length bob with wispy bangs, layered silver charm choker, pale blue satin slip dress with white daisy lace trim, white crew socks, black mary-jane heels); wardrobe and hairstyle never change. Location: retro pastel public restroom — mint-green tiles, orange-red round sinks on a mint counter, large round mirrors with vertical tube lights, red-orange stall doors. Light: warm fluorescent from above the mirrors, constant, same time of day. Signature props: small lip-gloss wand; chrome drain. Genre mood: quiet thriller — calm, uncanny stillness.'
const BIBLE_TWO =
  BIBLE.replace('the same young woman', 'TWO identical young women (the girl and her doppelganger — identical face, hair, dress)')
const NEGATIVE =
  'Never: any camera movement beyond what is specified, wardrobe or hairstyle change, shadow direction flip, day/night jump, extra people beyond those specified, duplicate faces beyond those specified, plastic skin, morphing hands, on-screen text, watermark.'

// 테이크 27개 — camera(4요소: 렌즈/앵글·구도/무브/광학), action(동작), event(사건 맥락)
const TAKES = [
  { id: 'T01', cuts: ['s01', 's04'], secs: 5, two: false,
    camera: 'Ultra-wide lens (14mm feel, mild fisheye distortion), extreme close-up from inside the orange sink looking up over the rim, her face large in frame. Camera locked, no movement. Warm fluorescent glow from the ceiling behind her head.',
    action: 'She leans over the sink rim, peering down into it, head tilting slowly a few degrees.',
    event: 'She is searching for the source of a faint voice that seemed to come from the drain.' },
  { id: 'T02', cuts: ['s02'], secs: 4, two: false,
    camera: '35mm, low-angle close-up rising toward her face as she bends forward over the counter. Camera locked. Shallow depth of field, tube lights soft in background.',
    action: 'She bends down slowly, eyes scanning downward, lips slightly parted in concentration.',
    event: 'She is leaning in to listen — something in the sink area caught her attention.' },
  { id: 'T03', cuts: ['s03'], secs: 4, two: false,
    camera: '35mm, medium shot of her lower body — skirt hem, bare legs, socks and heels — in front of the mirror wall, tube lights flanking. Camera locked at hip height.',
    action: 'She stands nearly still, weight shifting once from one leg to the other.',
    event: 'A quiet moment; the restroom is silent around her.' },
  { id: 'T04', cuts: ['s06'], secs: 4, two: false,
    camera: 'Macro close-up, 60mm, of her black mary-jane heels and white crew socks on the mint tile floor. Camera locked at floor level. Crisp focus on the shoes.',
    action: 'Feet nearly still; one heel lifts a centimeter and settles.',
    event: 'Detail beat — her shoes on the spotless tile, the room utterly quiet.' },
  { id: 'T05', cuts: ['s07'], secs: 4, two: false,
    camera: '35mm, medium back view: she faces the mirror wall, her back to camera, red door visible in the mirror reflection. Camera locked at shoulder height.',
    action: 'She stands facing the mirrors, head turning a few degrees as she checks the room in the reflection.',
    event: 'She has just walked in; she surveys the empty restroom through the mirror.' },
  { id: 'T06', cuts: ['s08'], secs: 4, two: false,
    camera: '35mm, full-body left profile at the counter, mirrors and sinks receding to the right. Camera locked at chest height.',
    action: 'She stands at the counter and takes out a small lip-gloss wand from her hand, raising it.',
    event: 'She begins her makeup routine, unhurried.' },
  { id: 'T07', cuts: ['s09'], secs: 6, two: false,
    camera: '50mm, straight-on eye-level close-up framed inside the round mirror, chest-up composition, tube lights at both edges. Camera locked on tripod, no movement.',
    action: 'She slowly applies lip gloss; only her hand and lips move. Near the end her hand hesitates for one beat, then continues.',
    event: 'A faint female whisper — "somebody… help me…" — drifts in, almost inaudible, like ASMR. She barely registers it and keeps applying.' },
  { id: 'T08', cuts: ['s10'], secs: 4, two: false,
    camera: '50mm, over-shoulder from behind her head, her face visible in the round mirror reflection. Camera locked.',
    action: 'She finishes the gloss, lowers the wand, studies her reflection.',
    event: 'The whisper is gone; she returns to her routine, faintly uneasy.' },
  { id: 'T09', cuts: ['s11'], secs: 4, two: false,
    camera: '24mm, symmetrical master wide of the whole restroom, she stands small right of center facing the mirror wall. Camera locked, perfectly level, one-point perspective.',
    action: 'She stands almost still at the counter.',
    event: 'Wide pause — the room is large, symmetrical, and empty around her.' },
  { id: 'T10', cuts: ['s12'], secs: 4, two: false,
    camera: '50mm, three-quarter face close-up, her head and shoulders, mirror edge soft behind. Camera locked.',
    action: 'She startles — a small jolt — glances up at the mirror, scans it, then her gaze drops down toward the sink below.',
    event: 'The voice comes again, clearer this time — "help me." It seems to come from below, from the sink.' },
  { id: 'T11', cuts: ['s13'], secs: 4, two: false,
    camera: 'Ultra-wide from inside the sink basin looking straight up, orange rim framing the edges, her face above looking down, ceiling lamp behind her head. Camera locked.',
    action: 'She leans in slowly over the sink, face lowering toward the rim, eyes fixed downward, listening.',
    event: 'She is certain now the voice came from the drain; she searches it.' },
  { id: 'T12', cuts: ['s14'], secs: 4, two: false,
    camera: 'Macro, 90mm, extreme close-up of the chrome drain in the orange basin. Camera locked. Completely static; the basin dry and empty.',
    action: 'Static insert; only a faint shimmer of light on the chrome.',
    event: 'The drain — silent, ordinary, and somehow wrong.' },
  { id: 'T13', cuts: ['s15'], secs: 4, two: false,
    camera: '50mm, close left profile at the faucet, flowers and mirror soft behind. Camera locked.',
    action: 'She leans down, ear tilting toward the faucet and drain, hand resting on the rim, examining.',
    event: 'She listens for the voice at the fixture itself. Nothing answers.' },
  { id: 'T14', cuts: ['s16'], secs: 4, two: false,
    camera: '35mm, front high angle over the sink rim, her face looking down into the basin, orange rim bottom of frame. Camera locked.',
    action: 'She peers down into the basin, eyes scanning slowly.',
    event: 'Still searching — her calm is starting to crack.' },
  { id: 'T15', cuts: ['s17'], secs: 4, two: false,
    camera: '24mm, symmetrical master wide, same framing as the earlier master. Camera locked.',
    action: 'She walks slowly leftward along the counter, trailing her hand near the rim, checking each sink.',
    event: 'She checks the other sinks one by one — was it this one? Or that one?' },
  { id: 'T16a', cuts: ['s18'], secs: 4, two: false,
    camera: '85mm, tight front close-up of her face, eyes large, background melted to soft color. Camera locked.',
    action: 'She holds still, listening hard; only her eyes move.',
    event: 'Total silence — which is somehow worse than the voice.' },
  { id: 'T16b', cuts: ['s20'], secs: 4, two: false,
    camera: '35mm, close profile at knee height: she crouches down beside the counter. Camera locked low.',
    action: 'She crouches, head dipping to look under the counter, hair falling forward.',
    event: 'She checks under the counter — the last place the voice could hide.' },
  { id: 'T17', cuts: ['s19'], secs: 4, two: false,
    camera: '35mm, medium of her lower body at the counter, legs and skirt, tile floor. Camera locked at knee height.',
    action: 'She takes one slow step along the counter, then stops.',
    event: 'Moving along the counter, cautious now.' },
  { id: 'T18', cuts: ['s21'], secs: 4, two: false,
    camera: '50mm, insert of the chrome pipes under the sink against mint tiles, no person. Camera locked. Static.',
    action: 'Static insert; the pipes sit silent, one faint drip glint.',
    event: 'Under the sink — where the voice would have to live.' },
  { id: 'T19a', cuts: ['s22'], secs: 4, two: false,
    camera: '35mm, top close-up over the rim: the crown of her head and nape as she bends deep over the basin. Camera locked above the sink.',
    action: 'She bends deeper over the basin, hair curtaining forward, holding still.',
    event: 'Ear almost to the drain now — she is fully committed to finding it.' },
  { id: 'T19b', cuts: ['s23'], secs: 6, two: false,
    camera: 'Ultra-wide low angle from the floor under the counter line, her socks and legs large in foreground, room stretching behind. Camera locked at floor level.',
    action: 'She stands at the sink above, shifting her weight; the room holds still around her legs. In the last beat everything freezes.',
    event: 'The quiet stretches too long — and then a woman\'s scream tears through the room as everything cuts to black.' },
  { id: 'T20a', cuts: ['s25'], secs: 4, two: false,
    camera: '35mm, floor-level close-up of her body lying on the mint tile, skirt and limbs foreground. Camera locked at floor level.',
    action: 'She lies on the floor, motionless except the faintest breath.',
    event: 'After the blackout — she is down, unconscious on the tile.' },
  { id: 'T20b', cuts: ['s26'], secs: 5, two: true,
    camera: '24mm, wide shot of the restroom: one girl lies on the floor, an IDENTICAL girl stands over her. Camera locked.',
    action: 'The standing girl grips the lying girl\'s arms and drags her slowly across the tile toward the stalls. The lying girl does not move.',
    event: 'Her doppelganger — same face, same dress — has her, and is taking her away.' },
  { id: 'T21', cuts: ['s05', 's28'], secs: 6, two: false,
    camera: 'Top-down overhead shot of the toilet stall: the girl lies on the floor beside the toilet, seen from directly above. Camera locked, perpendicular.',
    action: 'She lies beside the toilet, completely motionless.',
    event: 'Where the doppelganger left her — arranged, almost peaceful, beside the toilet.' },
  { id: 'T22', cuts: ['s27'], secs: 4, two: false,
    camera: '35mm, front medium inside the stall: she sits on the closed toilet lid holding the black heels in both hands, stall walls framing. Camera locked.',
    action: 'She sits calmly holding the shoes, unhurried, gaze steady ahead.',
    event: 'The doppelganger rests a moment with the shoes — no rush, no feeling.' },
  { id: 'T23', cuts: ['s29'], secs: 4, two: false,
    camera: '35mm, corridor view along the stall doors, she stands at an open stall door. Camera locked.',
    action: 'She steps out of the stall and pauses, one hand leaving the door.',
    event: 'The doppelganger leaves the stall behind.' },
  { id: 'T24', cuts: ['s30'], secs: 5, two: false,
    camera: '24mm, symmetrical master wide, same master framing. Camera locked.',
    action: 'She walks unhurried across the restroom toward the exit and passes out of frame; the room stands empty.',
    event: 'She leaves the way the first girl came in. The restroom is empty again — except for what is left in the stall.' },
]

const prompt = (t) =>
  `${t.action} ${t.camera}\nContext: ${t.event}\n${t.two ? BIBLE_TWO : BIBLE}\n${NEGATIVE}`

// takes.json — BKM 생성 계획 (스테이징 단계가 소비)
const takes = TAKES.map((t) => ({ ...t, video_prompt: prompt(t) }))
fs.writeFileSync(path.join(EXP, 'takes.json'), JSON.stringify({ bible: BIBLE, bible_two: BIBLE_TWO, negative: NEGATIVE, takes }, null, 2))

// jobs.r.json — R팔: 컷 단위, 원본 프레임 직입력, 텍스트는 커버 테이크 공유
const cutTake = {}
for (const t of TAKES) for (const c of t.cuts) cutTake[c] = t
const CUT_SECS = { s09: 6, s23: 6, s28: 5, s30: 5 } // 4초 초과 컷만 명시, 나머지 4
const jobs = []
for (let i = 1; i <= 30; i++) {
  const id = 's' + String(i).padStart(2, '0')
  if (id === 's24') continue // 블랙 — 생성 없음
  const t = cutTake[id]
  if (!t) throw new Error('테이크 미배정: ' + id)
  jobs.push({
    id: `r_${id}`, task: 'i2v_se', prompt: t.video_prompt,
    image: `conti/${id}_start.jpg`, end_image: `conti/${id}_end.jpg`,
    seconds: CUT_SECS[id] ?? 4, aspect: '16:9', out: `clips/arm-r/${id}.mp4`,
  })
}
fs.writeFileSync(path.join(EXP, 'jobs.r.json'), JSON.stringify(jobs, null, 2))
console.log(`takes: ${takes.length} (합계 ${takes.reduce((a, t) => a + t.secs, 0)}s) · R jobs: ${jobs.length} (합계 ${jobs.reduce((a, j) => a + j.seconds, 0)}s)`)
