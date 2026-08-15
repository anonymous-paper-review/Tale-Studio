// 리포트 빌더 — 입력(캐릭터 시트·배경 참조)과 산출을 한 페이지에 나란히 싣는다.
//   readable-report 철칙 2: 프롬프트 전문 + 참조물 자체를 결과 옆에. 이 페이지만 보고 재현 가능해야 한다.
//   대전제: 판정·점수 없음. 무엇을 넣었고 무엇이 나왔는지만.
// 실행: pnpm dlx tsx research/experiments/i2i-firstframe-resolution/build-report.mts
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const DIR = dirname(fileURLToPath(import.meta.url))
const OUT = join(DIR, 'out')
const EMB = join(DIR, 'embed')
execFileSync('mkdir', ['-p', EMB])

const m = JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8'))

/** 원격/로컬 이미지를 폭 W jpeg 로 줄여 data URI 로. 페이지 용량 방어(16MB 한도). */
async function dataUri(src: string, key: string, w = 860): Promise<string> {
  const raw = join(EMB, `_${key}.png`)
  const jpg = join(EMB, `${key}.jpg`)
  if (!existsSync(jpg)) {
    if (!existsSync(raw)) {
      if (src.startsWith('http')) {
        const r = await fetch(src)
        writeFileSync(raw, Buffer.from(await r.arrayBuffer()))
      } else {
        writeFileSync(raw, readFileSync(src))
      }
    }
    execFileSync('ffmpeg', ['-y', '-i', raw, '-vf', `scale='min(${w},iw)':-2:flags=lanczos`, '-q:v', '4', jpg], { stdio: 'ignore' })
  }
  return `data:image/jpeg;base64,${readFileSync(jpg).toString('base64')}`
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// ── 입력 자산 임베드 ────────────────────────────────────────────────────────
const charImg = await dataUri(m.character.sheet_url, 'char_sheet')
const viewImgs: Record<string, string> = {}
for (const v of m.views_3d.views) viewImgs[v.key] = await dataUri(v.url, `view_${v.key}`)
viewImgs[m.photo_bg.key] = await dataUri(m.photo_bg.url, 'bg_photo1')

// 축소 팔이 실제로 넣은 입력(374px) — 원본과 나란히 보여야 대조가 성립한다.
const shrunkImgs: Record<string, string> = {}
for (const j of m.jobs) {
  if (j.arm === 'shrunk' && j.bg_input_url) {
    const local = join(OUT, `_shrunk_${j.bg_key}.png`)
    shrunkImgs[j.bg_key] = await dataUri(existsSync(local) ? local : j.bg_input_url, `shrunk_${j.bg_key}`, 374)
  }
}

// ── 산출 임베드 ─────────────────────────────────────────────────────────────
const outImgs: Record<string, string> = {}
for (const j of m.jobs) {
  if (!j.out_file) continue
  outImgs[`${j.arm}:${j.bg_key}`] = await dataUri(join(DIR, j.out_file), `out_${j.arm}_${j.bg_key}`)
}

const jobsFull = m.jobs.filter((j: { arm: string }) => j.arm === 'full')
const jobsShrunk = m.jobs.filter((j: { arm: string }) => j.arm === 'shrunk')
const okCount = m.jobs.filter((j: { out_url?: string }) => j.out_url).length
const failCount = m.jobs.filter((j: { error?: string }) => j.error).length
const promptSample: string = m.jobs.find((j: { prompt?: string }) => j.prompt)?.prompt ?? ''

function pairBlock(j: { arm: string; bg_key: string; bg_label: string; bg_input_dim?: string; out_dim?: string; error?: string }): string {
  const inImg = j.arm === 'shrunk' ? shrunkImgs[j.bg_key] : viewImgs[j.bg_key]
  const outImg = outImgs[`${j.arm}:${j.bg_key}`]
  return `
  <div class="pair">
    <div class="ph">
      <h4>${esc(j.bg_label)}</h4>
      <span class="chip ${j.arm === 'full' ? 'c-ok' : 'c-hold'}">${j.arm === 'full' ? '원본 크기' : '축소(현행 재현)'}</span>
    </div>
    <div class="duo">
      <figure><img src="${inImg}" alt="배경 참조"><figcaption>넣은 배경 참조 · <span class="mono">${esc(j.bg_input_dim ?? '')}</span></figcaption></figure>
      ${outImg
        ? `<figure><img src="${outImg}" alt="산출 첫 그림"><figcaption>나온 첫 그림 · <span class="mono">${esc(j.out_dim ?? '')}</span></figcaption></figure>`
        : `<figure class="fail"><div class="failbox">생성 실패</div><figcaption>${esc(j.error ?? '')}</figcaption></figure>`}
    </div>
  </div>`
}

const css = readFileSync(join(DIR, 'report.css'), 'utf8')

const html = `<title>첫 그림을 원본 크기로 만들면 달라지는가 — 판정 대기</title>
<style>${css}</style>
<div class="wrap">

<header class="page">
  <p class="kicker">실험 산출 · 판정 대기</p>
  <h1>첫 그림을 원본 크기로 만들면, 각도와 인물이 안 깨지는가</h1>
  <p class="standfirst">캐릭터 시트 한 장과 배경 참조 한 장만으로 첫 그림을 합성했습니다. 변인은 <b>넣은 배경 참조의 크기</b> 하나입니다 — 원본 그대로 넣은 팔과, 지금 제품이 자르는 크기(폭 374)로 줄여 넣은 팔. <b>판정은 하지 않았습니다. 당신 눈이 판정합니다.</b></p>
  <p class="asof">2026년 8월 12일 · 생성 ${okCount}장${failCount ? ` · 실패 ${failCount}장` : ''} · 추정 지출 $${(m.total_cost_usd ?? 0).toFixed(2)} / 상한 $${m.budget_cap_usd} · 원장 <code>research/experiments/i2i-firstframe-resolution/</code></p>
</header>

<section class="block">
  <div class="sec-head"><h2>왜 다시 물어보나</h2></div>
  <p>지난 8월 11일에 같은 질문을 이미 한 번 물었고, 당신이 <b>“둘 다 쓰레기”</b>로 판정했습니다. 각도를 돌리라고 시키면 정면으로 끌려오거나(각도 평탄화) 아예 다른 방을 지어냈습니다(공간 발명).</p>
  <p>그런데 <b>그 실험은 제품 배선을 그대로 통과했습니다.</b> 제품 배선은 여러 칸이 그려진 시트를 만든 뒤 칸으로 잘라 쓰는데, 자르는 순간 그림이 <b>폭 374픽셀 근방</b>으로 줄어듭니다. 같은 날 밤 조사에서 표본 48장 전부가 짧은 변 720픽셀 미만이었다는 것이 확인됐습니다.</p>
  <p>그러면 그때 무너진 원인이 둘로 갈리는데, 그 실험은 둘을 가르지 못합니다 — <b>모델이 각도를 못 돌리는 것인가, 입력이 작아서 못 돌리는 것인가.</b> 이번 실험은 자르는 단계를 아예 건너뛰고 원본 크기로 다시 묻습니다.</p>
  <div class="callout">
    <b>재료는 원래 크다.</b> 캐릭터 시트 1088×608 · 장소 사진 1088×608 · 3D 법정 뷰 1280×720.
    그런데 지금 영상에 실제로 들어가는 첫 그림은 <b>374×242</b>입니다. 큰 원본이 없는 게 아니라, 있는 걸 잘라 버리고 있었습니다.
  </div>
</section>

<section class="block">
  <div class="sec-head"><h2>무엇을 넣었나</h2><span class="lede">두 팔이 공유하는 것</span></div>
  <div class="tbl-wrap"><table>
    <tr><th>항목</th><th>원본 크기 팔</th><th>축소 팔 (현행 재현)</th></tr>
    <tr><td>캐릭터 시트</td><td colspan="2" class="same">동일 — ${esc(m.character.name)} 턴어라운드 <span class="mono">${esc(m.character.sheet_dim)}</span> (원본 그대로, 두 팔 다 안 줄임)</td></tr>
    <tr><td>지시문</td><td colspan="2" class="same">동일 — 바이트 단위로 같은 문장 (아래 전문)</td></tr>
    <tr><td>모델</td><td colspan="2" class="same">동일 — <span class="mono">${esc(m.model)}</span></td></tr>
    <tr><td>화면 비율</td><td colspan="2" class="same">동일 — 16:9</td></tr>
    <tr><td><b>배경 참조 크기</b></td><td><b>원본</b> <span class="mono">1280×720</span> / <span class="mono">1088×608</span></td><td><b>폭 374로 축소</b></td></tr>
  </table></div>
  <p class="note">즉 <b>다른 것은 배경 참조의 크기 하나뿐</b>입니다. 캐릭터 시트는 두 팔 모두 원본을 넣었습니다 — 배경 크기만 격리해서 재기 위해서입니다.</p>
  <div class="callout">
    <b>나온 그림은 9장 전부 1088×608로 같습니다.</b> 이 모델의 출력 크기는 넣은 참조의 크기와 무관하게 정해집니다.
    그래서 <b>출력 크기는 이 실험의 변인이 아닙니다</b> — 두 팔의 차이가 있다면 그것은 오직 “모델이 참조에서 얼마나 읽어냈는가”에서 나온 것입니다.
    (덧붙여: 이 1088×608이 캐릭터 시트·장소 사진과 같은 크기입니다. 제품은 이 크기로 만든 그림을 칸으로 잘라 374로 줄여 쓰고 있습니다.)
  </div>

  <div class="assets">
    <figure class="wide"><img src="${charImg}" alt="캐릭터 턴어라운드 시트"><figcaption><b>캐릭터 시트</b> — ${esc(m.character.name)} · <span class="mono">${esc(m.character.sheet_dim)}</span> · ${esc(m.character.sheet_layout)}</figcaption></figure>
  </div>

  <details>
    <summary>지시문 전문 (두 팔 공통 — 대괄호 부분만 각도 이름으로 치환)</summary>
    <div class="body"><pre class="prompt">${esc(promptSample)}</pre>
    <p class="note">한국어 요지: ①시트는 <b>누구인지만</b> 정의한다 — 4연 배치·흰 배경을 결과로 복사하지 말 것, 결과에는 사람이 <b>한 명</b>만. ②배경 참조는 <b>장소와 시점만</b> 정의한다 — 그 렌더링 양식·표면 색·조명 처리는 복사하지 말 것. ③그 사람을 그 공간의 그 시점에 중경 자연 크기로 배치하고, 완성된 실사 영화 프레임으로 렌더할 것. ④글자·자막·라벨·테두리·칸 구분선 금지.</p>
    <p class="note">참조 역할을 나눠 적는 이 방식은 8월 11일 영상 실험에서 검증된 문구를 이미지 축으로 옮긴 것입니다.</p></div>
  </details>
</section>

<section class="block">
  <div class="sec-head"><h2>원본 크기로 넣었을 때</h2><span class="lede">배경 참조 ${jobsFull.length}종</span></div>
  <p class="note">왼쪽이 넣은 배경 참조, 오른쪽이 나온 첫 그림입니다. 3D 뷰 5장은 <b>8월 12일 밤에 만든 것을 그대로 재사용</b>했습니다(다시 만들지 않았습니다).</p>
  ${jobsFull.map(pairBlock).join('\n')}
</section>

<section class="block">
  <div class="sec-head"><h2>지금 크기로 줄여서 넣었을 때</h2><span class="lede">대조 ${jobsShrunk.length}종</span></div>
  <p class="note">같은 재료·같은 지시문인데 배경 참조만 폭 374픽셀로 줄였습니다. 제품이 지금 실제로 넣고 있는 크기입니다.</p>
  ${jobsShrunk.map(pairBlock).join('\n')}
</section>

<section class="block">
  <div class="sec-head"><h2>당신이 봐야 할 것</h2></div>
  <p>제가 판정하지 않는 이유는 규칙입니다 — 그림이 어떻게 보이는지에 대한 판단은 당신만 합니다. 대신 무엇을 비교하면 되는지만 적습니다.</p>
  <ol class="lead-list">
    <li><b>인물이 같은 사람인가</b><span class="d">시트의 얼굴·안경·정장과 결과의 인물. 그리고 결과에 사람이 한 명만 있는가(시트의 4연이 새어 들어오지 않았는가).</span></li>
    <li><b>각도가 주문대로 나왔는가</b><span class="d">넣은 배경이 측면·리버스·하이앵글인데 결과가 정면으로 끌려오지 않았는가. 이것이 8월 11일에 무너졌던 바로 그 지점입니다.</span></li>
    <li><b>같은 공간으로 이어지는가</b><span class="d">천장·벽·바닥 마감이 참조와 이어지는가, 아니면 그럴듯한 다른 법정을 새로 지어냈는가.</span></li>
    <li><b>두 팔이 다른가</b><span class="d">여기가 이 실험의 전부입니다. <b>같으면</b> 크기 문제가 아니고 8월 11일 판정이 유효합니다. <b>다르면</b> 그 판정이 무효였고, 시트 자르는 단계를 손대는 것이 값어치를 갖습니다.</span></li>
  </ol>
</section>

<section class="block">
  <div class="sec-head"><h2>정직 보고</h2></div>
  <ul class="plain">
    <li><b>캐릭터를 바꿨습니다.</b> 이 작품의 다른 인물은 외형 서술에 실존 배우 이름이 박혀 있어(“배우 조승우를 연상시키는 눈매”) 생성 거부 위험이 있었습니다. 같은 작품이 예전에 정책 거부를 겪은 기록이 있어, 실험 변인과 무관한 실패를 피하려고 ${esc(m.character.name)}을 썼습니다.</li>
    <li><b>제품 배선을 일부러 쓰지 않았습니다.</b> 평소 실험 규칙은 제품 함수를 그대로 호출하는 것이지만, 이번엔 <b>그 배선 자체가 용의자</b>입니다. 태우면 또 374로 줄어 같은 교란을 반복합니다. 다만 발주 호출만은 제품 함수를 그대로 썼습니다.</li>
    <li><b>축소 팔은 크기만 모사합니다.</b> 제품의 실제 크롭 경로(시트 생성 → 칸 자르기)를 재현한 것이 아니라, 결과물의 크기만 폭 374로 맞췄습니다. 크롭 과정 자체가 만드는 다른 손상(압축·경계 잘림)은 이 실험에 안 들어 있습니다.</li>
    <li><b>배경 참조는 각도별로 한 장씩만 넣었습니다.</b> 여러 각도를 동시에 넣는 조건은 이번에 시험하지 않았습니다.</li>
    ${failCount ? `<li><b>생성 실패 ${failCount}건</b>이 있습니다. 사유는 해당 칸에 적었습니다.</li>` : ''}
  </ul>
</section>

<section class="block">
  <div class="sec-head"><h2>이 결과가 닫는 것</h2></div>
  <div class="tbl-wrap"><table>
    <tr><th>상위 질문</th><th>그 발밑의 사실 전제</th><th>이번에 한 일</th></tr>
    <tr><td>배경 일관성을 참조로 잡을 수 있는가</td><td>“각도 파생은 못 한다”(8/11 판정) — 단 <b>작은 입력으로 잰 것</b></td><td>크기 교란을 제거하고 재시험</td></tr>
    <tr><td>시트 파이프라인을 수술할 값어치가 있는가</td><td>표본 48/48이 720 미만, 원본은 3배 크다</td><td>큰 입력이 실제로 다른 결과를 내는지 확인</td></tr>
    <tr><td>3D를 배경 자산으로 승격할 것인가</td><td>회전 가능한 기하 소스가 필요하다는 데까지 도달</td><td>3D 뷰를 첫 그림 재료로 처음 투입</td></tr>
  </table></div>
  <p class="note">설계 판단 자체는 하지 않았습니다 — 위 세 질문의 결론은 당신이 이 페이지를 보고 내립니다.</p>
</section>

<footer>
  <p>모델 <span class="mono">${esc(m.model)}</span> · 작품 <span class="mono">${esc(m.project.title)}</span> · 발주 payload·URL·비용 전문은 <span class="mono">manifest.json</span></p>
  <p>3D 뷰 출처: <span class="mono">research/experiments/bg-viewsheet-from-3d</span> (재사용, Blender 미실행) · 해상도 근거: <span class="mono">research/experiments/t0-storyboard-ref-resolution</span></p>
  <p>판정 없음 — 이미지 해석은 오너 전용(<span class="mono">.claude/rules/experiments.md</span> 대전제).</p>
</footer>

</div>`

writeFileSync(join(DIR, 'report.html'), html)
console.log(`report.html 작성 완료 — ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB`)
