// 두 페이지 공통: 밝게 · 어둡게 토글(기억), 나타나기, 내비 배경
const root = document.documentElement
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches

document.querySelector('.theme-toggle')?.addEventListener('click', () => {
  const next = root.dataset.theme === 'dark' ? 'light' : 'dark'
  root.dataset.theme = next
  try { localStorage.setItem('tale-theme-v2', next) } catch {}
  dispatchEvent(new Event('tale-theme'))
})

const items = document.querySelectorAll('.reveal')
if (reduce || !('IntersectionObserver' in window)) items.forEach((e) => e.classList.add('in'))
else {
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) } }), { rootMargin: '0px 0px -8% 0px', threshold: 0.08 })
  items.forEach((e) => io.observe(e))
}

const nav = document.querySelector('.nav')
const onScroll = () => nav?.classList.toggle('nav--scrolled', scrollY > 8)
addEventListener('scroll', onScroll, { passive: true })
onScroll()

// 한 파일 안의 화면: #home · #service · #pricing (다른 #은 그 요소가 있는 화면을 열고 그 자리로)
const views = Array.from(document.querySelectorAll('[data-view]'))
function route() {
  const id = decodeURIComponent(location.hash.slice(1)) || 'home'
  let target = document.getElementById(id)
  const view = target?.closest('[data-view]') || views[0]
  const changed = view.hidden
  views.forEach((v) => (v.hidden = v !== view))
  document.querySelectorAll('.nav__links a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#' + view.id))
  if (view.id === 'home' && !view.contains(target)) target = null
  if (view.id === 'legal') target = null // 약관 문서는 항상 맨 위부터
  if (target === view || !target) scrollTo({ top: 0, behavior: changed ? 'instant' : 'smooth' })
  else requestAnimationFrame(() => target.scrollIntoView({ behavior: changed ? 'instant' : 'smooth' }))
  if (changed) view.querySelectorAll('.reveal').forEach((e) => e.getBoundingClientRect().top < innerHeight && e.classList.add('in'))
}
addEventListener('hashchange', route)
route()
