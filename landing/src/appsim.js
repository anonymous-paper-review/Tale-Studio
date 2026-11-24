import { t } from './i18n.js'
// Tale Studio 앱 시뮬레이션: 실제 앱(talestudio.art, 2026-11 캡처 · reference-app/)의 색 · 컴포넌트 · 배치 · 흐름
import './appsim.css'
import lumiSrc from '../assets/lumi@2x.webp'
import symbolSrc from '../assets/tale-symbol.svg'
import lp from '../assets/lumi-producer.webp'
import lw from '../assets/lumi-writer.webp'
import la from '../assets/lumi-artist.webp'
import ls from '../assets/lumi-storyboard.webp'
import ld from '../assets/lumi-director.webp'
import le from '../assets/lumi-editor.webp'
import edVideo from '../assets/gen/umbrella-15s.mp4'
import edPoster from '../assets/gen/umbrella-poster.jpg'
import st1 from '../assets/styles/style-1.webp'
import st2 from '../assets/styles/style-2.webp'
import st3 from '../assets/styles/style-3.webp'
import st4 from '../assets/styles/style-4.webp'
import st5 from '../assets/styles/style-5.webp'
import st6 from '../assets/styles/style-6.webp'
import st7 from '../assets/styles/style-7.webp'
import st8 from '../assets/styles/style-8.webp'
import st9 from '../assets/styles/style-9.webp'
import st10 from '../assets/styles/style-10.webp'
import st11 from '../assets/styles/style-11.webp'
import st12 from '../assets/styles/style-12.webp'
import laSrc from '../assets/lumi-artist.webp'
import lcSrc from '../assets/lumi-hd.webp'
let stageLumi = lumiSrc
import icProducer from '../assets/icons/producer.svg'
import icWriter from '../assets/icons/writer.svg'
import icArtist from '../assets/icons/artist.svg'
import icStoryboard from '../assets/icons/storyboard.svg'
import icDirector from '../assets/icons/director.svg'
import icEditor from '../assets/icons/editor.svg'
import icTake from '../assets/icons/take.svg'
import icShare from '../assets/icons/share.svg'
import icExport from '../assets/icons/export.svg'
import icHelp from '../assets/icons/help.svg'
import lwLoad from '../assets/lumi-writer-loading.webp'
const ICON = { producer: icProducer, writer: icWriter, artist: icArtist, storyboard: icStoryboard, director: icDirector, editor: icEditor }
const ico = (src) => `<i style="--ico:url(&quot;${src.replace(/"/g, '%22')}&quot;)"></i>`

export const STEPS = ['producer', 'writer', 'artist', 'storyboard', 'director', 'editor']
const NAMES = { producer: 'Producer', writer: 'Writer', artist: 'Artist', storyboard: 'Storyboard', director: 'Director', editor: 'Editor' }
// 앱 --stage-* 값
const COLORS = { producer: '#f2a33a', writer: '#e8606f', artist: '#8b63e8', storyboard: '#5a6ae6', director: '#3e9be0', editor: '#2db39a' }
const LUMI = { producer: lp, writer: lw, artist: la, storyboard: ls, director: ld, editor: le }
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
const sleep = (ms) => new Promise((r) => setTimeout(r, reduce ? 0 : ms))
import { shot } from './shots.js'

// 실제로 만든 작품 '우산 하나 아래' (16:9 · 15초 · 4컷)
const TITLE = t('우산 하나 아래')
const PROSE = [
  '서윤은 정류장 지붕 끝에 서서, 비 오는 서울 외곽으로 사라지는 막차의 빨간 미등을 바라본다. 도현이 조용히 다가와 투명 비닐우산을 서윤의 머리 위로 기울인다.',
  '서윤이 고개를 돌려 노란 가로등 아래 도현과 눈이 마주친다. 같은 회사 신입이라는 걸 알아챈다.',
].map(t)
const FIX = t('서윤이 천천히 고개를 돌리자 노란 가로등 아래 도현의 눈과 마주친다. 작게 숨을 삼키며 그를 알아본다. 도현이 수줍게 웃고, 빗소리가 두 사람만의 벽이 된다.')
// 앱 Storyboard에서 정리한 4컷
const CUTS = [
  ['0 0 320 180', 'WS', '씬 1 · 샷 1', 4, '막차가 떠나고, 서윤 혼자 지붕 끝에'],
  ['112 66 96 54', 'MS', '씬 1 · 샷 2', 4, '도현이 말없이 우산을 기울여 줘요'],
  ['128 79 46 25.9', 'CU', '씬 2 · 샷 3', 3, '같은 회사 신입이라는 걸 알아채요'],
  ['118 58 120 67.5', '2S', '씬 2 · 샷 4', 4, '우산 하나 아래 나란히, 뒤에서', true],
]

const msg = (html, center) => `<div class="sim-msg${center ? ' sim-msg--c' : ''}"><span class="sim-msg__av"><img src="${stageLumi}" alt="" /></span><div class="sim-bub"><p class="sim-msg__name">Lumi</p>${html}</div></div>`
const input = (ph, plus) => `<div class="sim-input">${plus ? '<span class="sim-input__plus">+</span>' : ''}<span class="ph">${ph}</span><b></b><span class="sim-input__send">↑</span></div>`
const pick = (cards) => `<div class="sim-pick">${cards.map(([t, d, rec]) => `<span class="sim-pick__c${rec ? ' rec' : ''}"><b>${t}</b><small>${d}</small>${rec ? '<em>추천</em>' : ''}</span>`).join('')}</div>`

function template() {
  const nav = STEPS.map((s) => `<div class="sim-nav" data-n="${s}" style="--c:${COLORS[s]}">${ico(ICON[s])}${NAMES[s]}</div>`).join('')
  return `<div class="sim__canvas">
  <aside class="sim-side"><img class="sim-side__logo" src="${symbolSrc}" alt="" />${nav}
    <div class="sim-side__end"><span>${ico(icTake)}Takes</span><span>${ico(icShare)}공유</span><span>${ico(icExport)}내보내기</span><span>${ico(icHelp)}도움말</span><span class="sim-av">A</span></div></aside>
  <div class="sim-top"><span class="sim-badge">Producer</span><span class="sim-title">${TITLE}</span><span class="sim-pen"></span></div>
  <div class="sim-btns" data-for="writer"></div>

  <section class="sim-scene" data-scene="producer">
    <div class="sim-pro">
      <div class="sim-set"><em>지금까지 정한 것</em><span data-q="genre">장르와 분위기 <b data-k="genre">아직</b></span><span data-q="len">길이 <b data-k="len">아직</b></span><span data-q="lvl">바꿀 정도 <b data-k="lvl">아직</b></span><span data-q="ratio">🔒 화면 비율 <b data-k="ratio">아직</b></span></div>
      <div class="sim-pro__log"></div>
      ${input('예) 비 오는 날 만난 두 사람 이야기', true)}
    </div>
  </section>

  <section class="sim-scene" data-scene="writer">
    <div class="sim-h"><b>산문</b><span>장면 2</span></div>
    <div class="sim-meta"><em>지금 산문 조건</em><span>길이<b>15초 이하</b></span><span>장르<b>로맨스</b></span><span>원본 아이디어<b>유지</b></span></div>
    <div class="sim-prose">${PROSE.map((p, i) => `<div class="sim-para" data-i="${i}"><em>S${i + 1}</em><div class="sim-para__t">${p.split(' ').map((w) => `<span class="w">${w} </span>`).join('')}</div></div>`).join('')}</div>
    <p class="sim-hint">문단을 누르면 그 문단만 채팅에서 고칠 수 있어요.</p>
  </section>

  <section class="sim-scene" data-scene="artist">
    <div class="sim-h"><b>인물 · 배경</b><span>인물 2 · 배경 1</span></div>
    <div class="sim-style"><i>${shot('128 76 40 53')}</i><div><b>실사</b><small>작품 스타일 · v1</small></div><span class="sim-btn">다시 만들기</span></div>
    <div class="sim-tabs"><span class="on">모두 3</span><span>인물 2</span><span>배경 1</span></div>
    <div class="sim-cards sim-cards--art">
      <div class="sim-card sim-card--sheet"><p>서윤<span class="sim-kind">인물</span></p><div class="sim-card__img"><i>${shot('128 76 40 53')}</i><i>${shot('120 60 56 110')}</i><i>${shot('120 60 56 110', true)}</i></div><small>29세 팀장, 베이지 트렌치코트</small></div>
      <div class="sim-card sim-card--sheet"><p>도현<span class="sim-kind">인물</span></p><div class="sim-card__img"><i>${shot('150 72 40 53')}</i><i>${shot('142 56 56 110')}</i><i>${shot('142 56 56 110', true)}</i></div><small>26세 신입, 투명 비닐우산</small></div>
      <div class="sim-card sim-card--wide"><p>외곽 버스 정류장<span class="sim-kind">배경</span><span class="sim-kind">밤</span></p><div class="sim-card__img">${shot('40 30 240 114')}</div><small>비 오는 서울 외곽, 노란 가로등 하나</small></div>
    </div>
    <div class="sim-modal sim-modal--style" data-modal="style"><span class="sim-modal__x">✕</span><img class="sim-modal__lumi" src="${laSrc}" alt="" /><p class="sim-modal__h">어떤 스타일로 그릴까요?</p>
      <p class="sim-modal__s">작품의 스타일은 하나예요. 인물 · 배경 이미지가 모두 고른 스타일로 그려져요. 나중에 다시 만들기로 바꿀 수 있고, 이전 버전은 기록에 남아요.</p>
      <div class="sim-styles">${[[st1, '실사'], [st2, '3D 애니메이션'], [st3, '2D 일본 애니'], [st4, '미국 카툰'], [st5, '스톱모션'], [st6, '수채화'], [st7, '일본 멜로'], [st8, '심리 호러'], [st9, 'SF'], [st10, '사막 서사'], [st11, '히어로 액션'], [st12, '시대극']].map(([src, n], i) => `<span class="sim-styles__c${i === 0 ? ' first' : ''}"><i><img src="${src}" alt="" /></i>${n}</span>`).join('')}</div>
      <div class="sim-modal__f"><small>인물 시트 2 · 배경 1<br />이미지는 Take를 쓰지 않아요</small><span class="sim-modal__btns"><span class="sim-btn">취소</span><span class="sim-btn sim-btn--cream" data-draw>실사로 그리기</span></span></div></div>
  </section>

  <section class="sim-scene" data-scene="storyboard">
    <div class="sim-h"><b>Storyboard</b><span>씬 2 · 샷 4 · 15초</span></div>
    <div class="sim-tabs sim-tabs--sb"><span class="on">러프 스토리보드</span><span>대사</span><span class="ghost">+ 씬 추가</span><span class="ghost">+ 샷 추가</span></div>
    <div class="sim-check">⚠ 연출 점검: 영상 전에 볼 것 2가지</div>
    ${[['씬 1', '서윤 혼자 남은 정류장에 도현이 말없이 우산을 내밀어요', 0], ['씬 2', '서윤이 같은 회사 신입을 알아보고, 우산 하나 아래 나란히 서요', 2]].map(([sc, sum, from]) => `<p class="sim-scn"><b>${sc}</b>외곽 버스 정류장 · 밤<span>${sum} · 2컷</span></p>
    <div class="sim-cards sim-cards--sb">
      ${CUTS.slice(from, from + 2).map(([vb, t, h, sec, d, f], j) => `<div class="sim-card${from + j === 2 ? ' sb-redo' : ''}"><p class="sim-card__h">${h} · ${sec}초</p><div class="sim-card__img">${shot(vb, f, 'rough')}<span class="sim-tag">다시 그리기 · 무료</span><span class="sim-redraw"><img src="${ls}" alt="" />러프를 그리고 있어요</span></div><p class="sim-card__d">${d}</p><p class="sim-chips"><em>${t}</em><em>Eye-level</em><em>Static</em></p></div>`).join('')}
    </div>`).join('')}
  </section>

  <section class="sim-scene" data-scene="director">
    <div class="dn-tool"><span class="sim-seg"><span>스토리보드</span><span class="on">노드</span></span><b>The Set</b><small>ⓘ 노드 11 · 샷 4</small>
      <span class="dn-tool__end"><span class="dn-pill">안 쓴 에셋</span><span class="dn-pill">자동 정렬</span><span class="dn-pill">+ 프롬프트 노드</span><span class="dn-pill">전체 4 ▾</span><span class="dn-lumi"><img src="${ld}" alt="" /></span></span></div>
    <div class="dn-bar"><span class="dn-check" data-all></span><b>모든 샷 4</b>
      <span class="dn-bar__end"><span class="dn-toggle"><i></i>영상도 만들기</span><span class="dn-pill dn-pill--off">이미지 만들기 · 0</span><span class="dn-pill dn-pill--go" data-make>▶ 영상 만들기 · <span data-k="vids">4</span></span></span>
      <small class="dn-hint">모든 샷에 이미지가 있어요 · <span data-k="hint">영상을 만들 수 있어요</span></small></div>
    <div class="dn-board">
      <svg class="dn-lines"></svg>
      ${[['서윤', '인물', 'sheet-seoyun', 0], ['도현', '인물', 'sheet-dohyun', 230], ['외곽 버스 정류장', '배경', '40 30 240 135', 460]].map(([n, k, vb, y]) => `<div class="dn-node dn-node--asset" style="left:10px;top:${y}px"><p class="dn-node__h"><i></i>이미지<span>⤢ 자세히 ···</span></p><b>${n}<em>${k}</em></b><div class="dn-img">${shot(vb)}</div><small>GPT Image 2</small></div>`).join('')}
      ${[[1, 'MS', '어두운 외곽 버스 정류장, 막차가 떠나고 서윤 혼자 지붕 끝에…', '0 0 320 180', 290, 560, 0, '0:04'], [3, 'CU', '같은 회사 신입이라는 걸 알아채는 서윤의 얼굴, 노란 가로등…', '128 79 46 25.9', 820, 1090, 0, '0:03'],
         [2, 'MS', '도현이 말없이 투명 비닐우산을 서윤 쪽으로 기울여 준다…', '112 66 96 54', 290, 560, 310, '0:04'], [4, '2S', '뒤에서 본 투샷, 우산 하나 아래 나란히 선 두 사람…', '118 58 120 67.5', 820, 1090, 310, '0:04']]
        .map(([n, t, d, vb, xi, xv, y, len]) => `<div class="dn-node dn-node--img" data-shot="${n}" style="left:${xi}px;top:${y}px"><p class="dn-node__h"><i></i>이미지<span>⤢ 자세히 ···</span></p><b>샷 ${n}<em>${t}</em></b><p class="dn-desc">${d}</p><div class="dn-img">${shot(vb)}<span class="dn-live">실사</span></div><p class="dn-state"><i></i><span>이미지 완료</span></p></div>
        <div class="dn-node dn-node--vid" data-vid="${n}" style="left:${xv}px;top:${y}px"><p class="dn-node__h"><i></i>영상<span>☆ ···</span></p><b>샷 ${n}</b>
          <div class="dn-vbox"><div class="dn-empty">샷 ${n} 영상 · 아직 없어요<small>"영상 만들기"를 누르면 여기에 생겨요</small></div>
            <div class="dn-load"><img src="${ld}" alt="" /><p>영상을 만들고 있어요</p><div class="sim-prog"><i></i></div></div>
            <div class="dn-done">${shot(vb)}<span class="dn-len">▶ ${len}</span></div></div>
          <span class="dn-ok">✓ 완료</span></div>`).join('')}
      <div class="dn-zoom">−&nbsp;&nbsp;75%&nbsp;&nbsp;+&nbsp;&nbsp;⤢</div>
      <div class="dn-mini"><small>미니맵</small><div><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></div>
    </div>
  </section>

  <section class="sim-scene" data-scene="editor">
    <div class="ed-top"><span class="sim-seg"><span class="on">편집</span><span>내보내기</span></span><b>Sequence 01</b><small>00:00:15:00 · 1280×720 · 30fps</small>
      <span class="ed-top__end"><span class="dn-pill">↶ 되돌리기</span><span class="dn-pill">↷</span><span class="dn-pill">⌨ 단축키</span></span></div>
    <div class="ed-grid">
      <div class="ed-panel ed-src"><div class="ed-tabs"><span>소스</span><span class="on">효과 컨트롤</span></div>
        <p class="ed-empty">타임라인에서 클립을 고르면 위치 · 크기 · 불투명도 · 속도 · 효과 · 전환 · 볼륨을 여기서 바꿔요.<small>컷 사이 빈 곳을 누르면 그 자리에서 '잔물결 삭제'를 할 수 있어요.</small></p></div>
      <div class="ed-panel ed-prog"><div class="ed-tabs"><span class="on">프로그램: Sequence 01</span></div>
        <div class="ed-screen"><video muted playsinline preload="auto" src="${edVideo}" poster="${edPoster}"></video><span class="ed-dur">4.1s</span></div>
        <div class="ed-scrub"><i></i></div>
        <div class="ed-ctrl"><b data-tc>00:00:00:00</b><span class="ed-btns"><i>⇤</i><i>⏮</i><i>‹</i><span class="ed-play" data-play>▶</span><i>›</i><i>⏭</i><i>⇥</i></span><span class="ed-end">00:00:15:00 <i class="ed-vol"></i></span></div></div>
      <div class="ed-panel ed-proj"><div class="ed-tabs"><span class="on">프로젝트</span><span>효과</span></div>
        <div class="ed-proj__btns"><span class="dn-pill">가져오기…</span><span class="dn-pill">새 항목 ▾</span></div>
        <small class="ed-cap">Director 샷 · 4</small><div class="ed-row"><i>${shot('0 0 320 180')}</i><span>샷 1 · WS · 테이크 1</span><small>V · 04:00</small></div><div class="ed-row"><i>${shot('112 66 96 54')}</i><span>샷 2 · MS · 테이크 1</span><small>V · 04:00</small></div><div class="ed-row"><i>${shot('128 79 46 25.9')}</i><span>샷 3 · CU · 테이크 1</span><small>V · 03:00</small></div><div class="ed-row"><i>${shot('118 58 120 67.5')}</i><span>샷 4 · 2S · 테이크 1</span><small>V · 04:00</small></div><small class="ed-cap">내 파일 · 1</small></div>
      <div class="ed-panel ed-tools"><i>➤</i><i class="on">✂</i><i>T</i></div>
      <div class="ed-panel ed-tl"><div class="ed-tl__bar"><b>Sequence 01</b><b class="ed-tc2" data-tc2>00:00:00:00</b><span class="ed-snap">스냅 켜짐</span><span class="dn-pill">마커 추가</span><span class="dn-pill">+ V 트랙</span><span class="dn-pill">+ A 트랙</span><small>자르기 도구 · 클립을 누르면 그 자리에서 나눠요</small></div>
        <div class="ed-ruler"><span>00:00:00:00</span><span>00:00:10:00</span></div>
        <div class="ed-track"><b>V3</b></div><div class="ed-track"><b>V2</b></div>
        <div class="ed-track ed-track--v1"><b>V1</b><div class="ed-clips"><i style="width:80px">${shot('0 0 320 180')}<b>WS</b><small>4s</small></i><i style="width:80px">${shot('112 66 96 54')}<b>MS</b><small>4s</small></i><i style="width:60px">${shot('128 79 46 25.9')}<b>CU</b><small>3s</small></i><i style="width:80px">${shot('118 58 120 67.5')}<b>2S</b><small>4s</small></i></div></div>
        <div class="ed-track ed-track--a1"><b>A1</b><div class="ed-wave"></div></div>
        <span class="ed-head" data-head></span></div>
      <div class="ed-panel ed-meter"><i data-meter></i></div>
    </div>
  </section>

  <aside class="sim-chat"><div class="sim-chat__head"><img src="${lcSrc}" alt="" /><b class="sim-chat__title">Lumi와 산문 쓰기</b><span>»</span></div><div class="sim-chat__log"></div>${input('예) 다시 써 줘, 결말을 더 웃기게')}<div class="sim-chat__foot"><span class="sim-chat__stage"></span></div></aside>
  <div class="sim-busy"><div class="sim-busy__card"><img src="${lwLoad}" alt="" /><p class="sim-busy__h">산문 초안을 쓰고 있어요</p><p class="sim-busy__s">AI가 작업하는 동안 화면과 채팅이 잠겨요. 끝나면 고칠 수 있어요.</p><ul><li>재료 정리하기</li><li>이야기 뼈대</li><li>장면별 이야기 쓰기</li></ul></div></div>
  <svg class="sim-cursor" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 2l16 9.5-7 1.6L9.5 20z" fill="#fff" stroke="#141312" stroke-width="1.4" stroke-linejoin="round"/></svg>
</div>`
}

export function createSim(host, { loop = false, onStep, last = 'editor' } = {}) {
  const END = STEPS.indexOf(last) + 1
  host.classList.add('sim')
  host.innerHTML = template()
  const $ = (s) => host.querySelector(s)
  const $$ = (s) => Array.from(host.querySelectorAll(s))
  const canvas = $('.sim__canvas')
  const fit = () => { canvas.style.transform = `scale(${host.clientWidth / 1440})` }
  new ResizeObserver(fit).observe(host)
  fit()
  const cursor = $('.sim-cursor')
  let run = 0

  const pos = (el, fx = 0.5, fy = 0.5) => {
    const c = canvas.getBoundingClientRect(), r = el.getBoundingClientRect(), k = c.width / 1440
    return [(r.left - c.left + r.width * fx) / k, (r.top - c.top + r.height * fy) / k]
  }
  const move = async (el, fx, fy) => { const [x, y] = pos(el, fx, fy); cursor.style.left = x + 'px'; cursor.style.top = y + 'px'; await sleep(750) }
  const click = async (el, fx, fy) => { await move(el, fx, fy); cursor.classList.add('press'); el.classList.add('press'); await sleep(160); cursor.classList.remove('press'); el.classList.remove('press'); await sleep(120) }
  const type = async (inp, text, alive) => { const b = inp.querySelector(':scope > b'); inp.querySelector('.ph').hidden = true; inp.classList.add('ready'); for (let i = 1; i <= text.length && alive(); i++) { b.textContent = text.slice(0, i); await sleep(55) } }
  const clearInput = (inp) => { inp.querySelector(':scope > b').textContent = ''; inp.querySelector('.ph').hidden = false; inp.classList.remove('ready') }
  const add = (log, html) => { log.insertAdjacentHTML('beforeend', html); return log.lastElementChild }
  const think = async (log, ms = 900, center) => { const d = add(log, `<div class="sim-msg${center ? ' sim-msg--c' : ''}"><span class="sim-msg__av"><img src="${stageLumi}" alt="" /></span><div><span class="sim-dots"><i></i><i></i><i></i></span></div></div>`); await sleep(ms); d.remove() }
  const ask = (k) => $$('.sim-set span').forEach((s) => s.classList.toggle('ask', s.dataset.q === k))


  // Director 노드 연결선: 노드의 실제 자리를 재서 그려요 (끊기지 않게)
  function drawDn() {
    const board = $('.dn-board'), svg = $('.dn-lines')
    if (!board || !svg) return
    const W = board.offsetWidth, H = board.offsetHeight
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`)
    const box = (el) => ({ l: el.offsetLeft, r: el.offsetLeft + el.offsetWidth, y: el.offsetTop + 48, t: el.offsetTop, h: el.offsetHeight })
    const curve = (x1, y1, x2, y2, cls = '') => { const dx = Math.max(24, (x2 - x1) * 0.5); return `<path class="${cls}" d="M${x1} ${y1} C${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}"/>` }
    const assets = $$('.dn-node--asset').map(box)
    const img = (n) => box($(`[data-shot="${n}"]`)), vid = (n) => box($(`[data-vid="${n}"]`))
    let d = ''
    // 인물 · 배경 → 샷 1 · 2 이미지
    for (const n of [1, 2]) { const i = img(n); assets.forEach((a, k) => { d += curve(a.r, a.t + a.h / 2, i.l, i.y + 10 + k * 14, 'a') }) }
    // 이미지 → 영상
    for (const n of [1, 2, 3, 4]) { const i = img(n), v = vid(n); d += curve(i.r, i.y, v.l, v.y, 'iv') }
    // 영상 1 → 샷 3 이미지, 영상 2 → 샷 4 이미지 (이전 영상)
    for (const [v, n] of [[1, 3], [2, 4]]) { const a = vid(v), b = img(n); d += curve(a.r, a.y, b.l, b.y, 'prev') }
    // 인물 → 샷 3 · 4 이미지 (점선, 위로 지나가요)
    for (const n of [3, 4]) { const i = img(n); assets.slice(0, 2).forEach((a, k) => { d += curve(a.r, a.t + a.h / 2, i.l, i.y + 24 + k * 14, 'a far') }) }
    svg.innerHTML = d
  }
  function setStep(s) {
    stageLumi = LUMI[s] || lumiSrc
    host.dataset.s = s
    $('.sim-badge').textContent = NAMES[s]
    const at = STEPS.indexOf(s)
    $$('.sim-nav').forEach((n, i) => { n.classList.toggle('on', i === at); n.classList.toggle('done', i < at) })
    $$('.sim-scene').forEach((n) => n.classList.toggle('on', n.dataset.scene === s))
    host.classList.toggle('sim--chat', s !== 'producer' && s !== 'editor' && s !== 'director')
    $('.sim-chat__title').textContent = { writer: 'Lumi와 산문 쓰기', artist: 'Lumi와 그림 그리기', storyboard: 'Lumi와 연출하기', director: 'Lumi와 연출하기' }[s] || 'Lumi'
    $('.sim-chat__stage').textContent = NAMES[s]
    const btns = {
      writer: '<span class="sim-btn">직접 쓰기</span><span class="sim-btn">AI 다시 쓰기</span><span class="sim-btn sim-btn--cream" data-go>브레이크다운 →</span>',
      artist: '<span class="sim-btn sim-btn--cream" data-go>완료 · Storyboard로 →</span>',
      storyboard: '<span class="sim-btn sim-btn--cream" data-go>다음: Director →</span>',
      director: '<span class="sim-btn sim-btn--cream" data-go>다음: Editor →</span>',
      editor: '<span class="sim-btn">← Director로</span><span class="sim-btn sim-btn--cream" data-go>내보내기</span>',
    }
    $('.sim-btns').innerHTML = btns[s] || '<span class="sim-seg sim-seg--top"><span>화면에서 고르기</span><span class="on">채팅으로 만들기</span></span>'
    if (s === 'director') requestAnimationFrame(drawDn)
    onStep?.(s)
  }

  function reset() {
    $('.sim-pro__log').innerHTML = ''
    $('.sim-chat__log').innerHTML = ''
    $$('.sim-set b').forEach((b) => (b.textContent = '아직'))
    $$('.sim-set span').forEach((s) => s.classList.remove('ask', 'set'))
    $$('.sim-input').forEach(clearInput)
    $$('.sim-para .w').forEach((w) => w.classList.remove('on'))
    $$('.sim-para').forEach((p) => { p.classList.remove('sel', 'old'); p.querySelector('.sim-fix')?.remove() })
    $('.sim-para[data-i="1"] .sim-para__t').innerHTML = PROSE[1].split(' ').map((w) => `<span class="w">${w} </span>`).join('')
    $$('.sim-card').forEach((c) => c.classList.remove('on', 'redo', 'drawing'))
    $$('.sim-styles__c').forEach((c) => c.classList.remove('pick'))
    $$('.sim-modal').forEach((m) => m.classList.remove('on'))
    $$('.sim-attach').forEach((a) => a.remove()); $$('.has-attach').forEach((a) => a.classList.remove('has-attach')); $('.sim-busy').classList.remove('on')
    { const v = $('.ed-screen video'); if (v) { v.pause(); try { v.currentTime = 0 } catch (e) {} } const h = $('[data-head]'); if (h) h.style.left = '90px'; $$('[data-tc],[data-tc2]').forEach((e) => (e.textContent = '00:00:00:00')); const sc = $('.ed-scrub i'); if (sc) sc.style.width = '0'; const pl = $('[data-play]'); if (pl) pl.textContent = '▶' }
    $$('.dn-node--vid').forEach((n) => { n.classList.remove('loading', 'done'); n.querySelector('.sim-prog i').style.width = '0' })
    $$('.dn-node--img').forEach((n) => n.classList.remove('vdone'))
    $('[data-all]').classList.remove('on'); $('[data-make]').classList.remove('off')
    $('[data-k="vids"]').textContent = '4'; $('[data-k="hint"]').textContent = '영상을 만들 수 있어요'
  }

  const SCENES = {
    async producer(alive) {
      const log = $('.sim-pro__log'), inp = $('.sim-pro .sim-input')
      add(log, msg('안녕하세요! 어떤 이야기를 만들어 볼까요?<br>한 줄이면 충분해요. 장르 · 길이 · 화면 비율은 같이 정해요.<div class="sim-qs"><span class="sim-chipq">아이디어가 있어요</span><span class="sim-chipq">대본이 있어요</span><span class="sim-chipq">파일을 올릴게요</span><span class="sim-chipq">예시를 보여 주세요</span></div>', true))
      await sleep(900); if (!alive()) return
      const line = t('비 오는 버스 정류장, 우산 하나를 같이 쓰게 된 두 사람')
      await click(inp, 0.3); await type(inp, line, alive); if (!alive()) return
      await click(inp.querySelector('.sim-input__send')); clearInput(inp)
      add(log, `<p class="sim-me">${line}</p>`)
      await think(log, 900, true); if (!alive()) return
      ask('genre')
      const q = add(log, msg('장르와 분위기는 어떻게 할까요?<div class="sim-qs"><span class="sim-chipq">코미디</span><span class="sim-chipq">드라마</span><span class="sim-chipq rec">로맨스<em>추천</em></span><span class="sim-chipq">스릴러</span><span class="sim-chipq">일상</span></div><p class="sim-why">✦ 비 오는 정류장에서 우산을 나눠 쓰는 건 전형적인 로맨스 분위기예요.</p>', true))
      await sleep(900); if (!alive()) return
      const chip = q.querySelector('.rec'); await click(chip); chip.classList.add('pick'); q.querySelector('.sim-qs').classList.add('done')
      $('[data-k="genre"]').textContent = '로맨스'; $('[data-q="genre"]').classList.add('set')
      ask('len')
      const q2 = add(log, msg(`어느 정도 길이로 할까요?${pick([['15초 이하', '숏폼'], ['15–60초', '광고 · 티저', true], ['1–5분', '뮤비 · 웹드라마'], ['5–20분', '단편']])}`, true))
      await sleep(800); if (!alive()) return
      const c1 = q2.querySelector('.sim-pick__c'); await click(c1); c1.classList.add('pick'); q2.querySelector('.sim-pick').classList.add('done')
      $('[data-k="len"]').textContent = '15초 이하'; $('[data-q="len"]').classList.add('set')
      $('[data-k="lvl"]').textContent = '2 다듬기'; $('[data-q="lvl"]').classList.add('set')
      ask('ratio')
      const q3 = add(log, msg(`화면 비율을 골라 주세요.<p class="sim-lock">🔒 한 번 고르면 끝까지 바꿀 수 없어요.</p>${pick([['16:9', '가로'], ['9:16', '세로 · 숏폼', true], ['1:1', '정사각'], ['2.39:1', '시네마']])}`, true))
      await sleep(800); if (!alive()) return
      const c2 = q3.querySelector('.sim-pick__c'); await click(c2); c2.classList.add('pick'); q3.querySelector('.sim-pick').classList.add('done')
      $('[data-k="ratio"]').textContent = '16:9'; $('[data-q="ratio"]').classList.add('set'); ask('')
      await think(log, 700, true); if (!alive()) return
      const sum = add(log, msg('이렇게 시작할게요.<div class="sim-sum"><div><span>🔒 화면 비율</span>16:9 · 시작하면 못 바꿔요</div><div><span>장르와 분위기</span>로맨스</div><div><span>길이</span>15초 이하</div><div><span>바꿀 정도</span>2 다듬기 · 재료는 두고 문장만 고쳐요</div></div><div class="sim-sum-btns"><span class="sim-btn sim-btn--cream">네, 산문 쓰기</span><span class="sim-btn">아니요, 더 고칠래요</span></div>', true))
      await sleep(1200); if (!alive()) return
      await click(sum.querySelector('.sim-btn--cream'))
      const busy = $('.sim-busy'); busy.classList.add('on')
      for (const li of busy.querySelectorAll('li')) { await sleep(650); if (!alive()) return; li.classList.add('on') }
      await sleep(500); busy.classList.remove('on')
      busy.querySelectorAll('li').forEach((l) => l.classList.remove('on'))
      await sleep(200)
    },
    async writer(alive) {
      const log = $('.sim-chat__log'), inp = $('.sim-chat .sim-input')
      for (const w of $$('.sim-para .w')) { if (!alive()) return; w.classList.add('on'); await sleep(40) }
      add(log, msg('산문을 장면 2개로 썼어요. 마음에 안 들면 "다시 써 줘"라고 하거나 조건을 바꿔 주세요.'))
      await sleep(800); if (!alive()) return
      const p2 = $('.sim-para[data-i="1"]'); await click(p2, 0.3, 0.5); p2.classList.add('sel')
      const att = document.createElement('span'); att.className = 'sim-attach'
      att.innerHTML = `<b>S2</b>${p2.querySelector('.sim-para__t').textContent.trim().slice(0, 40)}…<i>✕</i>`
      inp.prepend(att); inp.classList.add('has-attach')
      await sleep(500); await click(inp, 0.4, 0.8); await type(inp, t('조금 더 설레게'), alive); if (!alive()) return
      await click(inp.querySelector('.sim-input__send')); clearInput(inp); att.remove(); inp.classList.remove('has-attach')
      add(log, `<p class="sim-me">S2 조금 더 설레게</p>`)
      await think(log, 1100); if (!alive()) return
      const fix = document.createElement('div'); fix.className = 'sim-fix'
      fix.innerHTML = `<small>✦ AI 수정안</small>${FIX}<div class="sim-sum-btns"><span class="sim-btn">버리기</span><span class="sim-btn sim-btn--cream">적용</span></div>`
      p2.classList.remove('sel'); p2.classList.add('old'); p2.append(fix)
      add(log, msg('S2를 고쳤어요. 바뀐 곳을 산문에 표시했어요. [적용]을 누르기 전까지 원문은 그대로예요.'))
      await sleep(900); if (!alive()) return
      await click(fix.querySelector('.sim-btn--cream'))
      fix.remove(); p2.classList.remove('old'); p2.querySelector('.sim-para__t').innerHTML = `<span class="w on">${FIX}</span>`
      await sleep(600); if (!alive()) return
      await click($('[data-go]'))
    },
    async artist(alive) {
      const log = $('.sim-chat__log')
      add(log, msg('확정한 산문에서 인물 2명, 배경 1곳을 골랐어요. 어떤 스타일로 그릴까요?'))
      const modal = $('[data-modal="style"]'); modal.classList.add('on')
      await sleep(900); if (!alive()) return
      const c = modal.querySelector('.first'); await click(c); c.classList.add('pick')
      await sleep(300); await click(modal.querySelector('[data-draw]')); if (!alive()) return
      modal.classList.remove('on')
      for (const card of $$('[data-scene="artist"] .sim-card')) { if (!alive()) return; await sleep(650); card.classList.add('on') }
      add(log, msg('다 그렸어요. 얼굴 · 옷은 모든 컷에서 이 시트대로 이어져요.'))
      await sleep(900); if (!alive()) return
      await click($('[data-go]'))
    },
    async storyboard(alive) {
      const log = $('.sim-chat__log')
      add(log, msg('씬 2개, 샷 4개로 나누고 러프를 그려요. 다 그린 샷부터 하나씩 나타나요.'))
      for (const card of $$('[data-scene="storyboard"] .sim-card')) { if (!alive()) return; await sleep(420); card.classList.add('on') }
      await sleep(500); if (!alive()) return
      const redo = $('[data-scene="storyboard"] .sb-redo'); await move(redo, 0.5, 0.45); redo.classList.add('redo')
      add(log, msg('샷 4개, 15초예요. 영상으로 만들기 전에 마음에 안 드는 컷은 다시 그려요. 러프는 무료예요.'))
      await sleep(900); if (!alive()) return
      await click(redo.querySelector('.sim-tag')); redo.classList.remove('redo'); redo.classList.add('drawing')
      await sleep(1400); if (!alive()) return
      redo.classList.remove('drawing')
      await sleep(700); if (!alive()) return
      await click($('[data-go]'))
    },
    async director(alive) {
      await sleep(700); if (!alive()) return
      await click($('[data-all]')); $('[data-all]').classList.add('on')
      await sleep(300); await click($('[data-make]')); if (!alive()) return
      let left = 4
      for (const n of [1, 2, 3, 4]) {
        const v = $(`[data-vid="${n}"]`); v.classList.add('loading')
        const bar = v.querySelector('.sim-prog i')
        for (let p = 0; p <= 100 && alive(); p += 5) { bar.style.width = p + '%'; await sleep(90) }
        if (!alive()) return
        v.classList.remove('loading'); v.classList.add('done'); $(`[data-shot="${n}"]`).classList.add('vdone')
        left--; $('[data-k="vids"]').textContent = String(left)
      }
      $('[data-make]').classList.add('off'); $('[data-k="hint"]').textContent = '모든 샷에 영상이 있어요'
      await sleep(1100); if (!alive()) return
      await click($('[data-go]'))
    },
    async editor(alive) {
      const v = $('.ed-screen video'), head = $('[data-head]'), meter = $('[data-meter]')
      const tc = (s) => { const f = Math.floor((s % 1) * 30); const ss = Math.floor(s); return `00:00:${String(ss).padStart(2, '0')}:${String(f).padStart(2, '0')}` }
      await sleep(500); if (!alive()) return
      await click($('[data-play]')); $('[data-play]').textContent = '❚❚'
      try { v.currentTime = 0; v.playbackRate = 1.25; await v.play() } catch (e) {}
      const t0 = performance.now()
      while (alive()) {
        // 영상이 재생되지 않는 환경에서도 재생 헤드는 흐르게
        const s = !v.paused && v.currentTime > 0 ? v.currentTime : Math.min(15, ((performance.now() - t0) / 1000) * 1.25)
        head.style.left = `${90 + (s / 15) * 300}px`
        $('[data-tc]').textContent = tc(s); $('[data-tc2]').textContent = tc(s)
        $('.ed-scrub i').style.width = `${(s / 15) * 100}%`
        meter.style.height = `${30 + Math.random() * 55}%`
        if (s >= 14.9 || v.ended) break
        await sleep(90)
      }
      v.pause(); $('[data-play]').textContent = '▶'
      if (!alive()) return
      await sleep(700); if (!alive()) return
      await click($('[data-go]'))
      await sleep(1000)
    },
  }

  async function play(from = 'producer', only = false) {
    const my = ++run
    const alive = () => my === run
    reset()
    let i = STEPS.indexOf(from)
    // 앞 단계 결과는 이미 된 상태로
    if (i > 0) prefill(i)
    while (alive()) {
      const s = STEPS[i]
      setStep(s)
      $('.sim-chat__log').innerHTML = ''
      await sleep(500)
      if (!alive()) return
      await SCENES[s](alive)
      if (!alive()) return
      if (only) { await sleep(2400); if (!alive()) return; reset(); if (i > 0) prefill(i); continue }
      i++
      if (i >= END) { if (!loop) return; i = 0; reset() }
    }
  }
  function prefill(i) {
    if (i > 1) $$('.sim-para .w').forEach((w) => w.classList.add('on'))
    if (i > 2) $$('[data-scene="artist"] .sim-card').forEach((c) => c.classList.add('on'))
  }
  function still(s) {
    run++
    reset(); setStep(s); prefill(STEPS.indexOf(s) + 1)
    if (s === 'storyboard') $$('[data-scene="storyboard"] .sim-card').forEach((c) => c.classList.add('on'))
    if (s === 'director') { $$('.dn-node--vid').forEach((n) => n.classList.add('done')); $$('.dn-node--img').forEach((n) => n.classList.add('vdone')) }
  }
  return { play, still, stop: () => run++, setStep }
}
