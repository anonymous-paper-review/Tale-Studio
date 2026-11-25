// 약관 · 정책 화면: #terms · #refund · #privacy · #acceptable-use, 한국어 / English 전환
import termsKo from './legal/terms.ko.html?raw'
import termsEn from './legal/terms.en.html?raw'
import refundKo from './legal/refund.ko.html?raw'
import refundEn from './legal/refund.en.html?raw'
import privacyKo from './legal/privacy.ko.html?raw'
import privacyEn from './legal/privacy.en.html?raw'
import aupKo from './legal/acceptable-use.ko.html?raw'
import aupEn from './legal/acceptable-use.en.html?raw'
import { lang } from './i18n.js'

const DOCS = { terms: [termsKo, termsEn], refund: [refundKo, refundEn], privacy: [privacyKo, privacyEn], 'acceptable-use': [aupKo, aupEn] }
const root = document.getElementById('legal')
if (root) {
  const render = () => {
    root.querySelectorAll('.legal__doc').forEach((a) => {
      const pair = DOCS[a.id]
      a.innerHTML = pair[lang === 'en' ? 1 : 0]
      a.lang = lang
    })
    root.querySelectorAll('[data-ko]').forEach((e) => (e.textContent = lang === 'en' ? e.dataset.en : e.dataset.ko))
  }
  const show = () => {
    const id = location.hash.slice(1)
    if (!DOCS[id]) return
    root.querySelectorAll('.legal__doc').forEach((a) => (a.hidden = a.id !== id))
    root.querySelectorAll('.legal__nav a').forEach((l) => l.setAttribute('aria-current', l.getAttribute('href') === '#' + id ? 'page' : 'false'))
    document.title = `${root.querySelector(`.legal__nav a[href="#${id}"]`)?.textContent} · Tale Studio`
  }
  render(); show()
  addEventListener('hashchange', show)
}

// 처음 #privacy 같은 주소로 들어오면 브라우저가 문서 중간으로 내려가지 않게 맨 위에서 시작해요
addEventListener('load', () => { if (DOCS[location.hash.slice(1)]) requestAnimationFrame(() => scrollTo(0, 0)) })
