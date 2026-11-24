import { lang } from './i18n.js'
// 두 페이지 공통: 움직이는 배경 + 화이트 진주 Lumi 챗봇 (누르면 컬러 Lumi로 바뀌며 창이 열려요)
import './lumi-chat.css'
import whiteSrc from '../assets/lumi-white-pearl.webp'
import colorSrc from '../assets/lumi-hd.webp'
import icCollapse from '../assets/icons/collapse.svg'
import icArrow from '../assets/icons/arrow.svg'

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------- 배경 ----------
const amb = document.createElement('div')
amb.className = 'ambient'
amb.setAttribute('aria-hidden', 'true')
const STAR = ['#F2A33A', '#E8606F', '#8B63E8', '#5A6AE6', '#3E9BE0', '#2DB39A']
amb.innerHTML = '<i></i><i></i><i></i><i></i>' +
  Array.from({ length: 30 }, () => `<span class="ambient__spark" style="left:${Math.random() * 100}%;top:${20 + Math.random() * 85}%;--sc:${STAR[Math.floor(Math.random() * 6)]};--sz:${2 + Math.random() * 3}px;--d:${9 + Math.random() * 12}s;--dl:${-Math.random() * 20}s"></span>`).join('')
document.body.prepend(amb)

// ---------- 챗봇 ----------
const PRICING = '/pricing'
const EN = lang === 'en'
const ANSWERS = [
  { k: ['뭐', '무엇', '소개', 'tale', '테일', '서비스', 'what', 'about'], a: EN ? 'Tale is a previz studio that turns a one-line story into prose, characters, storyboards and video. I’m Lumi, and I walk through all six stages with you.' : 'Tale은 한 줄 이야기를 산문 · 인물 · 콘티 · 영상으로 이어 주는 프리비즈 스튜디오예요. 저는 그 여섯 단계를 같이 걷는 Lumi고요.' },
  { k: ['요금', '가격', '얼마', '비용', 'take', '테이크', '크레딧', 'price', 'pricing', 'cost', 'much', 'plan'], a: EN ? `Starter begins at $15/month, and Producer for teams at $199/month. Images and storyboards are always free; Takes are only used for video. <a href="${PRICING}">See pricing →</a>` : `Starter는 월 ₩29,900부터, 팀용 Producer는 월 ₩299,000부터예요. 이미지와 콘티는 항상 무료고, 영상에만 Take를 써요. <a href="${PRICING}">요금 자세히 보기 →</a>` },
  { k: ['콘티', '스토리보드', '먼저', 'storyboard', 'board', 'first'], a: EN ? 'Every video generation costs Takes, but storyboards are free. Lock the framing and characters on the storyboard first, then only turn final cuts into video, and you’ll regenerate far less.' : '영상은 만들 때마다 Take가 들지만 콘티는 무료예요. 구도와 인물을 콘티로 먼저 맞추고, 확정한 컷만 영상으로 옮기면 다시 만드는 횟수가 확 줄어요.' },
  { k: ['시작', '어떻게', '처음', '사용', 'start', 'how', 'begin', 'use'], a: EN ? 'Just write one line of story. I’ll ask about genre and length, then take it from story to characters to storyboard. You only need to pick.' : '이야기 한 줄만 적어 주세요. 제가 장르와 길이를 여쭤보고, 산문 → 인물 → 콘티 순서로 이어 갈게요. 고르기만 하면 돼요.' },
  { k: ['학습', '보안', '저작권', '내 것', '데이터', 'train', 'privacy', 'security', 'data', 'copyright'], a: EN ? 'Your projects, prompts and outputs are never used to train AI. Every project runs in its own isolated workspace.' : '만드신 프로젝트 · 프롬프트 · 생성물은 어떤 AI 학습에도 쓰지 않아요. 프로젝트마다 분리된 공간에서 작업해요.' },
  { k: ['모델', 'seedance', 'kling', 'model', 'veo', 'minimax', 'nano banana'], a: EN ? 'Video runs on Seedance, Kling, Veo and MiniMax, and images on GPT Image, Nano Banana and more. You’ll always see the model and the Take cost before you generate.' : '영상은 Seedance · Kling · Veo · MiniMax, 이미지는 GPT Image · Nano Banana 등을 써요. 생성 전에 모델과 Take를 먼저 보여 드려요.' },
]
const CHIPS = ['Tale은 뭐예요?', '요금이 궁금해요', '콘티 먼저가 뭐예요?', '어떻게 시작해요?']

const fab = document.createElement('button')
fab.type = 'button'
fab.className = 'lumi-fab'
fab.setAttribute('aria-label', 'Lumi에게 물어보기')
fab.setAttribute('aria-expanded', 'false')
const HAS_PERSONA = !!customElements.get('lumi-persona') && !!document.createElement('canvas').getContext('webgl')
fab.innerHTML = HAS_PERSONA
  ? `<lumi-persona class="lumi-fab__persona" persona="pearl" state="idle"></lumi-persona>`
  : `<span class="lumi-fab__float"><img class="lumi-fab__img lumi-fab__img--white" src="${whiteSrc}" alt="" /><img class="lumi-fab__img lumi-fab__img--color" src="${colorSrc}" alt="" /></span>`
if (HAS_PERSONA) fab.classList.add('lumi-fab--persona')
const persona = fab.querySelector('lumi-persona')
const setLumi = (state, p) => { if (!persona) return; if (p) persona.setAttribute('persona', p); persona.setAttribute('state', state) }

const hint = document.createElement('div')
hint.className = 'lumi-hint'
hint.textContent = '궁금한 건 저한테 물어보세요!'

const chat = document.createElement('section')
chat.className = 'lumi-chat'
chat.setAttribute('aria-label', 'Lumi 챗봇')
chat.innerHTML = `
  <header class="lc-head"><img class="lc-head__lumi" src="${colorSrc}" alt="" /><b>Lumi와 이야기</b><button type="button" class="lc-close" aria-label="채팅 접기"><i style="--ico:url(&quot;${icCollapse.replace(/"/g, '%22')}&quot;)"></i></button></header>
  <div class="lc-log" aria-live="polite"></div>
  <div class="lc-chips">${CHIPS.map((c) => `<button type="button" class="lc-chip">${c}</button>`).join('')}</div>
  <form class="lc-form"><label class="sr" for="lc-input">Lumi에게 보낼 말</label><input id="lc-input" autocomplete="off" placeholder="무엇이든 물어보세요" /><button type="submit" aria-label="보내기"><i style="--ico:url(&quot;${icArrow.replace(/"/g, '%22')}&quot;)"></i></button></form>`
document.body.append(chat, hint, fab)

const root = document.documentElement
const log = chat.querySelector('.lc-log')
const input = chat.querySelector('#lc-input')
let greeted = false

const add = (html, who) => {
  const m = document.createElement('div')
  if (who === 'lumi') {
    // Figma Lumi Row: 28px 아바타 + 이름이 붙은 말풍선
    m.className = 'lc-row'
    m.innerHTML = `<img class="lc-av" src="${colorSrc}" alt="" /><div class="lc-msg lc-msg--lumi"><p class="lc-name">Lumi</p>${html}</div>`
  } else {
    m.className = `lc-msg lc-msg--${who}`
    m.innerHTML = html
  }
  log.append(m)
  log.scrollTop = log.scrollHeight
  return m
}
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])

async function reply(text) {
  const t = text.toLowerCase()
  const hit = ANSWERS.find((x) => x.k.some((k) => t.includes(k)))
  setLumi('thinking')
  const typing = add('<span class="lc-typing"><i></i><i></i><i></i></span>', 'lumi')
  await sleep(reduce ? 100 : 700 + Math.random() * 500)
  typing.remove()
  setLumi('complete')
  add(hit ? hit.a : EN ? `“${esc(text)}” sounds like a great story seed! Hit Get started and I’ll turn that line into a story right away.` : `"${esc(text)}" 좋은 이야기 씨앗이네요! 시작하기를 누르면 이 한 줄로 바로 산문을 써 볼게요.`, 'lumi')
}

async function open() {
  root.classList.add('lumi-open')
  setLumi('idle', 'complete') // 화이트 진주 → 완성 Lumi로 옷 갈아입기
  fab.setAttribute('aria-expanded', 'true')
  if (!greeted) {
    greeted = true
    await sleep(reduce ? 0 : 450)
    add('안녕하세요, 저는 Lumi예요. 하얀 진주였는데 이야기를 만나면 이렇게 색이 생겨요.', 'lumi')
    await sleep(reduce ? 0 : 500)
    add('Tale에 대해 궁금한 걸 물어보세요. 아래 버튼을 눌러도 돼요.', 'lumi')
  }
  setTimeout(() => input.focus({ preventScroll: true }), 300)
}
function close() {
  root.classList.remove('lumi-open')
  setLumi('idle', 'pearl')
  fab.setAttribute('aria-expanded', 'false')
  fab.focus({ preventScroll: true })
}
fab.addEventListener('click', () => (root.classList.contains('lumi-open') ? close() : open()))
chat.querySelector('.lc-close').addEventListener('click', close)
addEventListener('keydown', (e) => e.key === 'Escape' && root.classList.contains('lumi-open') && close())
chat.querySelectorAll('.lc-chip').forEach((c) => c.addEventListener('click', () => { add(esc(c.textContent), 'me'); reply(c.textContent) }))
input.addEventListener('focus', () => setLumi('listening'))
input.addEventListener('blur', () => persona?.getAttribute('state') === 'listening' && setLumi('idle'))
chat.querySelector('.lc-form').addEventListener('submit', (e) => {
  e.preventDefault()
  const v = input.value.trim()
  if (!v) return
  input.value = ''
  add(esc(v), 'me')
  reply(v)
})

// 처음 몇 초 뒤 말풍선으로 살짝 알려요
setTimeout(() => { if (!root.classList.contains('lumi-open')) { hint.classList.add('on'); setTimeout(() => hint.classList.remove('on'), 5000) } }, 2500)

// 히어로의 "시작하기" 버튼도 Lumi 창을 열어요
document.querySelectorAll('form.prompt, form.ask').forEach((f) =>
  f.addEventListener('submit', (e) => {
    e.preventDefault()
    const field = f.querySelector('textarea, input')
    const v = field?.value.trim()
    open().then(async () => {
      if (v) { field.value = ''; add(esc(v), 'me'); reply(v) }
    })
  }),
)

// 히어로의 'Lumi와 시작하기' 버튼도 챗봇을 열어요
document.querySelectorAll('[data-open-lumi]').forEach((b) => b.addEventListener('click', () => open()))
