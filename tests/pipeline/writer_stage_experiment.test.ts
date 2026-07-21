// writer 단계 실험 하네스 — 실 stage 함수를 gemini-3-flash로 직접 호출(#length-experiment 2026-07-21).
//
// 목적: 길이 양극화(숏폼 vs 장편) 입력이 writer 산출물을 어떻게 바꾸는지 실측.
//   실 runNarrativeStructure/runScenes를 그대로 부르므로 **시스템 프롬프트는 코드와 100% 동일**하다
//   (프롬프트가 함수 안에서 조립됨 — 재구현 없음). generateJson→gemini 실 호출.
//   프롬프트·결과·latency는 raw_collector(gemini.ts가 기록)에서 회수해 logs/writer-stage-exp/에 저장.
//
// ⚠️ 실 유료 호출. 게이트:
//   RUN_WRITER_STAGE=1 GEMINI_API_KEY=… \
//   WRITER_INPUT=shorts|ad|feature  WRITER_STAGES=narrativeStructure,scenes \
//   [WRITER_MODEL=gemini-3-flash-preview] [WRITER_PROVIDER=gemini] \
//   npx vitest run tests/pipeline/writer_stage_experiment.test.ts --disable-console-intercept
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

import { runNarrativeStructure } from '@/lib/writer/pipeline/stages/s1_structure'
import { runScenes } from '@/lib/writer/pipeline/stages/s3_scenes'
import { runDecoupage } from '@/lib/writer/pipeline/stages/decoupage'
import { runShotDesign } from '@/lib/writer/pipeline/stages/v4_shots'
import { runStoryCheck } from '@/lib/writer/pipeline/stages/c_validation_1'
import { getPendingRawCalls, resetRawSeq } from '@/lib/writer/llm/raw_collector'
import type { PipelineLogger } from '@/lib/writer/logger'
import type { Genre, Characters, BackgroundContract, PipelineInput, Scenes, DecoupagePlan, VisualIdentity, WorldVisual, CharacterVisual } from '@/lib/writer/types/pipeline'

const ENABLED = process.env.RUN_WRITER_STAGE === '1' && !!process.env.GEMINI_API_KEY
const MODEL = { provider: process.env.WRITER_PROVIDER ?? 'gemini', model: process.env.WRITER_MODEL ?? 'gemini-3-flash-preview' }
const INPUT_KEY = process.env.WRITER_INPUT ?? 'shorts'
const STAGES = (process.env.WRITER_STAGES ?? 'narrativeStructure,scenes').split(',').map((s) => s.trim()).filter(Boolean)
const OUT_DIR = path.join(process.cwd(), 'logs', 'writer-stage-exp')

const logger = {
  markStage: async () => {}, saveStage: async () => {}, saveLlmCall: async () => {},
  flushRawLlm: async () => {}, loadStage: async () => null,
} as unknown as PipelineLogger

// ── 캐릭터/월드 헬퍼 (Characters/BackgroundContract 최소 유효 형태) ──
const ch = (id: string, name: string, role: string, appearance: string) => ({ id, name, role, appearance_description: appearance })
const cast = (...characters: ReturnType<typeof ch>[]): Characters => ({ characters, relationships: [], subtext_notes: [] } as unknown as Characters)
const loc = (id: string, name: string, description: string) => ({ id, name, description })
const world = (setting: string, ...locations: ReturnType<typeof loc>[]): BackgroundContract => ({ locations, setting } as BackgroundContract)

type Preset = { label: string; input: PipelineInput; characters: Characters; world: BackgroundContract }

// ── 길이 양극화 프리셋 (실 DB 입력 포맷·톤 모방) ──
const PRESETS: Record<string, Preset> = {
  // 극단적 짧음 — 숏폼/훅. runtime 15s, D1(구조 없음, 한 비트), 세로.
  shorts: {
    label: '숏폼 훅 (15s · D1 · 9:16)',
    input: {
      story: '지하철에서 꾸벅꾸벅 조는 직장인. 이어폰에서 흘러나온 광고 한 줄에 눈이 번쩍 뜨인다. 화면 가득 파랗게 빛나는 에너지드링크 캔이 번쩍이고, 그는 자리를 박차고 일어나 닫히는 문틈으로 뛰어나간다.',
      genre: { genre: 'advertisement', subGenre: 'product_hook', tone: ['energetic', 'punchy'], targetEmotion: [], runtime_seconds: 15, depth_level: 'D1', format: 'vertical_9:16' } as Genre,
    },
    characters: cast(ch('char', '직장인', 'protagonist', '20대 후반, 정장에 넥타이가 살짝 풀린 피곤한 얼굴')),
    world: world('출근길 지하철', loc('location', '지하철 객실', '아침 러시아워, 사람들로 붐비는 지하철 객실. 창밖으로 터널 불빛이 스친다')),
  },
  // 짧은 광고 — 브랜드 필름. runtime 30s, D2(미니 구조), 세로.
  ad: {
    label: '브랜드 광고 (30s · D2 · 9:16)',
    input: {
      story: '새 러닝화를 신은 러너가 아직 어두운 새벽 도시를 가른다. 숨이 턱까지 차오르는 순간, 신발 밑창이 은은히 빛나며 그를 한 발 더 멀리 밀어준다. 골목을 빠져나오자 강변 끝에서 해가 떠오르고, 그는 결승선 대신 그 빛을 향해 달린다.',
      genre: { genre: 'advertisement', subGenre: 'brand_film', tone: ['inspiring', 'cinematic'], targetEmotion: [], runtime_seconds: 30, depth_level: 'D2', format: 'vertical_9:16' } as Genre,
    },
    characters: cast(ch('char', '러너', 'protagonist', '30대, 땀에 젖은 운동복 차림의 단단한 인상')),
    world: world('새벽 도시', loc('location', '새벽 도심 골목', '가로등만 켜진 어둑한 새벽 도시 골목, 물기 젖은 아스팔트'), loc('location_2', '강변 산책로', '해 뜨기 직전의 강변, 지평선이 붉게 물들기 시작한다')),
  },
  // 극단적 긺 — 장편영화. runtime 6000s(100분), D7(다층+서브플롯 다수), 시네마.
  feature: {
    label: '장편 서사극 (6000s=100분 · D7 · 2.39:1)',
    input: {
      story: '몰락한 항구 도시. 삼대에 걸친 어부 가문이 바다와 자본, 그리고 서로를 상대로 싸운다. 노쇠한 선장 할아버지는 사라진 큰아들의 배를 아직도 기다리고, 둘째 아들은 도시를 삼키려는 개발업자와 손잡는다. 손녀는 가문의 비밀 장부에서 삼십 년 전 형제를 갈라놓은 살인의 흔적을 발견한다. 폭풍이 오는 밤, 셋은 낡은 등대에서 마주치고, 각자가 숨겨온 진실이 파도처럼 밀려든다. 개발업자의 부하들이 부두를 봉쇄하고, 도시의 마지막 목선이 불타오른다.',
      genre: { genre: 'drama', subGenre: 'epic_family_saga', tone: ['melancholic', 'tense', 'elegiac'], targetEmotion: [], runtime_seconds: 6000, depth_level: 'D7', format: 'cinema_2.39:1' } as Genre,
    },
    characters: cast(
      ch('grandfather', '선장 할아버지', 'protagonist', '70대, 소금기에 갈라진 얼굴과 형형한 눈빛의 노선장'),
      ch('second_son', '둘째 아들', 'antagonist', '50대, 값비싼 코트를 걸쳤지만 손은 여전히 어부의 손'),
      ch('granddaughter', '손녀', 'protagonist', '20대, 도시를 떠났다 돌아온 냉철한 인상의 여성'),
      ch('developer', '개발업자', 'antagonist', '60대, 늘 웃지만 눈은 웃지 않는 정장의 남자'),
      ch('lost_son', '사라진 큰아들', 'supporting', '실종 당시 30대, 사진 속에만 남은 형형한 눈빛'),
      ch('harbor_master', '항만 관리인', 'supporting', '40대, 가문과 개발업자 사이에서 저울질하는 중년'),
    ),
    world: world('몰락한 항구 도시',
      loc('harbor', '낡은 부두', '녹슨 크레인과 부서진 목선이 늘어선 몰락한 항구, 안개가 자주 낀다'),
      loc('lighthouse', '오래된 등대', '도시가 내려다보이는 절벽 위 낡은 등대, 삼대의 비밀이 얽힌 장소'),
      loc('mansion', '가문의 저택', '한때 화려했으나 이제 빛바랜 어부 가문의 저택'),
      loc('developer_office', '개발업자 사무실', '항구가 내려다보이는 고층 유리 사무실'),
      loc('old_market', '수산 시장', '새벽마다 경매가 열리던, 이제는 반쯤 비어버린 어시장'),
    ),
  },
  // 구조유형 프로브 — 명백히 기승전결(갈등 없음, 대비/전환) 콘텐츠. depth는 평범한 D3.
  kishoten: {
    label: '기승전결 프로브 (D3 · 갈등 없음)',
    input: {
      story: '할머니가 매일 아침 골목의 낡은 화분들에 물을 준다. 어느 날, 화분 하나에 처음 보는 작은 새가 앉아 있다. 할머니는 물뿌리개를 조용히 내려놓고 가만히 새를 바라본다. 한참 뒤 새가 포르르 날아가고, 할머니는 다시 천천히 물을 준다. 그날따라 골목이 조금 더 환해 보인다. 갈등도, 악당도, 해결할 문제도 없다.',
      genre: { genre: 'drama', subGenre: 'slice_of_life', tone: ['calm', 'gentle'], targetEmotion: [], runtime_seconds: 90, depth_level: 'D3', format: 'horizontal_16:9' } as Genre,
    },
    characters: cast(ch('char', '할머니', 'protagonist', '70대, 낡은 카디건에 물뿌리개를 든 온화한 인상')),
    world: world('오래된 골목', loc('location', '오래된 주택가 골목', '화분이 늘어선 좁고 낡은 골목, 아침 햇살이 비스듬히 든다')),
  },
  // 구조유형 프로브 — 명백히 순환(타임루프). depth는 평범한 D3.
  loop: {
    label: '순환구조 프로브 (D3 · 타임루프)',
    input: {
      story: '남자는 같은 월요일 아침을 끝없이 반복해서 산다. 알람, 식은 커피, 놓친 지하철 — 매 회차가 완전히 똑같다. 그러다 어느 회차, 창밖 간판의 글자 하나가 지난번과 미묘하게 달라진 걸 알아챈다. 다시 눈을 뜬 그는 이번엔 지하철 대신 그 간판을 향해 걷기 시작하고, 아침은 또다시 처음으로 되감긴다.',
      genre: { genre: 'sci-fi', subGenre: 'time_loop', tone: ['eerie', 'contemplative'], targetEmotion: [], runtime_seconds: 90, depth_level: 'D3', format: 'horizontal_16:9' } as Genre,
    },
    characters: cast(ch('char', '남자', 'protagonist', '30대, 늘 같은 회색 셔츠를 입은 무표정한 남자')),
    world: world('반복되는 월요일', loc('location', '원룸', '알람 시계와 식은 커피가 놓인 좁은 원룸'), loc('location_2', '지하철역 앞', '출근길 인파로 붐비는 지하철역 입구, 건너편에 큰 간판이 보인다')),
  },
  // E0a 프로브 — 저깊이 × 기승전결 콘텐츠. D2 사다리("setup→action→result")가 형태 선택을 꺾는지 본다.
  'kishoten-d2': {
    label: '기승전결 프로브 (30s · D2 · 갈등 없음)',
    input: {
      story: '카페 창가에 앉은 여자가 김이 오르는 찻잔을 가만히 바라본다. 창밖에는 비가 내리고 행인들이 우산 속에서 종종걸음친다. 문득 비가 그치고, 젖은 거리 위로 햇살이 쏟아지며 유리창에 맺힌 물방울이 일제히 반짝인다. 여자는 첫 모금을 마시고, 거리의 소음이 천천히 잦아든다. 갈등도 해결할 문제도 없다 — 비에서 햇살로의 전환과 여운뿐.',
      genre: { genre: 'advertisement', subGenre: 'brand_film', tone: ['calm', 'warm'], targetEmotion: [], runtime_seconds: 30, depth_level: 'D2', format: 'vertical_9:16' } as Genre,
    },
    characters: cast(ch('char', '여자', 'protagonist', '30대, 니트 차림으로 창가에 앉은 차분한 인상')),
    world: world('비 오는 오후의 카페', loc('location', '카페 창가', '통유리 창가 자리, 김 오르는 찻잔과 빗방울 맺힌 유리')),
  },
  // E1 프로브 — 원장 밀도 프리셋: slug≠표시명 캐스트/로케이션, 고정 소품(노란 우산), 고정 결말(마지막 컷),
  //   역전 설정(비 오는 날만 영업 = 유저 차별점). 스토리는 기존 캐스트 2인으로 완결 — new_characters > 0 = 남발.
  ledger: {
    label: '원장 프로브 (45s · D2 · 9:16 — 고정 소품·결말·차별점)',
    input: {
      story: '비 오는 날에만 문을 여는 골목 꽃집. 연희 할머니는 빗소리가 들리면 셔터를 올리고 창가에 가장 밝은 꽃들을 내놓는다. 손자 민호가 노란 우산을 쓰고 달려와 가게 앞 화분들을 처마 밑으로 옮긴다. 비가 그치자 할머니는 천천히 셔터를 내리고, 민호는 노란 우산을 가게 문고리에 걸어둔다. 마지막 컷은 문고리에 걸린 노란 우산 클로즈업.',
      genre: { genre: 'advertisement', subGenre: 'brand_film', tone: ['calm', 'warm'], targetEmotion: [], runtime_seconds: 45, depth_level: 'D2', format: 'vertical_9:16' } as Genre,
    },
    characters: cast(
      ch('grandma_yeonhee', '연희 할머니', 'protagonist', '70대, 젖은 앞치마에 전지가위를 꽂은 온화한 꽃집 주인'),
      ch('grandson_mino', '민호', 'supporting', '10대 후반, 노란 우산을 쓴 마른 체구의 손자'),
    ),
    world: world('비 오는 골목',
      loc('flower_shop', '연희꽃집', '골목 모퉁이의 작은 꽃집, 셔터와 창가 진열대'),
      loc('alley', '골목 어귀', '빗물이 고인 좁은 골목, 처마에서 빗방울이 떨어진다'),
    ),
  },
  // ── 브레드스 배터리 (E1x·E5x, 2026-07-21 제품 오너 지시 "최소 10개 이상의 플롯"): 장르 10종.
  //    설계 공통: ① 고정 소품·고정 결말·slug≠표시명 캐스트/로케이션 (E1 원장 지표) ② 해당 장르의
  //    대표 관습을 의도적으로 포함 (E5 재정의판이 관습을 감점하지 않는지 — 구판 감점 목록의
  //    점프스케어·오해 갈등·1초 전 해제·선택받은 자를 일부러 배치). 전부 정직 대역(D2~D4).
  'horror-mansion': {
    label: '호러 (60s · D3 · 16:9 — 점프스케어 관습)',
    input: {
      story: '폐가 탐험 유튜버 지우가 낡은 저택에 들어간다. 삐걱이는 계단, 먼지 낀 거울, 갑자기 닫히는 문. 거울에 비친 흰 소복의 여인이 순간적으로 나타나고, 지우는 카메라를 떨어뜨리고 도망친다. 마지막 컷은 바닥에 떨어진 카메라 화면 속에서 여인이 카메라를 향해 천천히 다가오는 장면.',
      genre: { genre: 'horror', subGenre: 'haunted_house', tone: ['eerie', 'tense'], targetEmotion: [], runtime_seconds: 60, depth_level: 'D3', format: 'horizontal_16:9' } as Genre,
    },
    characters: cast(
      ch('youtuber_jiwoo', '지우', 'protagonist', '20대, 헤드랜턴과 카메라를 든 폐가 탐험 유튜버'),
      ch('ghost_woman', '소복의 여인', 'antagonist', '긴 머리에 흰 소복, 얼굴이 반쯤 가려진 여인'),
    ),
    world: world('폐가가 된 저택',
      loc('mansion_hall', '저택 현관홀', '먼지 쌓인 샹들리에와 삐걱이는 계단이 있는 현관홀'),
      loc('mirror_room', '거울의 방', '금이 간 전신 거울들이 늘어선 어두운 방'),
    ),
  },
  'romance-letter': {
    label: '로맨스 (90s · D3 — 오해·빗속 재회 관습)',
    input: {
      story: '7년 만에 고향에 돌아온 수아가 옛 연인 도현의 카페를 찾는다. 오해로 헤어졌던 두 사람 — 수아는 부치지 못한 편지를 가방에 품고 있다. 어색한 대화, 스치는 손끝, 창밖으로 쏟아지는 비. 수아가 떠나려다 돌아서서 편지를 건네고, 도현이 편지를 읽는 동안 수아는 빗속에 서 있다. 마지막 컷은 도현이 우산 없이 뛰어나와 수아 앞에 서는 장면.',
      genre: { genre: 'romance', subGenre: 'reunion', tone: ['warm', 'bittersweet'], targetEmotion: [], runtime_seconds: 90, depth_level: 'D3', format: 'horizontal_16:9' } as Genre,
    },
    characters: cast(
      ch('sua', '수아', 'protagonist', '30대 초반, 트렌치코트에 낡은 가방을 멘 차분한 여성'),
      ch('dohyun', '도현', 'protagonist', '30대 초반, 앞치마 차림의 카페 주인'),
    ),
    world: world('고향 소도시',
      loc('cafe_dohyun', '도현의 카페', '통창으로 골목이 보이는 작은 카페, 원두 향'),
      loc('rainy_street', '비 오는 골목', '가로등 불빛이 빗물에 번지는 좁은 골목'),
    ),
  },
  'thriller-bomb': {
    label: '스릴러 (90s · D4 — 1초 전 해제 관습)',
    input: {
      story: '폭탄 해체반 형사 강준이 지하철역 물품보관소의 시한폭탄을 발견한다. 타이머는 60초. 관제실의 해커 유나가 무전으로 회로도를 읽어주고, 강준은 빨간 선과 파란 선 앞에서 망설인다. 타이머가 3, 2, 1 — 강준이 빨간 선을 자르고, 타이머가 0.1초를 남기고 멈춘다. 마지막 컷은 땀에 젖은 강준의 얼굴과 꺼진 타이머 클로즈업.',
      genre: { genre: 'thriller', subGenre: 'bomb_defusal', tone: ['tense', 'gritty'], targetEmotion: [], runtime_seconds: 90, depth_level: 'D4', format: 'horizontal_16:9' } as Genre,
    },
    characters: cast(
      ch('detective_kangjun', '강준', 'protagonist', '40대, 방탄조끼에 니퍼를 든 폭탄 해체반 형사'),
      ch('hacker_yuna', '유나', 'supporting', '20대, 헤드셋을 쓰고 모니터 세 대를 앞에 둔 해커'),
    ),
    world: world('심야의 지하철역',
      loc('subway_locker', '지하철 물품보관소', '형광등이 깜빡이는 무인 물품보관소 구역'),
      loc('control_room', '관제실', '모니터 벽으로 둘러싸인 어두운 관제실'),
    ),
  },
  'comedy-cake': {
    label: '코미디 (60s · D2 — 들킬 뻔·서프라이즈 관습)',
    input: {
      story: '막내 사원 봄이가 부장 몰래 탕비실에서 생일 케이크를 준비한다. 까치발, 숨죽인 초 꽂기, 그때 부장이 문을 벌컥 연다 — 봄이는 케이크를 등 뒤로 숨기고 어색하게 웃는다. 부장이 "내 생일 아닌데?"라고 하자 전 직원이 뒤에서 폭죽을 터뜨린다. 오늘은 봄이의 생일이었다. 마지막 컷은 크림 묻은 봄이 얼굴 클로즈업.',
      genre: { genre: 'comedy', subGenre: 'office', tone: ['playful', 'light'], targetEmotion: [], runtime_seconds: 60, depth_level: 'D2', format: 'vertical_9:16' } as Genre,
    },
    characters: cast(
      ch('intern_bomi', '봄이', 'protagonist', '20대 중반, 사원증을 목에 건 씩씩한 막내 사원'),
      ch('manager_park', '박 부장', 'supporting', '50대, 넥타이를 느슨하게 맨 무뚝뚝한 표정의 부장'),
    ),
    world: world('평범한 사무실',
      loc('pantry', '탕비실', '커피머신과 좁은 싱크대가 있는 탕비실'),
      loc('office_floor', '사무실', '파티션이 늘어선 형광등 사무실'),
    ),
  },
  'family-jjigae': {
    label: '가족 드라마 (120s · D4 — 무뚝뚝한 아버지·밥상 화해 관습)',
    input: {
      story: '취업에 실패하고 고향에 내려온 아들 태호. 말없는 아버지는 새벽에 일어나 김치찌개를 끓인다. 밥상에서 두 사람은 눈을 마주치지 못하고, 아버지는 반찬을 아들 쪽으로 말없이 밀어놓는다. 태호가 "아버지, 저…"라고 입을 떼자 아버지는 "밥 먹어라"라고만 한다. 마지막 컷은 김이 오르는 찌개 냄비 클로즈업 위로 태호의 "잘 먹겠습니다" 목소리.',
      genre: { genre: 'drama', subGenre: 'family', tone: ['warm', 'melancholic'], targetEmotion: [], runtime_seconds: 120, depth_level: 'D4', format: 'horizontal_16:9' } as Genre,
    },
    characters: cast(
      ch('son_taeho', '태호', 'protagonist', '20대 후반, 후줄근한 후드티의 지친 얼굴'),
      ch('father_mansu', '만수', 'protagonist', '60대, 굽은 등에 앞치마를 두른 과묵한 아버지'),
    ),
    world: world('시골 고향집',
      loc('countryside_kitchen', '시골집 부엌', '오래된 가스레인지와 찬장이 있는 좁은 부엌'),
      loc('family_table', '안방 밥상', '아침 햇살이 드는 안방의 낮은 밥상'),
    ),
  },
  'scifi-signal': {
    label: 'SF (90s · D3 — 심야 관측소·클리프행어 관습)',
    input: {
      story: '전파망원경 기지의 연구원 하린이 심야 근무 중 규칙적인 신호를 포착한다. 커피잔 수면이 미세하게 떨리고, 모니터의 파형이 심장박동처럼 뛴다. 하린이 신호를 재생하자 그것은 30년 전 실종된 탐사선의 호출 부호였다. 마지막 컷은 하린이 송신 버튼 위에 손가락을 올린 채 멈춰 있는 장면.',
      genre: { genre: 'sci-fi', subGenre: 'first_contact', tone: ['contemplative', 'awe'], targetEmotion: [], runtime_seconds: 90, depth_level: 'D3', format: 'horizontal_16:9' } as Genre,
    },
    characters: cast(
      ch('researcher_harin', '하린', 'protagonist', '30대, 패딩을 걸치고 머그컵을 든 심야 근무 연구원'),
      ch('captain_voice', '탐사선 선장(음성)', 'supporting', '기록 속 음성으로만 남은 실종 탐사선 선장'),
    ),
    world: world('산 위의 전파망원경 기지',
      loc('observatory', '관제동', '모니터 불빛만 켜진 심야의 관제실, 창밖에 거대한 접시 안테나'),
      loc('antenna_field', '안테나 필드', '별이 쏟아지는 하늘 아래 늘어선 전파망원경들'),
    ),
  },
  'fantasy-chosen': {
    label: '판타지 (120s · D4 — 선택받은 자·검 뽑기 관습)',
    input: {
      story: '평범한 대장간 소년 온유가 마을 축제에서 아무도 뽑지 못한 검을 뽑는다 — 예언이 말한 선택받은 자. 장로가 무릎을 꿇고, 마을 사람들이 술렁인다. 온유는 두려움을 삼키고 검을 든 채 북쪽 탑의 용을 향해 떠난다. 마지막 컷은 언덕 위 온유의 실루엣과 저 멀리 탑을 휘감은 용의 그림자.',
      genre: { genre: 'fantasy', subGenre: 'quest', tone: ['epic', 'wondrous'], targetEmotion: [], runtime_seconds: 120, depth_level: 'D4', format: 'cinema_2.39:1' } as Genre,
    },
    characters: cast(
      ch('boy_onyu', '온유', 'protagonist', '10대 후반, 그을음 묻은 대장간 앞치마의 소년'),
      ch('elder_cheon', '천 장로', 'supporting', '백발에 지팡이를 든 마을 장로'),
    ),
    world: world('변방의 산골 마을',
      loc('village_square', '마을 광장', '축제 등불이 걸린 돌바닥 광장, 중앙에 바위에 꽂힌 검'),
      loc('north_hill', '북쪽 언덕', '마을 끝, 멀리 용의 탑이 보이는 바람 부는 언덕'),
    ),
  },
  'sports-lastlap': {
    label: '스포츠 (60s · D3 — 역전·슬로모 결승선 관습)',
    input: {
      story: '쇼트트랙 국가대표 서진이 결승에서 넘어진다. 관중석의 코치 미란이 주먹을 쥐고, 서진은 일어나 마지막 두 바퀴를 추격한다. 결승선 직전 아웃코스로 몸을 던지는 슬로모션 — 사진 판독 끝에 전광판에 서진의 이름이 1위로 뜬다. 마지막 컷은 빙판에 주저앉아 우는 서진 클로즈업.',
      genre: { genre: 'sports', subGenre: 'comeback', tone: ['intense', 'uplifting'], targetEmotion: [], runtime_seconds: 60, depth_level: 'D3', format: 'horizontal_16:9' } as Genre,
    },
    characters: cast(
      ch('skater_seojin', '서진', 'protagonist', '20대, 태극마크 스켈레톤 수트의 쇼트트랙 선수'),
      ch('coach_miran', '미란', 'supporting', '40대, 롱패딩에 스톱워치를 쥔 코치'),
    ),
    world: world('올림픽 빙상장',
      loc('ice_rink', '빙상장 트랙', '조명이 쏟아지는 쇼트트랙 경기장 빙판'),
      loc('stands', '관중석', '태극기가 물결치는 만원 관중석'),
    ),
  },
  'mv-lastsnow': {
    label: '뮤직비디오 (75s · D2 — 첫눈·회상 몽타주 관습)',
    input: {
      story: '첫눈 오는 밤, 하나는 옛 연인과 걷던 골목을 혼자 걷는다. 함께 서 있던 붕어빵 노점, 하얀 입김, 목에 두른 하늘색 목도리 — 회상과 현재가 교차하는 몽타주. 노점 앞에서 하나는 붕어빵 두 개를 사서 하나를 벤치에 놓아둔다. 마지막 컷은 벤치 위 붕어빵에 눈이 쌓이는 타임랩스.',
      genre: { genre: 'music_video', subGenre: 'breakup', tone: ['melancholic', 'dreamy'], targetEmotion: [], runtime_seconds: 75, depth_level: 'D2', format: 'vertical_9:16' } as Genre,
    },
    characters: cast(
      ch('hana', '하나', 'protagonist', '20대, 하늘색 목도리에 코트 차림, 입김을 부는 여성'),
      ch('ex_lover', '옛 연인(회상)', 'supporting', '회상 속에만 등장하는 흐릿한 실루엣의 남성'),
    ),
    world: world('첫눈 내리는 골목',
      loc('snow_alley', '눈 오는 골목', '가로등 아래 눈발이 흩날리는 주택가 골목'),
      loc('bungeoppang_stall', '붕어빵 노점', '김이 오르는 붕어빵 틀과 낡은 벤치가 있는 노점'),
    ),
  },
  'ramen-ad': {
    label: '푸드 광고 (30s · D2 — 김 클로즈업·패키지 엔딩 관습)',
    input: {
      story: '야근을 마친 민재가 편의점에서 컵라면 불꽃라면을 고른다. 뜨거운 물, 3분의 기다림, 김이 서린 안경 — 첫 젓가락을 후루룩 넘기는 순간 창밖 네온이 불꽃놀이처럼 번진다. 마지막 컷은 빨간 불꽃라면 용기 클로즈업과 피어오르는 김 한 줄기.',
      genre: { genre: 'advertisement', subGenre: 'food', tone: ['cozy', 'appetizing'], targetEmotion: [], runtime_seconds: 30, depth_level: 'D2', format: 'vertical_9:16' } as Genre,
    },
    characters: cast(ch('worker_minjae', '민재', 'protagonist', '20대 후반, 사원증을 건 채 안경에 김이 서린 야근 직장인')),
    world: world('심야 편의점',
      loc('convenience_store', '24시 편의점', '형광등이 환한 심야 편의점 라면 매대'),
      loc('window_counter', '창가 카운터', '네온 간판이 비치는 창가의 취식 카운터'),
    ),
  },
  // E0a 프로브 — 최저깊이 × 순환 콘텐츠. D1 "구조 없음"이 circular 선택을 꺾는지 본다.
  'loop-d1': {
    label: '순환 프로브 (15s · D1 · 퍼펙트 루프)',
    input: {
      story: '물방울 하나가 수면에 떨어져 파문이 퍼진다. 파문의 동심원이 유리창의 빗방울 무늬로 번지고, 빗방울이 유리를 타고 흘러내리다 창틀 끝에 맺혀 다시 처음의 물방울로 떨어진다. 끝 프레임이 첫 프레임과 정확히 이어지는 무한 루프 영상.',
      genre: { genre: 'art_film', subGenre: 'perfect_loop', tone: ['hypnotic', 'calm'], targetEmotion: [], runtime_seconds: 15, depth_level: 'D1', format: 'vertical_9:16' } as Genre,
    },
    characters: cast(),
    world: world('비 오는 창가', loc('location', '창가의 수면', '빗방울이 떨어지는 어항 수면과 그 너머의 유리창')),
  },
}

// ── V축 스텁 (R1 회귀 실험용, #prompt-audit 2026-07-21): v0/v2 산출을 중립 상수로 대체.
//    decoupage/shotDesign 프롬프트 회귀의 관심사는 샷 분해·spec 규율이지 스타일 정합이 아니라
//    중립 스타일이면 충분하다. 스타일 의존 실험엔 부적합 — 그땐 실제 v0/v2 체인을 이어야 함.
const stubVisualIdentity = (g: Genre): VisualIdentity => ({
  format: {
    medium: 'live_action_stylized',
    resolution: g.format === 'vertical_9:16' ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 },
    fps: 24,
    aspect_ratio: g.format.split('_').pop() ?? '16:9',
    rendering_method: 'photorealistic',
  },
  style: { art_style: 'cinematic_realism', shape_language: 'mixed', line_quality: 'clean', character_proportion: '7.5:1', texture_philosophy: 'photorealistic' },
})
const stubWorldVisual = (w: BackgroundContract): WorldVisual => ({
  global_palette: { primary: 'slate_blue', secondary: 'warm_gray', accent: 'amber', forbidden: [] },
  color_meaning: {},
  locations: w.locations.map((l) => ({ id: l.id, style_description: l.description ?? '', lighting_sources: [], props: [] })),
  vfx_approach: 'minimal_practical',
})
const stubCharacterVisual = (c: Characters): CharacterVisual => ({
  characters: c.characters.map((x) => ({ character_id: x.id, appearance: x.appearance_description ?? '', costume: [], palette: [] })),
})

// ── E5 주입 로더: 기존 산출물 로그({result} 래핑) 또는 bare JSON(변이 파일) 둘 다 허용 ──
const loadInjected = (envKey: string): unknown => {
  const f = process.env[envKey]
  if (!f) return null
  const j = JSON.parse(fs.readFileSync(f, 'utf8')) as { result?: unknown }
  return j.result ?? j
}

// ── stage 레지스트리 (실 함수 호출 — 시스템 프롬프트는 코드 그대로) ──
type State = { genre: Genre; narrativeStructure?: unknown; scenes?: unknown; decoupage?: unknown; shotDesign?: unknown }
const STAGE_FNS: Record<string, (st: State, p: Preset) => Promise<unknown>> = {
  narrativeStructure: (st, p) => runNarrativeStructure(p.input, st.genre, logger, MODEL as never),
  scenes: (st, p) => runScenes(p.input, st.genre, st.narrativeStructure as never, p.characters, p.world, logger, MODEL as never),
  // C축 확장 (E5): storyCheck — 파일 주입(WRITER_NS_FILE/WRITER_SCENES_FILE) 우선, 없으면 체인 state.
  //   C축 실행은 WRITER_PROVIDER=claude WRITER_MODEL=claude-sonnet-4-6 + CLAUDE_API_KEY 필요(llm/claude.ts 실배선).
  storyCheck: (st, p) =>
    runStoryCheck(
      st.genre,
      (loadInjected('WRITER_NS_FILE') ?? st.narrativeStructure) as never,
      p.characters,
      (loadInjected('WRITER_SCENES_FILE') ?? st.scenes) as Scenes,
      logger,
      MODEL as never,
    ),
  // V축 확장 (스텁 비주얼 — 위 주석 참조). sceneCinematography plans=null → 프롬프트의 Compact 분기 사용.
  decoupage: (st, p) => runDecoupage(st.genre, p.characters, st.scenes as Scenes, stubWorldVisual(p.world), null, logger, MODEL as never),
  shotDesign: async (st, p) => {
    const r = await runShotDesign(st.genre, p.characters, st.scenes as Scenes, stubVisualIdentity(st.genre), stubWorldVisual(p.world), stubCharacterVisual(p.characters), null, st.decoupage as DecoupagePlan, '', logger, MODEL as never)
    return r.shots
  },
}

describe('writer 단계 실험 (길이 양극화)', () => {
  it.skipIf(!ENABLED)(
    `[${INPUT_KEY}] ${STAGES.join(' → ')} 를 ${MODEL.model} 로 실행`,
    async () => {
      const preset = PRESETS[INPUT_KEY]
      expect(preset, `unknown WRITER_INPUT=${INPUT_KEY} (shorts|ad|feature)`).toBeTruthy()
      fs.mkdirSync(OUT_DIR, { recursive: true })

      const state: State = { genre: preset.input.genre! }
      console.log(`\n━━━ writer 실험 · ${preset.label} · model=${MODEL.model} ━━━`)
      console.log(`runtime=${state.genre.runtime_seconds}s depth=${state.genre.depth_level} format=${state.genre.format}\n`)

      for (const stage of STAGES) {
        const fn = STAGE_FNS[stage]
        if (!fn) { console.log(`[skip] ${stage} — 미지원(레지스트리에 없음)`); continue }
        resetRawSeq()
        const t0 = Date.now()
        let result: unknown
        let err: string | undefined
        try {
          result = await fn(state, preset)
          ;(state as Record<string, unknown>)[stage] = result
        } catch (e) {
          err = e instanceof Error ? e.message : String(e)
        }
        const ms = Date.now() - t0
        const calls = getPendingRawCalls()
        const outPath = path.join(OUT_DIR, `${INPUT_KEY}__${stage}.json`)
        fs.writeFileSync(outPath, JSON.stringify({
          input: INPUT_KEY, label: preset.label, stage, model: MODEL.model,
          duration_ms: ms, error: err ?? null,
          llm_calls: calls.map((c) => ({ systemInstruction: c.systemInstruction, prompt: c.prompt, response: c.response, duration_ms: c.duration_ms })),
          result,
        }, null, 2), 'utf8')

        // 요약 지표
        let summary = ''
        if (stage === 'narrativeStructure' && result) {
          const r = result as { structure_type?: string; acts?: { proportion: number }[] }
          summary = `structure=${r.structure_type} acts=${r.acts?.length} props=[${r.acts?.map((a) => a.proportion).join('/')}]`
        } else if (stage === 'scenes' && result) {
          const r = result as { scenes?: unknown[]; total_estimated_seconds?: number }
          summary = `scenes=${r.scenes?.length} total=${r.total_estimated_seconds}s`
        } else if (stage === 'decoupage' && result) {
          const r = result as DecoupagePlan
          const durs = r.scenes.flatMap((s) => s.shots.map((x) => x.intended_duration_seconds)).sort((a, b) => a - b)
          summary = `shots=${r.total_shots} added=${r.total_added} dur[min/med/max]=${durs[0]}/${durs[Math.floor(durs.length / 2)]}/${durs[durs.length - 1]}`
        } else if (stage === 'shotDesign' && result) {
          const shots = result as { intent: { duration_seconds: number } }[]
          const durs = shots.map((s) => s.intent.duration_seconds).sort((a, b) => a - b)
          summary = `shots=${shots.length} dur[min/med/max]=${durs[0]}/${durs[Math.floor(durs.length / 2)]}/${durs[durs.length - 1]}`
        } else if (stage === 'storyCheck' && result) {
          const r = result as { passed: boolean; issues: { severity: string }[]; cliche_count: number }
          const sev = (s: string) => r.issues.filter((i) => i.severity === s).length
          summary = `passed=${r.passed} issues=${r.issues.length} [C${sev('CRITICAL')}/W${sev('WARNING')}/I${sev('INFO')}] cliche_count=${r.cliche_count}`
        }
        console.log(`[${stage}] ${(ms / 1000).toFixed(1)}s  ${err ? 'ERR=' + err.slice(0, 80) : summary}  → ${path.relative(process.cwd(), outPath)}`)
      }
      console.log('')
    },
    1_800_000, // 장편(D7) × decoupage 체인은 씬 30+개 순차 호출 — 10분 초과 가능
  )
})
