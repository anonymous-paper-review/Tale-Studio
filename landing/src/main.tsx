import hlP from '../assets/lumi-producer.webp'
import hlW from '../assets/lumi-writer.webp'
import hlA from '../assets/lumi-artist.webp'
import hlS from '../assets/lumi-storyboard.webp'
import hlD from '../assets/lumi-director.webp'
import hlE from '../assets/lumi-editor.webp'
import './page.css'
import './lumi-chat.js'
import { applyLanguage } from './i18n.js'
import './common.js'
import { createSim } from './appsim.js'
import { createVignettes } from './vignette.js'


// 첫 화면 입력창: 파일 첨부 · 카테고리 고르기
const pform = document.querySelector<HTMLFormElement>('form.prompt')
const fileIn = pform?.querySelector<HTMLInputElement>('.attach input')
const fileRow = pform?.querySelector<HTMLElement>('.prompt__file')
fileIn?.addEventListener('change', () => {
  const f = fileIn.files?.[0]
  if (!fileRow) return
  fileRow.hidden = !f
  fileRow.querySelector('span')!.textContent = f ? `📎 ${f.name}` : ''
})
fileRow?.querySelector('button')?.addEventListener('click', () => { if (fileIn) fileIn.value = ''; fileRow.hidden = true })
const cats = Array.from(document.querySelectorAll<HTMLElement>('.cat'))
const closeCats = (except?: HTMLElement) => cats.forEach((c) => { if (c !== except) { c.classList.remove('open'); c.querySelector('.cat__btn')!.setAttribute('aria-expanded', 'false') } })
cats.forEach((c) => {
  const btn = c.querySelector<HTMLButtonElement>('.cat__btn')!
  btn.addEventListener('click', (e) => { e.stopPropagation(); const open = !c.classList.contains('open'); closeCats(c); c.classList.toggle('open', open); btn.setAttribute('aria-expanded', String(open)) })
  c.querySelectorAll<HTMLButtonElement>('.cat__menu button').forEach((o) => o.addEventListener('click', (e) => {
    e.stopPropagation()
    c.querySelectorAll('.cat__menu button').forEach((x) => x.setAttribute('aria-selected', String(x === o)))
    btn.querySelector('b')!.textContent = o.textContent
    closeCats()
  }))
})
document.addEventListener('click', () => closeCats())
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCats() })

// 작품 슬라이드: 끊김 없이 흐르도록 한 벌 더
const track = document.querySelector('.carousel__track')
if (track) Array.from(track.children).forEach((c) => { const d = c.cloneNode(true) as HTMLElement; d.setAttribute('aria-hidden', 'true'); track.append(d) })
// 작품 영상: 작품 영역이 보일 때만 재생해요
const works = document.querySelector('.works')
if (works) new IntersectionObserver((es) => es.forEach((e) => works.querySelectorAll('video').forEach((v) => { if (e.isIntersecting) v.play().catch(() => {}); else v.pause() })), { threshold: 0.15 }).observe(works)

// 여섯 단계: 보고 있는 단계로 오른쪽 Lumi가 옷을 갈아입어요
const sixItems = Array.from(document.querySelectorAll<HTMLElement>('.six__item'))
const card = document.querySelector<HTMLElement>('.six__card')
const nameEl = document.getElementById('sixName'), numEl = document.getElementById('sixNum')
let current = ''
const sim2 = createVignettes(document.getElementById('sim2')!)
let sim2Visible = false
const activate = (el: HTMLElement) => {
  const p = el.dataset.p!
  if (p === current) return
  current = p
  sixItems.forEach((x) => x.classList.toggle('on', x === el))
  card?.style.setProperty('--c', el.style.getPropertyValue('--c'))
  const order = sixItems.map((x) => x.dataset.p)
  const at = order.indexOf(p)
  void at
  // 오른쪽: 직접 만든 패널이 있으면 그 패널을, 없으면 작은 동작 화면(sim2)을 보여 줘요
  const panel = card?.querySelector<HTMLElement>(`.six__panel[data-panel="${p}"]`)
  card?.classList.toggle('is-panel', !!panel)
  card?.querySelectorAll('.six__panel').forEach((x) => x.classList.toggle('on', x === panel))
  if (panel) { sim2.stop(); panel.classList.remove('go'); void panel.offsetWidth; panel.classList.add('go') }
  else if (sim2Visible) sim2.play(p, true); else sim2.still(p)
  if (nameEl) nameEl.textContent = el.querySelector('h3')!.textContent
  if (numEl) numEl.textContent = `${String(sixItems.indexOf(el) + 1).padStart(2, '0')} / ${String(sixItems.length).padStart(2, '0')}`
}
const sio = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && activate(e.target as HTMLElement)), { rootMargin: '-45% 0px -45% 0px' })
sixItems.forEach((x) => sio.observe(x))
if (sixItems[0]) activate(sixItems[0])



// 한 줄의 여정: 앱 시뮬레이션이 Producer부터 Editor까지 이어서 재생돼요
const stabs = Array.from(document.querySelectorAll<HTMLButtonElement>('.glass-tabs button'))
const sim = createSim(document.getElementById('sim')!, {
  loop: true,
  onStep: (s: string) => stabs.forEach((b) => { const on = b.dataset.s === s; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)) }),
})
let simStarted = false
stabs.forEach((b) => b.addEventListener('click', () => { simStarted = true; sim.play(b.dataset.s!) }))
new IntersectionObserver((es) => es.forEach((e) => {
  if (e.isIntersecting && !simStarted) { simStarted = true; sim.play('producer') }
  else if (!e.isIntersecting && simStarted) { simStarted = false; sim.stop(); sim.still('producer') }
}), { threshold: 0.3 }).observe(document.getElementById('sim')!)
sim.still('producer')
new IntersectionObserver((es) => es.forEach((e) => {
  sim2Visible = e.isIntersecting
  if (current && !card?.querySelector(`.six__panel[data-panel="${current}"]`)) { if (sim2Visible) sim2.play(current, true); else sim2.stop() }
}), { threshold: 0.3 }).observe(document.getElementById('sim2')!)

// 마지막 구간: 작은 별들이 그라데이션 빛으로 터지며 바탕이 돼요
// 마지막 구간들(메인 · Tale 서비스 · 요금): 별이 폭죽처럼 터져요
const STAR = ['#F2A33A', '#E8606F', '#8B63E8', '#5A6AE6', '#3E9BE0', '#2DB39A']
const pop = (burst: HTMLElement) => {
  const c = STAR[Math.floor(Math.random() * 6)]
  const fw = document.createElement('span')
  fw.className = 'fw'
  fw.style.cssText = `left:${8 + Math.random() * 84}%;top:${18 + Math.random() * 64}%;--c:${c};--s:${(0.9 + Math.random() * 0.6).toFixed(2)}`
  // 색종이 조각: 한 점에서 퍼졌다가 반짝이며 천천히 떨어져요
  const bits = Array.from({ length: 38 }, () => {
    const a = Math.random() * Math.PI * 2, r = 60 + Math.random() * 130
    const col = Math.random() < 0.55 ? c : STAR[Math.floor(Math.random() * 6)]
    return `<i style="--x:${(Math.cos(a) * r).toFixed(0)}px;--y:${(Math.sin(a) * r * 0.8 - 20).toFixed(0)}px;--f:${(50 + Math.random() * 70).toFixed(0)}px;--r:${(Math.random() * 720 - 360).toFixed(0)}deg;--w:${(2 + Math.random() * 2.5).toFixed(1)}px;--k:${col};--dl:${(Math.random() * 0.12).toFixed(2)}s;--tw:${(0.35 + Math.random() * 0.4).toFixed(2)}s"></i>`
  }).join('')
  fw.innerHTML = '<b></b>' + bits
  burst.append(fw)
  setTimeout(() => fw.remove(), 4200)
}
document.querySelectorAll<HTMLElement>('.burst').forEach((burst) => {
  let timer = 0
  new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting && !timer) {
      // 처음에 세 개를 겹쳐 터뜨리고, 이후 비슷한 간격으로 계속 (앞의 것이 사라지기 전에 다음이 터져요)
      [0, 380, 760].forEach((d) => setTimeout(() => pop(burst), d))
      const next = () => { pop(burst); timer = window.setTimeout(next, 620 + Math.random() * 260) }
      timer = window.setTimeout(next, 1100)
    } else if (!e.isIntersecting && timer) { clearTimeout(timer); timer = 0 }
  }), { threshold: 0.2 }).observe(burst.parentElement!)
})

// 헤드라인: 'Lumi'를 지우고 → 캐릭터가 하나씩 나왔다가 → 다시 'Lumi'를 써요
{
  const box = document.querySelector<HTMLElement>('.hl-lumi')
  const img = box?.querySelector<HTMLImageElement>('.hl-lumi__c')
  const txt = box?.querySelector<HTMLElement>('.hl-lumi__t')
  if (box && img && txt && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const chars = [hlP, hlW, hlA, hlS, hlD, hlE]
    chars.forEach((s) => { const i = new Image(); i.src = s })
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
    const word = 'Lumi'
    const fix = () => { box.style.minWidth = ''; box.style.minWidth = `${txt.offsetWidth}px` }
    document.fonts?.ready.then(fix); addEventListener('resize', fix)
    ;(async () => {
      let k = 0
      await wait(1800)
      for (;;) {
        for (let n = word.length - 1; n >= 0; n--) { txt.textContent = word.slice(0, n) || '\u200b'; await wait(90) }
        img.src = chars[k]; box.classList.add('is-char'); await wait(1300)
        box.classList.remove('is-char'); await wait(260)
        for (let n = 1; n <= word.length; n++) { txt.textContent = word.slice(0, n); await wait(110) }
        k = (k + 1) % chars.length
        await wait(1900)
      }
    })()
  }
}

// 언어: 모든 화면을 만든 뒤 한 번에 바꿔요 (영어일 때)
applyLanguage()
