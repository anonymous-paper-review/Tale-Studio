import { t } from './i18n.js'
// 여섯 단계 오른쪽: 단계마다 컴포넌트 몇 개 + 한 가지 동작만 (실제 앱 토큰 · 문구, reference-app/)
import './vignette.css'
import lumiSrc from '../assets/lumi@2x.webp'

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
const sleep = (ms) => new Promise((r) => setTimeout(r, reduce ? 0 : ms))
import { shot } from './shots.js'
const PROSE = t('서윤은 정류장 지붕 끝에 서서 막차의 빨간 미등이 빗속으로 사라지는 걸 바라본다. 도현이 조용히 다가와 투명 비닐우산을 서윤의 머리 위로 기울인다.')
// 앱 Storyboard에서 정리한 4컷 (16:9 · 15초)
const CUTS = [['0 0 320 180', 'WS', '씬 1 · 샷 1', 4, '막차가 떠나고'], ['112 66 96 54', 'MS', '씬 1 · 샷 2', 4, '우산을 기울여'], ['128 79 46 25.9', 'CU', '씬 2 · 샷 3', 3, '알아채는 순간'], ['118 58 120 67.5', '2S', '씬 2 · 샷 4', 4, '뒤에서 나란히', true]]
const lumi = (text) => `<div class="vg-msg"><img src="${lumiSrc}" alt="" /><p class="vg-bub">${text}</p></div>`

const VIEWS = {
  producer: `
    ${lumi('장르와 분위기는 어떻게 할까요?')}
    <div class="vg-chips"><span class="vg-chip">코미디</span><span class="vg-chip">드라마</span><span class="vg-chip vg-chip--rec" data-t>로맨스<em>추천</em></span><span class="vg-chip">일상</span></div>
    <div class="vg-sum">${[['🔒 화면 비율', '16:9 · 시작하면 못 바꿔요'], ['장르와 분위기', '로맨스'], ['길이', '15초 이하'], ['바꿀 정도', '2 다듬기']].map(([k, v]) => `<div class="vg-row"><span>${k}</span>${v}</div>`).join('')}</div>`,
  writer: `
    <div class="vg-card vg-prose"><p class="vg-label"><i></i>산문 · 장면 2</p><p class="vg-text" data-text></p><p class="vg-ph">아직 비어 있어요</p></div>
    <span class="vg-btn vg-btn--cream" data-t>네, 산문 쓰기</span>`,
  artist: `
    <div class="vg-styles">${[['실사', '128 76 40 53'], ['3D 애니메이션', '150 72 40 53'], ['2D 애니메', '40 30 240 160'], ['카툰', '118 58 120 67.5']].map(([n, vb], i) => `<span class="vg-style"${i === 0 ? ' data-t' : ''}><i>${shot(vb)}</i>${n}</span>`).join('')}</div>
    <p class="vg-note">인물 시트 2 · 배경 1 · 이미지는 Take를 쓰지 않아요</p>
    <div class="vg-cast">
      <div class="vg-pic">${shot('128 76 40 53')}<p>서윤 <span>인물</span></p></div>
      <div class="vg-pic">${shot('150 72 40 53')}<p>도현 <span>인물</span></p></div>
      <div class="vg-pic vg-pic--bg">${shot('40 30 240 160')}<p>외곽 버스 정류장 <span>배경 · 밤</span></p></div>
    </div>`,
  storyboard: `
    <div class="vg-cuts">
      ${CUTS.map(([vb, t, h, sec, d, f], i) => `<div class="vg-cut${i === 2 ? ' vg-cut--redo' : ''}"><small>${h} · ${sec}초</small><div class="vg-cut__img">${shot(vb, f, 'rough')}<span class="vg-tag">다시 그리기 · 무료</span></div><p><em>${t}</em>${d}</p></div>`).join('')}
    </div>
    <span class="vg-btn vg-btn--cream" data-t>러프 그리기</span>`,
  director: `
    <div class="vg-nodes">
      <svg class="vg-line" viewBox="0 0 100 40" preserveAspectRatio="none"><path d="M0 20 C40 20 60 20 100 20"/></svg>
      <div class="vg-node"><small>이미지</small><b>샷 3 <em>CU</em></b><div class="vg-node__img">${shot('128 79 46 25.9')}</div><p class="vg-ok">● 완료</p></div>
      <div class="vg-node vg-node--vid"><small>영상</small><b>샷 3 · 영상 <em>3초</em></b>
        <div class="vg-load"><p>영상을 만들고 있어요</p><div class="vg-prog"><i></i></div><span>로우앵글 · 천천히 다가가기</span></div>
        <div class="vg-node__img vg-done">${shot('128 79 46 25.9')}<span class="vg-play"></span></div></div>
    </div>
    <span class="vg-btn vg-btn--cream" data-t>▶ 영상 만들기 · 샷당 5 Takes</span>`,
  editor: `
    <div class="vg-player">${shot('118 58 120 67.5', true)}<span class="vg-time">00:00 / 00:15</span></div>
    <div class="vg-tl">${CUTS.map(([vb, , , sec, , fl]) => `<i style="flex:${sec}">${shot(vb, fl)}</i>`).join('')}<span class="vg-head"></span></div>
    <div class="vg-foot"><span class="vg-btn vg-btn--cream" data-t>내보내기</span><span class="vg-toast">mp4 · 16:9 · 15초로 내보냈어요</span></div>`,
}


VIEWS.write = VIEWS.writer
VIEWS.expand = `
  <div class="vg-seed" data-seed>비 오는 버스 정류장, 우산 하나를 같이 쓰게 된 두 사람</div>
  <div class="vg-branches">
    <svg class="vg-blines" viewBox="0 0 300 40" preserveAspectRatio="none"><path d="M150 0 C150 22 50 18 50 40"/><path d="M150 0 V40"/><path d="M150 0 C150 22 250 18 250 40"/></svg>
    <div class="vg-leaf" data-t style="--lc:#e8606f"><small>로맨스</small>팀장과 신입, 우산 하나 아래</div>
    <div class="vg-leaf" style="--lc:#3E9BE0"><small>잔잔한 드라마</small>매일 같은 버스, 말 없는 동행</div>
    <div class="vg-leaf" style="--lc:#8B63E8"><small>미스터리</small>우산 주인은 왜 나타나지 않을까</div>
  </div>
  <div class="vg-chips vg-chips--c"><span class="vg-chip vg-pop">인물 · 서윤 · 도현</span><span class="vg-chip vg-pop">결말 · 해피엔딩</span><span class="vg-chip vg-pop">15초 · 16:9 🔒</span></div>
  <span class="vg-btn vg-btn--cream" data-go>갈래 펼치기</span>`
VIEWS.board = `
  <div class="vg-cmp vg-cmp--bad"><p class="vg-cmp__h">영상부터 바로<span>다시 · 다시 · 다시</span></p>
    <div class="vg-vids">${['0 0 320 180', '112 66 96 54', '128 79 46 25.9', '118 58 120 67.5'].map((vb) => `<i>${shot(vb)}</i>`).join('')}</div>
    <p class="vg-take"><b data-bad>0</b> Takes</p></div>
  <div class="vg-cmp"><p class="vg-cmp__h">Tale · 콘티 먼저<span>확인 → 확정 → 생성</span></p>
    <div class="vg-vids vg-vids--sb">${['0 0 320 180', '112 66 96 54', '128 79 46 25.9', '118 58 120 67.5'].map((vb, i) => `<i${i === 2 ? ' class="redo"' : ''}>${shot(vb, false, 'rough')}<em>${i === 2 ? '다시 그리기 · 무료' : '✓ 확정'}</em></i>`).join('')}</div>
    <p class="vg-take">러프 · 이미지 <b>0</b> · 영상 <b data-good>0</b> Takes</p></div>`

export function createVignettes(host) {
  host.classList.add('vg')
  // 앱 --stage-* 값
  const C = { write: '#e8606f', expand: '#f2a33a', board: '#5a6ae6', producer: '#f2a33a', writer: '#e8606f', artist: '#8b63e8', storyboard: '#5a6ae6', director: '#3e9be0', editor: '#2db39a' }
  host.innerHTML = Object.entries(VIEWS).map(([k, v]) => `<div class="vg-view" data-v="${k}" style="--c:${C[k]}">${v}</div>`).join('') +
    `<svg class="vg-cursor" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 2l16 9.5-7 1.6L9.5 20z" fill="#fff" stroke="#141312" stroke-width="1.4" stroke-linejoin="round"/></svg>`
  const cursor = host.querySelector('.vg-cursor')
  let run = 0
  const to = async (el, fx = 0.5, fy = 0.55) => {
    const h = host.getBoundingClientRect(), r = el.getBoundingClientRect()
    cursor.style.transform = `translate(${r.left - h.left + r.width * fx}px, ${r.top - h.top + r.height * fy}px)`
    await sleep(700)
  }
  const click = async (el, fx, fy) => { await to(el, fx, fy); el.classList.add('press'); cursor.classList.add('press'); await sleep(170); el.classList.remove('press'); cursor.classList.remove('press') }
  const park = () => { const h = host.getBoundingClientRect(); cursor.style.transform = `translate(${h.width - 40}px, ${h.height - 30}px)` }

  const ANIM = {
    async producer(v, alive) {
      await sleep(600); const c = v.querySelector('[data-t]'); await click(c); if (!alive()) return
      c.classList.add('pick'); v.querySelector('.vg-chips').classList.add('done')
      for (const r of v.querySelectorAll('.vg-row')) { await sleep(350); if (!alive()) return; r.classList.add('on') }
    },
    async writer(v, alive) {
      const t = v.querySelector('[data-text]')
      await sleep(500); await click(v.querySelector('[data-t]')); if (!alive()) return
      v.classList.add('busy')
      for (let i = 1; i <= PROSE.length && alive(); i++) { t.textContent = PROSE.slice(0, i); await sleep(32) }
      v.classList.remove('busy')
    },
    async artist(v, alive) {
      await sleep(600); const c = v.querySelector('[data-t]'); await click(c); if (!alive()) return
      c.classList.add('pick'); v.querySelector('.vg-styles').classList.add('done')
      for (const p of v.querySelectorAll('.vg-pic')) { await sleep(700); if (!alive()) return; p.classList.add('on') }
    },
    async storyboard(v, alive) {
      await sleep(500); await click(v.querySelector('[data-t]')); if (!alive()) return
      for (const c of v.querySelectorAll('.vg-cut')) { await sleep(450); if (!alive()) return; c.classList.add('on') }
      await sleep(500); const r = v.querySelector('.vg-cut--redo'); await to(r, 0.5, 0.4); r.classList.add('hot')
    },
    async director(v, alive) {
      await sleep(500); await click(v.querySelector('[data-t]')); if (!alive()) return
      v.classList.add('go'); const bar = v.querySelector('.vg-prog i')
      for (let p = 0; p <= 100 && alive(); p += 3) { bar.style.width = p + '%'; await sleep(55) }
      if (!alive()) return
      v.classList.add('fin')
    },
    async editor(v, alive) {
      const head = v.querySelector('.vg-head'), tl = v.querySelector('.vg-tl'), time = v.querySelector('.vg-time')
      await sleep(400); const w = tl.clientWidth - 12
      for (let x = 0; x <= w && alive(); x += 6) { head.style.left = 6 + x + 'px'; time.textContent = `00:${String(Math.round((x / w) * 15)).padStart(2, '0')} / 00:15`; await sleep(30) }
      if (!alive()) return
      await click(v.querySelector('[data-t]')); v.classList.add('fin')
    },
  }


  ANIM.write = ANIM.writer
  ANIM.expand = async (v, alive) => {
    await sleep(500); await click(v.querySelector('[data-go]')); if (!alive()) return
    v.classList.add('open')
    for (const l of v.querySelectorAll('.vg-leaf')) { await sleep(320); if (!alive()) return; l.classList.add('on') }
    await sleep(600); const pick = v.querySelector('.vg-leaf[data-t]'); await click(pick); if (!alive()) return
    pick.classList.add('pick'); v.querySelector('.vg-branches').classList.add('done')
    for (const c of v.querySelectorAll('.vg-pop')) { await sleep(300); if (!alive()) return; c.classList.add('on') }
  }
  ANIM.board = async (v, alive) => {
    const bad = v.querySelector('[data-bad]'), good = v.querySelector('[data-good]')
    const vids = v.querySelectorAll('.vg-cmp--bad i')
    // 바로 영상: 샷마다 세 번씩 다시 (샷당 5 Takes × 3)
    for (let r = 0; r < 4 && alive(); r++) { vids[r].classList.add('on'); for (let k = 0; k < 15; k++) { bad.textContent = String(r * 15 + k + 1); await sleep(18) } await sleep(260) }
    if (!alive()) return
    v.querySelector('.vg-cmp--bad').classList.add('x')
    const cuts = v.querySelectorAll('.vg-vids--sb i')
    for (const c of cuts) { await sleep(380); if (!alive()) return; c.classList.add('on') }
    // 콘티로 확정한 4샷만 한 번: 샷당 5 Takes × 4
    await sleep(400); for (let k = 1; k <= 20 && alive(); k++) { good.textContent = String(k); await sleep(35) }
  }

  function reset(v) {
    v.classList.remove('busy', 'go', 'fin', 'open')
    v.querySelectorAll('.x').forEach((e) => e.classList.remove('x'))
    v.querySelectorAll('[data-bad],[data-good]').forEach((e) => (e.textContent = '0'))
    v.querySelectorAll('.pick, .on, .hot, .done').forEach((e) => e.classList.remove('pick', 'on', 'hot', 'done'))
    const t = v.querySelector('[data-text]'); if (t) t.textContent = ''
    const bar = v.querySelector('.vg-prog i'); if (bar) bar.style.width = '0'
    const head = v.querySelector('.vg-head'); if (head) head.style.left = '6px'
    const time = v.querySelector('.vg-time'); if (time) time.textContent = '00:00 / 00:15'
  }

  async function play(k, loop = true) {
    const my = ++run, alive = () => my === run
    const v = host.querySelector(`[data-v="${k}"]`)
    host.querySelectorAll('.vg-view').forEach((x) => x.classList.toggle('on', x === v))
    do {
      reset(v); park(); await sleep(300)
      if (!alive()) return
      await ANIM[k](v, alive)
      if (!alive()) return
      await sleep(2400)
    } while (loop && alive() && !reduce)
  }
  function still(k) {
    run++
    const v = host.querySelector(`[data-v="${k}"]`)
    host.querySelectorAll('.vg-view').forEach((x) => x.classList.toggle('on', x === v))
    reset(v); park()
  }
  return { play, still, stop: () => run++ }
}
