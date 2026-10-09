// 새 프로젝트는 자료를 먼저 받고, 자료마다 고른 쓰임새로 Producer 가 할 일과 길이 · 화면 질문을 정한다 (2026-10-09 오너)
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ORIGINAL_FORMAT,
  IMAGE_GROUP_USES,
  IMAGE_USES,
  TEXT_USES,
  analysisNotice,
  chooseGroupUse,
  chooseImageUse,
  creationLengthStep,
  defaultTextUse,
  materialNextStep,
  materialProblems,
  needsAnalysisNotice,
  needsComicStyle,
  planCreation,
  type MaterialImage,
  type MaterialText,
} from '@/lib/project/creation-materials'
import { originalSettings } from '@/lib/project/purpose'

// 이 시험을 위해 새로 지은 대본 — 실제 작품의 글이 아니다.
const SCRIPT = ['S#1. 운동장 - 낮', '지아: 이번엔 내가 끝까지 간다!', '진수: 아니거든.', '', 'S#2. 교실 - 낮', '수지: 같이 밟으면 되잖아.', '지아: 그래, 같이.'].join('\n')
const SCRIPT_2 = ['S#3. 골목 - 밤', '지아: 내일 또 하자.', '진수: 좋아.'].join('\n')
const text = (id: string, body: string, use: MaterialText['use']): MaterialText => ({ id, name: `${id}.txt`, text: body, use })
const image = (id: string, use: MaterialImage['use'] = null): MaterialImage => ({ id, name: `${id}.png`, thumbUrl: `https://img.test/${id}.png`, sliceUrls: [`https://img.test/${id}-1.jpg`], use })
const bare = (img: MaterialImage) => ({ id: img.id, name: img.name, thumbUrl: img.thumbUrl, sliceUrls: img.sliceUrls })

describe('자료 쓰임새 고르기', () => {
  it('자료를 올렸으면 다음 화면에서 쓰임새를 고르고, 아이디어만 있으면 바로 길이 · 화면으로 간다', () => {
    // 정상 경로 고정 — 자료를 먼저 받고 무엇인지 고른 뒤에 길이를 묻는다(10/9 오너 "업로드를 먼저 받는 게 좋겠다").
    expect(materialNextStep(2)).toBe('uses')
    expect(materialNextStep(0)).toBe('length')
  })

  it('글은 대본 · 대본 다듬어서 · 아이디어 · 메모 중에서, 그림은 만화 원고 · 인물 · 배경 · 그림체 · 참고 자료만 중에서 고른다', () => {
    // 정상 경로 고정 — 오너가 꼽은 입력(완성 대본 · 날대본 · 아이디어 메모 / 캐릭터 · 배경 · 컨셉아트 · 웹툰)을 쓰임새로 옮긴 것.
    expect(TEXT_USES).toEqual(['script_keep', 'script_polish', 'memo'])
    expect(IMAGE_USES).toEqual(['comic', 'character', 'background', 'style', 'reference'])
  })

  it('올린 글은 대본 꼴이면 "대본 그대로"가, 아니면 "아이디어 · 메모"가 미리 골라져 있다', () => {
    // 왜: 글은 꼴로 거의 맞힐 수 있다 — 틀리면 한 번 눌러 바꾼다. 모델을 부르지 않는다.
    expect(defaultTextUse(SCRIPT)).toBe('script_keep')
    expect(defaultTextUse('비 오는 밤 편의점에서 두 사람이 다시 만나는 이야기')).toBe('memo')
  })

  it('그림은 미리 골라 두지 않고, 모든 그림의 쓰임새를 고르기 전에는 다음으로 넘어가지 않는다', () => {
    // 왜: 그림 종류를 짐작하려면 그림마다 모델을 불러야 해 비용이 크다(10/9 오너 "그림은 고르게 해줘").
    const images = [image('p1'), image('p2', 'character')]
    expect(materialProblems([], images)).toContain('image_unchosen')
    expect(materialProblems([], chooseImageUse(images, 'p1', 'background'))).toEqual([])
  })

  it('그림이 두 장 이상이면 묶어서 한 번에 고를 수 있고, 묶음 선택지에는 그림체가 없다', () => {
    // 왜: 만화 8쪽을 8번 고르지 않게. 그림체는 한 장만 쓰므로 묶음으로 고를 수 없다.
    expect(IMAGE_GROUP_USES).toEqual(['comic', 'character', 'background', 'reference'])
    const chosen = chooseGroupUse([image('p1'), image('p2'), image('p3')], 'comic')
    expect(chosen.map((img) => img.use)).toEqual(['comic', 'comic', 'comic'])
  })

  it('그림체는 한 장만 고를 수 있어, 다른 그림을 그림체로 고르면 앞의 그림은 참고 자료만으로 바뀐다', () => {
    // 왜: 그림체 그림(앵커)은 프로젝트에 한 장이다. 조용히 무시하지 않고 바뀐 것이 화면에 보이게 한다.
    const images = chooseImageUse(chooseImageUse([image('p1'), image('p2')], 'p1', 'style'), 'p2', 'style')
    expect(images.map((img) => img.use)).toEqual(['reference', 'style'])
  })

  it('대본 그대로와 만화 원고를 함께 고르면 그대로 쓸 원작을 하나만 고르라고 알린다', () => {
    // 왜: 대본과 만화를 한 이야기로 섞는 규칙이 없다 — 어느 쪽이 원작인지 사용자가 정한다.
    expect(materialProblems([text('t1', SCRIPT, 'script_keep')], [image('p1', 'comic')])).toContain('two_originals')
    // 2026-10-09 오너 결정(만화 그림체를 묻는다) 뒤로는 만화 원고에 그림체 답이 있어야 문제가 없다.
    expect(materialProblems([text('t1', SCRIPT, 'memo')], [image('p1', 'comic')], 'lock')).toEqual([])
  })

  it('만화 원고는 한 번에 20쪽까지 고를 수 있고, 넘으면 다음으로 넘어가지 않는다', () => {
    // 왜: 21쪽부터는 Producer 가 읽지 못하고 멈춘다 — 그대로 시작하면 대본도 그림체도 트리트먼트도 없이 끝났다(10/9 검토).
    const pages = (n: number) => Array.from({ length: n }, (_, i) => image(`c${i}`, 'comic'))
    // 2026-10-09 오너 결정(만화 그림체를 묻는다) 뒤로는 만화 원고에 그림체 답이 있어야 문제가 없다.
    expect(materialProblems([], pages(20), 'lock')).toEqual([])
    expect(materialProblems([], pages(21), 'lock')).toContain('too_many_comic_pages')
  })

  it('만화 원고를 고르면 만화 그림체를 고정할지 실사 등으로 각색할지 고르기 전에는 다음으로 넘어가지 않는다', () => {
    // 왜: 만화를 그대로 옮길지 다른 그림으로 각색할지는 사용자가 정한다(10/9 오너 "그림체로 고정할지 실사와 같은 각색을 할지 물어봐줘").
    const pages = [image('c1', 'comic'), image('c2', 'comic')]
    expect(needsComicStyle(pages)).toBe(true)
    expect(materialProblems([], pages)).toContain('comic_style_unchosen')
    expect(materialProblems([], pages, 'lock')).toEqual([])
    expect(planCreation({ idea: '', texts: [], images: pages, comicStyle: 'adapt' }).comicStyle).toBe('adapt')
  })

  it('그림체 그림을 따로 골랐으면 만화 그림체는 묻지 않는다', () => {
    // 왜: 그 그림이 그림체다 — 만화 그림체를 물을 필요가 없다.
    const images = [image('c1', 'comic'), image('look', 'style')]
    expect(needsComicStyle(images)).toBe(false)
    expect(materialProblems([], images)).toEqual([])
    expect(planCreation({ idea: '', texts: [], images, comicStyle: 'lock' }).comicStyle).toBeNull()
  })

  it('만화 원고나 그림체를 고르면 그림을 분석 모델로 보낸다는 안내가 나온다', () => {
    // 왜: 대본 옮기기와 그림체 분석은 그림을 분석 모델에 보내는 일이다 — 고르는 자리에서 알린다.
    expect(needsAnalysisNotice([image('p1', 'comic')])).toBe(true)
    expect(needsAnalysisNotice([image('p1', 'style')])).toBe(true)
    expect(needsAnalysisNotice([image('p1', 'character'), image('p2', 'reference')])).toBe(false)
    expect(analysisNotice('ko')).toMatch(/분석 모델/)
  })
})

describe('고른 쓰임새로 할 일 정하기', () => {
  it('대본 그대로 글이 여러 개면 올린 순서대로 이어 그대로 쓸 대본이 된다', () => {
    // 정상 경로 고정 — 회차를 나눠 올린 대본.
    const plan = planCreation({ idea: '', texts: [text('t1', SCRIPT, 'script_keep'), text('t2', SCRIPT_2, 'script_keep')], images: [] })
    expect(plan).toMatchObject({ original: 'script', preserveScript: true, story: `${SCRIPT}\n\n${SCRIPT_2}`, note: null })
  })

  it('그대로 쓰는 원작이 있으면 아이디어 칸 글과 메모는 대본에 합치지 않고 채팅에 남길 내 메모가 된다', () => {
    // 왜: 지금은 아이디어 칸 메모까지 한 글로 합쳐져 "그대로 쓸 대본"에 들어간다.
    const plan = planCreation({ idea: '결말은 꼭 지켜 줘', texts: [text('t1', SCRIPT, 'script_keep'), text('t2', '지아는 열 살이다', 'memo')], images: [] })
    expect(plan.story).toBe(SCRIPT)
    expect(plan.note).toBe('결말은 꼭 지켜 줘\n\n지아는 열 살이다')
    const comic = planCreation({ idea: '주인공은 소녀야', texts: [], images: [image('p1', 'comic')] })
    expect(comic).toMatchObject({ original: 'comic', story: '', preserveScript: false, note: '주인공은 소녀야' })
  })

  it('대본 다듬어서 · 아이디어 · 메모로 고른 글은 아이디어와 합쳐 트리트먼트의 바탕이 된다', () => {
    // 정상 경로 고정 — 원작이 없으면 종전처럼 아이디어와 글을 합친다(대본 꼴이어도 다듬어서를 고르면 보존하지 않는다).
    const plan = planCreation({ idea: '비 오는 편의점', texts: [text('t1', SCRIPT, 'script_polish')], images: [] })
    expect(plan).toMatchObject({ original: null, preserveScript: false, story: `비 오는 편의점\n\n${SCRIPT}`, note: null })
  })

  it('그림은 고른 쓰임새대로 만화 원고 · 그림체 · 인물과 배경 카드 · 참고 자료로 나뉜다', () => {
    // 정상 경로 고정 — Producer 는 이 나눔대로 묻지 않고 처리한다.
    const images = [image('c2', 'comic'), image('c1', 'comic'), image('s', 'style'), image('h', 'character'), image('b', 'background'), image('r', 'reference')]
    const plan = planCreation({ idea: '', texts: [], images })
    expect(plan.comicPages.map((p) => p.id)).toEqual(['c2', 'c1'])
    expect(plan.styleImage).toEqual(bare(images[2]))
    expect(plan.cards).toEqual([{ image: bare(images[3]), role: 'character' }, { image: bare(images[4]), role: 'background' }])
    expect(plan.references).toEqual([bare(images[5])])
  })

  it('그대로 쓰는 원작이 있으면 길이는 원작 길이대로라 묻지 않고 화면 비율만 고르며 16:9가 미리 골라져 있다', () => {
    // 왜: 원작을 그대로 쓰면 길이 값은 쓰이지 않는다 — 묻고 버리면 헷갈린다(10/9 오너 "영상 길이를 먼저 묻는 게 안 맞는다").
    expect(creationLengthStep(planCreation({ idea: '', texts: [text('t1', SCRIPT, 'script_keep')], images: [] }))).toBe('format')
    expect(creationLengthStep(planCreation({ idea: '', texts: [], images: [image('p1', 'comic')] }))).toBe('format')
    expect(DEFAULT_ORIGINAL_FORMAT).toBe('horizontal_16:9')
  })

  it('원작을 그대로 쓰면 장르는 비워 두고 채팅이 원작을 읽고 채운다', () => {
    // 왜: 만들 것 카드를 거치지 않으니 장르 초안이 없다. 아무 장르나 넣어 두면 채팅이 그 값을 그대로 둔다(10/9 시험: 코미디 만화가 판타지로 남음).
    expect(originalSettings('vertical_9:16', 'ko')).toEqual({ playtime: 0, genre: '', format: 'vertical_9:16', tone: [], dialogueLanguage: 'ko' })
  })
})
