// 사이트 전체 한국어 / English
// - 언어는 localStorage 'tale-lang' 또는 주소의 ?lang=en|ko 로 정해요. 바꾸면 페이지를 다시 불러요.
// - 영어일 때: 화면의 한국어 글자를 사전(i18n/en.js)으로 바꾸고, 나중에 생기는 글자(채팅 · 시연)도 따라 바꿔요.
import { BLOCK, TEXT, PROSE } from './i18n/en.js'

const read = () => {
  try {
    const q = new URLSearchParams(location.search).get('lang')
    if (q === 'en' || q === 'ko') { localStorage.setItem('tale-lang', q); return q }
    return localStorage.getItem('tale-lang') || 'ko'
  } catch { return 'ko' }
}
export const lang = read()
const EN = lang === 'en'
const norm = (s) => s.replace(/\s+/g, ' ').trim()
const H = /[가-힣]/

/** 코드 안의 문장: 영어면 사전에서 찾아 바꿔요 */
export const t = (s) => (EN ? PROSE[s] ?? TEXT[norm(s)] ?? s : s)

const INLINE = new Set(['BR', 'SPAN', 'B', 'STRONG', 'EM', 'I', 'SMALL', 'S', 'A', 'U'])
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'svg', 'SVG', 'VIDEO'])
const ATTRS = ['placeholder', 'aria-label', 'title', 'alt']
const blockOk = (el) => Array.from(el.querySelectorAll('*')).every((c) => INLINE.has(c.tagName) && !c.id && !Array.from(c.attributes).some((a) => a.name.startsWith('data-')))

function tr(el) {
  if (el.nodeType !== 1) return
  for (const a of ATTRS) { const v = el.getAttribute(a); if (v && H.test(v)) { const e = TEXT[norm(v)]; if (e) el.setAttribute(a, e) } }
  if (SKIP.has(el.tagName) || el.classList?.contains('legal__doc')) return
  if (el.dataset.ko && el.dataset.en) el.textContent = el.dataset.en
  if (H.test(el.textContent || '')) {
    const b = BLOCK[norm(el.textContent)]
    if (b && blockOk(el)) { el.innerHTML = b; return }
    for (const n of el.childNodes) {
      if (n.nodeType === 3 && H.test(n.textContent)) {
        const key = norm(n.textContent), e = TEXT[key] ?? PROSE[key]
        if (e != null) { const m = n.textContent.match(/^(\s*)[\s\S]*?(\s*)$/); n.textContent = m[1] + e + m[2] }
      }
    }
  }
  for (const c of Array.from(el.children)) tr(c)
}

/** 화면 전체를 영어로 바꾸고, 이후에 생기는 글자도 계속 바꿔요 */
export function applyLanguage() {
  document.documentElement.lang = lang
  document.querySelectorAll('[data-lang-pick]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.langPick === lang)))
  document.querySelectorAll('[data-lang-now]').forEach((e) => (e.textContent = EN ? 'EN' : 'KO'))
  if (!EN) return
  document.title = 'Tale Studio · Write it, and it becomes a film'
  document.querySelector('meta[name="description"]')?.setAttribute('content', 'Plan, write, cast, storyboard, generate and edit in one place. Tale Studio is the all-in-one previz studio you build with Lumi.')
  tr(document.body)
  new MutationObserver((ms) => ms.forEach((m) => {
    if (m.type === 'characterData') { const p = m.target.parentElement; if (p && H.test(m.target.textContent)) tr(p) }
    else m.addedNodes.forEach((n) => { if (n.nodeType === 1) tr(n); else if (n.nodeType === 3 && n.parentElement && H.test(n.textContent)) tr(n.parentElement) })
  })).observe(document.body, { childList: true, subtree: true, characterData: true })
}

// 상단 언어 드롭다운
const pick = document.querySelector('.lang-pick')
if (pick) {
  const btn = pick.querySelector('.lang-pick__btn'), menu = pick.querySelector('.lang-pick__menu')
  const close = () => { pick.classList.remove('open'); btn.setAttribute('aria-expanded', 'false') }
  btn.addEventListener('click', (e) => { e.stopPropagation(); const o = !pick.classList.contains('open'); pick.classList.toggle('open', o); btn.setAttribute('aria-expanded', String(o)) })
  document.addEventListener('click', (e) => { if (!pick.contains(e.target)) close() })
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close() })
  menu.querySelectorAll('[data-lang-pick]').forEach((o) => o.addEventListener('click', () => {
    const v = o.dataset.langPick
    if (v === lang) return close()
    try { localStorage.setItem('tale-lang', v) } catch {}
    const u = new URL(location.href)
    if (u.searchParams.has('lang')) { u.searchParams.delete('lang'); location.replace(u.toString()) } else location.reload()
  }))
}
