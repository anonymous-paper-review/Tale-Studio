// writer 배선도 — 손으로 쓰는 부분(해석)만 여기 있다.
//
// 여기 없는 것: 프롬프트 원문, 상수 값, 실제 산출 예시, 소비처 유무.
//   그건 전부 extract.mjs 가 요청 시점에 코드·런 로그에서 다시 읽는다 — 낡을 수가 없게.
//   이 파일이 가진 것은 앵커(어디를 읽을지)와 해석(왜 이 모양이 됐나)뿐이다.
//
// checks: 손으로 쓴 문장이 참조하는 사실을 코드에서 다시 재 본다. 어긋나면 페이지에 배지가 뜬다.
// probe:  "소비처 0" 주장을 매 요청마다 grep 으로 재검증한다. 0이 아니게 되면 배지가 뜬다.

const P = 'src/lib/writer/pipeline'
const S = `${P}/stages`

export const BANDS = [
  { id: 'in', axis: 'x', label: '상류에서 넘어오는 것' },
  { id: 'vis', axis: 'v', label: 'Visual 축 — 전역 스타일에서 씬 촬영계획까지' },
  { id: 'dec', axis: 's', label: '샷 분해 — 감독의 데쿠파주' },
  { id: 'des', axis: 's', label: '샷 설계 — 3분할 스펙' },
  { id: 'chk', axis: 'c', label: '검수와 조립' },
  { id: 'land', axis: 'x', label: '착지와 하류' },
]

export const NODES = [
  // ── 상류 ────────────────────────────────────────────────────────────────
  {
    id: 'in-genre', band: 'in', row: 0, col: 0, axis: 'x', kind: 'input',
    label: '장르 계약', sub: 'Genre', file: 'producer 게이트가 확정',
    summary: '장르·톤·목표 감정·화면비·러닝타임·깊이(D1~D7). writer 는 더 이상 장르를 LLM 으로 만들지 않는다 — producer 게이트가 확정한 seed 를 받는다. seed 가 없으면 파이프라인이 명시적으로 실패한다.',
    outputs: [
      { field: 'genre / tone[] / targetEmotion[]', status: 'live', consumers: 'v0, v3, 데쿠파주, 샷 설계' },
      { field: 'format (화면비)', status: 'live', consumers: 'v0 화면비 강제' },
      { field: 'depth_level (D1~D7)', status: 'live', consumers: 'Compact 판정, 대표 스토리보드 정책' },
      { field: 'runtime_seconds', status: 'live', consumers: '씬 예산 계산' },
    ],
    why: [{
      what: 'writer 의 장르·캐스트 스테이지가 삭제됐다',
      why: 'producer 게이트가 장르와 캐스트를 확정하므로 writer 가 다시 만들면 두 벌이 된다. 지금은 seed 로만 들어오고, 없으면 파이프라인이 즉시 던진다.',
      src: `${P}/index.ts (runPipeline 진입 가드) · producer-story-gate §4`,
    }],
  },
  {
    id: 'in-cast', band: 'in', row: 0, col: 1, axis: 'x', kind: 'input',
    label: '캐스트 계약', sub: 'CastContract', file: 'src/lib/writer/cast-contract.ts',
    summary: '인물 id·이름·역할·외형 서술. writer 경계를 넘을 때 매퍼를 통과하는데, 이 매퍼가 성격을 빈 배열로 하드코딩한다.',
    outputs: [
      { field: 'characters[].id / name / role', status: 'live', consumers: 'v2, v3, 데쿠파주, 샷 설계' },
      { field: 'characters[].appearance_description', status: 'live', consumers: 'v2, 인물 DB 기록' },
      { field: 'characters[].personality', status: 'flag', consumers: 'v2·데쿠파주 지시문', note: '핸드오프 매퍼가 빈 배열로 하드코딩 — 데쿠파주가 보는 인물은 사실상 id 와 역할뿐이다. 씬 전개 중 새로 생긴 인물만 값이 있다' },
    ],
    checks: [{ label: '매퍼가 성격을 비우는가', expect: 'personality: []', file: 'src/lib/writer/cast-contract.ts', re: /(personality:\s*\[\s*\])/ }],
    why: [{
      what: '오픈 캐스트 — 전개상 추가된 인물을 append 한다',
      why: '씬 생성 중 새 인물이 나오면 병합 함수가 producer 베이스라인에 <b>덧붙인다</b>. 원천은 불변 — 덮어쓰지 않는다.',
      src: `${S}/s3_scenes.ts (mergeOpenCast) · architecture.md §5`,
    }],
  },
  {
    id: 'in-world', band: 'in', row: 0, col: 2, axis: 'x', kind: 'input',
    label: '배경 계약', sub: 'BackgroundContract', file: 'producer seed + 오픈 월드 머지',
    summary: '세팅 한 줄과 로케이션 목록(id·설명). 씬이 새 로케이션을 쓰면 append-only 로 머지되고, 드라마투르그가 만든 무대 후보의 표시명·설명이 여기서 보존된다.',
    outputs: [
      { field: 'setting', status: 'flag', consumers: 'v2 지시문', note: '선택 필드인데 프로덕션 경로에서 채우는 곳이 없다 — 시작 라우트는 로케이션만 싣고 병합 함수도 만들지 않아 항상 빈 문자열로 들어간다' },
      { field: 'locations[].id / description', status: 'live', consumers: 'v2 (로케이션 디자인의 권위 목록)' },
    ],
  },
  {
    id: 'in-anchor', band: 'in', row: 0, col: 3, axis: 'x', kind: 'input',
    label: '스타일 앵커', sub: 'input.styleAnchor', file: '선택 입력 (producer 에서 유저가 고름)',
    summary: '유저가 고른 그림체 견본. 있으면 매체 관련 필드는 발명 대상이 아니라 입력이 된다. 비활성 앵커이거나 조회에 실패하면 통째로 빠지고 장르 추론으로 되돌아간다.',
    outputs: [{ field: 'styleAnchor', status: 'live', consumers: 'v0 (앵커 제약 블록)' }],
    why: [{
      what: '앵커가 있으면 매체를 장르에서 추론하지 않는다',
      why: '앵커 없이 장르에서 매체를 추론하면(예: 종말물 → 어두운 시네마틱 실사) 유저가 고른 앵커와 정면 충돌해 매체 전이가 깨진다. 실측: 카툰 앵커를 골랐는데 거인만 실사로 나왔고, 원인은 지시문의 화풍 슬롯에 박힌 매체어가 앵커 이미지를 이긴 것이었다 — 그 구절만 빼면 2/2 로 카툰이 복원됐다. 질감·선질·팔레트 토큰은 무해했다.',
      src: `${S}/v0_visual.ts 헤더 주석 · commit b0f3428`,
    }],
  },
  {
    id: 's1', band: 'in', row: 0, col: 4, axis: 'x', kind: 'input',
    label: '서사 구조', sub: 's1 · NarrativeStructure', file: `${S}/s1_structure.ts`,
    summary: '막 구성과 전환점, 중심 극적 질문. Visual 축에서는 v1(막별 비주얼 아크)만 이걸 직접 읽는다 — 통째로 프롬프트에 붓고 코드가 따로 꺼내 쓰는 필드는 없다.',
    outputs: [
      { field: 'acts[].act_id / purpose / proportion', status: 'live', consumers: 'v1 막별 비주얼 아크' },
      { field: 'turning_point_position / theme / central_dramatic_question', status: 'live', consumers: 'v1 (시각 변화의 동기)' },
    ],
  },
  {
    id: 's3', band: 'in', row: 0, col: 5, axis: 'x', kind: 'input',
    label: '씬 목록', sub: 's3 · Scenes', file: `${S}/s3_scenes.ts`,
    summary: '씬마다 목적·로케이션·시간대·날씨·감정 곡선·예상 초·내러티브 비트·핵심 대사. 샷 층 전체의 원재료이고, 비트 배열이 데쿠파주의 입력이다.',
    outputs: [
      { field: 'scene_actions[]', status: 'live', consumers: '데쿠파주(인덱스로 참조), 액션 예산 분석' },
      { field: 'estimated_seconds', status: 'live', consumers: '데쿠파주 협상 규칙, 액션 예산' },
      { field: 'emotion_beat / purpose / location', status: 'live', consumers: 'v3, 데쿠파주, 결정론 조립' },
      { field: 'time_of_day / weather', status: 'flag', consumers: '데쿠파주 지시문', note: 'v3 촬영계획 지시문에는 실려 가지 않는다 — 조명 아크를 켈빈으로 정하면서 시간대·날씨를 못 본다' },
      { field: 'key_dialogue[]', status: 'partial', consumers: '데쿠파주 지시문', note: '샷 설계·검수에는 대사가 안 간다 — 대사 축은 별도 레인' },
    ],
  },

  // ── Visual 축 ───────────────────────────────────────────────────────────
  {
    id: 'v0', band: 'vis', row: 0, col: 0, axis: 'v', kind: 'llm', model: 'V',
    label: '비주얼 아이덴티티', sub: 'v0 · runVisualIdentity', fn: 'runVisualIdentity()',
    file: `${S}/v0_visual.ts`,
    calls: '런당 1콜 · temperature 0.4 (V축 중 가장 낮다 — 정체성은 흔들리면 안 된다)',
    summary: '작품 전역에 고정될 스타일을 한 번 정한다. 기술 스펙(매체·해상도·fps·화면비·렌더링 방식)과 미학(화풍·형태 언어·선질·인체 비례·질감 철학)을 분리해 낸다. 이후 모든 Visual 단계가 이 값을 상수처럼 물려받는다.',
    inputs: [
      { from: 'in-genre', fields: 'genre 전체 (JSON 통째)', usage: 'prompt', note: '코드가 따로 읽는 건 format 하나뿐 — 화면비를 모델 재량에서 빼앗는 데 쓴다' },
      { from: 'in-anchor', fields: 'styleAnchor 전체', usage: 'prompt', note: '있을 때만 앵커 제약 블록이 붙는다' },
    ],
    outputs: [
      { field: 'style.*', status: 'live', consumers: 'v1, v2, v3, 샷 설계 — 네 단계 모두 지시문에 실어 보낸다' },
      { field: 'format.aspect_ratio / resolution / fps', status: 'partial', consumers: 'v5 렌더 프롬프트', note: 'v1·v2·v3·v4 는 format 을 아예 안 본다 — style 만 본다' },
      { field: 'format.medium / rendering_method', status: 'flag', consumers: '', note: '앵커 정합의 근거로 만들어지지만 하류 지시문 어디에도 실리지 않는다' },
    ],
    contracts: [
      '화면비는 장르 계약의 복사 — 모델 재량을 경유하지 않는다',
      '해상도 방향이 화면비와 모순되면 가로·세로 축만 교환한다',
      '앵커가 있으면 화풍·매체·렌더링 방식·질감 철학은 앵커 고정',
    ],
    prompts: [
      { label: '시스템 지시 — 전문', anchor: { file: `${S}/v0_visual.ts`, from: '당신은 V축 V0(비주얼 아이덴티티)를 확정한다', keepFrom: true, to: '`;' } },
      { label: '앵커 제약 블록 — 앵커가 있을 때만 붙는다', anchor: { file: `${S}/v0_visual.ts`, from: '[스타일 앵커 —', keepFrom: true, to: "`\n    : ''" } },
    ],
    samples: [{ label: '실제 산출 (앵커 없는 런)', file: '08_v0_visualIdentity.json', pick: (j) => j }],
    why: [{
      what: '화면비를 코드가 다시 덮어쓴다',
      why: '화면비는 producer 가 확정한 값이라 모델 재량을 거칠 이유가 없다. 원장 고정 원칙에 따라 LLM 출력 위에 계약값을 복사하고, 해상도 방향이 어긋나면 축만 교환해 정합시킨다. 같은 커밋이 죽은 지시문(샷 설계의 옛 5~15초 잔재, 항상 비어 있던 seed 문구)도 함께 걷어냈다.',
      src: `${S}/v0_visual.ts (#prompt-audit W4) · commit 64dd700`,
    }],
  },
  {
    id: 'v1', band: 'vis', row: 0, col: 1, axis: 'v', kind: 'llm', model: 'V',
    label: '막별 비주얼 아크', sub: 'v1 · runActVisualArc', fn: 'runActVisualArc()',
    file: `${S}/v1_act_arc.ts`,
    calls: '런당 1콜 · temperature 0.5 (막 수만큼의 배열을 한 번에 받는다)',
    summary: '막을 지나며 비주얼이 어떻게 진화하는지를 정한다. 전역 스타일은 막마다 바뀌지 않는다는 전제 아래, 팔레트 방향·조명 무드·에너지만 막별로 움직인다.',
    inputs: [
      { from: 's1', fields: 'narrativeStructure 전체 (JSON 통째)', usage: 'prompt' },
      { from: 'v0', fields: 'visualIdentity 전체 (format+style)', usage: 'prompt' },
    ],
    outputs: [
      { field: 'acts[].palette_shift / lighting_mood / energy / visual_note', status: 'live', consumers: 'v2 (디자인 방향), v3 (조명 아크·팔레트 강조)' },
      { field: 'global_arc_intent', status: 'live', consumers: 'v2, v3 (아크 블록에 통째 직렬화)' },
    ],
    contracts: [
      '각 막은 서사 구조의 막 id 와 1:1, 배열 순서가 곧 시간 진행',
      '전역 스타일(화풍·형태·선질·질감)은 막마다 바뀌지 않는다',
      '10분 이하 영상 전제 — 막당 1~2문장',
    ],
    prompts: [{ label: '시스템 지시 — 전문', anchor: { file: `${S}/v1_act_arc.ts`, from: '당신은 Visual 축 v1(막별 비주얼 아크) 설계자이다.', keepFrom: true, to: '`;' } }],
    samples: [{ label: '실제 산출 (앞 2막)', file: '08b_v1_actVisualArc.json', pick: (j) => ({ acts: (j.acts ?? []).slice(0, 2), global_arc_intent: j.global_arc_intent }) }],
    why: [{
      what: 'v3 로 가는 배선이 실험으로 승격됐다',
      why: '막별 아크를 v3 에 전달할지가 오래 미결이었는데, 사전 등록 실험에서 막 경계의 시각 대비가 전달군 평균 3.00 대 비전달군 1.08 로 갈렸다. 팔 안 편차보다 큰 차이라 정식 배선으로 채택됐다.',
      src: `${S}/v3_scene_plan.ts 주석 (act-arc-ablation, 2026-08-10 채택)`,
    }],
  },
  {
    id: 'v2', band: 'vis', row: 0, col: 2, axis: 'v', kind: 'llm', model: 'V',
    label: '인물·월드 비주얼', sub: 'v2 · runV2Design', fn: 'runV2Design()',
    file: `${S}/v2_design.ts`,
    calls: '런당 1콜 · temperature 0.6',
    summary: '인물별 외형·의상·강조색과, 월드의 전역 팔레트·색 의미·로케이션별 디자인·VFX 방향을 한 번에 낸다. 샷 설계가 의상을 알고 데쿠파주가 로케이션 소품을 아는 것은 전부 여기서 나온다.',
    inputs: [
      { from: 'v0', fields: 'visualIdentity.style', usage: 'prompt', note: 'format 은 안 보낸다' },
      { from: 'v1', fields: 'actVisualArc 전체', usage: 'prompt', note: '없으면 전역 스타일만으로 자체 결정한다고 적혀 있지만, 두 오케스트레이터 모두 항상 넘긴다' },
      { from: 'in-cast', fields: 'character_id / name / role / appearance_description / personality', usage: 'prompt' },
      { from: 'in-world', fields: 'setting, locations[]', usage: 'partial', note: 'setting 은 항상 빈 문자열' },
    ],
    outputs: [
      { field: 'characterVisual.characters[].costume[]', status: 'live', consumers: '샷 설계 지시문, 인물 DB 기록' },
      { field: 'characterVisual.characters[].appearance', status: 'dropped', consumers: '', note: 'DB 인물 외형 칸은 v2 가 아니라 상류 캐스트의 외형 서술로 채워진다 — 이 값을 읽는 곳이 없다' },
      { field: 'characterVisual.characters[].palette', status: 'dropped', consumers: '', note: '인물 강조색을 만들지만 지시문에도 DB 에도 가지 않는다' },
      { field: 'worldVisual.global_palette', status: 'live', consumers: 'v3, 샷 설계, v5 폴백, 디자인 토큰' },
      { field: 'worldVisual.locations[]', status: 'live', consumers: '데쿠파주·샷 설계 (해당 씬 로케이션만 필터)' },
      { field: 'worldVisual.color_meaning', status: 'partial', consumers: 'v5 폴백 지시문, 디자인 토큰', note: 'v3·데쿠파주·샷 설계 셋 다 못 본다' },
      { field: 'worldVisual.vfx_approach', status: 'dropped', consumers: '', note: '어느 프롬프트에도 안 실리고 디자인 토큰으로 저장만 된다' },
    ],
    outputProbes: [
      { field: 'appearance (v2 산출)', match: 'characterVisual', produce: [`${S}/v2_design.ts`, `${P}/index.ts`, `${P}/steps.ts`, `${P}/util/persist_manifest.ts`, `${S}/v4_shots.ts`, 'src/lib/writer/types/pipeline.ts'] },
      { field: 'vfx_approach', match: 'vfx_approach', produce: [`${S}/v2_design.ts`, `${P}/util/persist_design_tokens.ts`, 'src/lib/writer/types/pipeline.ts'] },
    ],
    contracts: [
      '입력 인물 id·로케이션 id 를 <b>그대로</b> 쓴다 — 발명·변경 금지',
      '출력은 입력 id 목록을 권위로 삼아 결정론적으로 재정렬 — 모델이 빠뜨린 항목은 최소 필드로 보강',
      '금지색은 작품에서 절대 안 쓸 색',
    ],
    prompts: [{ label: '시스템 지시 — 전문', anchor: { file: `${S}/v2_design.ts`, from: '당신은 V축 V2(비주얼 디자인) 디자이너이다.', keepFrom: true, to: '`;' } }],
    samples: [{
      label: '실제 산출 (인물 1명 + 팔레트 + 로케이션 1곳)',
      file: '09_v2_design.json',
      pick: (j) => ({
        characterVisual_첫인물: j.characterVisual?.characters?.[0],
        worldVisual_팔레트: j.worldVisual?.global_palette,
        worldVisual_첫로케이션: j.worldVisual?.locations?.[0],
        vfx_approach: j.worldVisual?.vfx_approach,
      }),
    }],
    why: [{
      what: '모델 출력 위에 입력 id 를 권위로 덮는다',
      why: '원천 보존 원칙 — 인물·로케이션 id 는 상류가 확정한 원천이다. 모델이 id 를 바꾸거나 빠뜨려도 입력 목록을 기준으로 매칭하고, 누락은 최소 필드로 채운다.',
      src: `${S}/v2_design.ts (architecture.md §5)`,
    }],
  },
  {
    id: 'tokens', band: 'vis', row: 0, col: 3, axis: 'v', kind: 'persist',
    label: '디자인 토큰 기록', sub: 'persistDesignTokens', fn: 'persistDesignTokens()',
    file: `${P}/util/persist_design_tokens.ts`,
    summary: 'v2 직후 전역 디자인 토큰을 프로젝트 행에 쓴다. 이미지 초안의 하드 게이트라, 서버리스 경로에서는 실패를 흡수하지 않고 런을 실패시킨다.',
    inputs: [
      { from: 'v0', fields: 'visualIdentity (format → l0, style → l1)', usage: 'code' },
      { from: 'v2', fields: 'worldVisual (팔레트·색 의미)', usage: 'code' },
    ],
    outputs: [
      { field: 'design_tokens.l1 (전역 스타일 5토큰)', status: 'db-only', consumers: 'artist 캐릭터 시트 프롬프트, 초안 트리거' },
      { field: 'design_tokens.palette / color_meaning', status: 'db-only', consumers: 'artist 스토어, 시트 생성 라우트' },
      { field: 'design_tokens.l0 (매체·해상도·fps·화면비)', status: 'dropped', consumers: '', note: '읽는 코드가 없다. 같은 값의 메모리 원본은 v5 가 정상으로 쓰므로, 죽은 건 데이터가 아니라 DB 왕복 경로다' },
    ],
    why: [{
      what: '로컬 경로는 흡수, 서버리스 경로는 흡수하지 않는다',
      why: '같은 함수인데 로컬 러너는 실패해도 파이프라인을 계속하고, step 경로는 기다렸다가 실패를 표면화한다. 토큰이 이미지 초안의 하드 게이트라 조용히 비면 하류가 통째로 막히기 때문.',
      src: `${P}/index.ts (흡수) vs ${P}/steps.ts (표면화)`,
    }],
  },
  {
    id: 'budget-act', band: 'vis', row: 1, col: 0, axis: 'v', kind: 'check',
    label: '액션 예산 분석', sub: 'analyzeSceneActionBudget', fn: 'analyzeSceneActionBudget()',
    file: `${P}/validators/action_budget.ts`,
    summary: '씬의 액션 수를 세어 권장 샷 수를 뽑고, 한 샷에 안 담기는 씬을 이슈로 만든다. 이 이슈는 v3 의 샷 수 산정 근거로 지시문에 실리고, 동시에 최종 검수 리포트까지 그대로 흘러간다.',
    inputs: [{ from: 's3', fields: 'scene_actions[], estimated_seconds, purpose', usage: 'code' }],
    outputs: [
      { field: 'recommended_shots[] (개수만)', status: 'partial', consumers: 'v3 지시문의 액션 예산 블록', note: '어떤 액션을 어떻게 묶었는지 텍스트는 버려지고 개수만 전달된다' },
      { field: 'issues[] (sceneBudgetIssues)', status: 'live', consumers: '검수 리포트에 그대로 합본' },
    ],
    why: [{
      what: 'Compact 를 건너뛰어도 이 검사만은 돈다',
      why: 'v3 를 통째로 건너뛰는 경로에서도 씬별 액션 예산은 따로 계산해 둔다 — 검수 리포트의 씬 단위 이슈가 v3 유무와 무관하게 남아야 하기 때문.',
      src: `${P}/index.ts · ${P}/steps.ts (compact 분기 양쪽)`,
    }],
  },
  {
    id: 'v3', band: 'vis', row: 1, col: 1, axis: 'v', kind: 'llm', model: 'V',
    label: '씬 촬영계획', sub: 'v3 · runSceneCinematography', fn: 'runSceneCinematography()',
    file: `${S}/v3_scene_plan.ts`,
    calls: '런당 1콜 (전 씬 한 번에) · temperature 0.5 · 규칙 위반 시 1회 교정 재생성',
    summary: '씬마다 "이걸 어떻게 찍을 것인가"를 정한다 — 커버리지 패턴, 목표 샷 수, 렌즈 어휘, 카메라 마운트와 에너지, 조명 아크(켈빈 시작·끝), 팔레트 강조, 180° 축, 컷 템포, 평균 샷 초. 데쿠파주와 샷 설계가 이 디시플린 안에서만 움직인다.',
    inputs: [
      { from: 'in-genre', fields: 'genre 전체', usage: 'prompt' },
      { from: 'in-cast', fields: 'id / name / role 만', usage: 'partial', note: '성격·외형·아크·동기가 전부 잘린 채로 주 시점 인물과 180° 축을 고른다' },
      { from: 's3', fields: 'scene_id, estimated_seconds, act_ref, purpose, emotion_beat, location, characters_in_scene', usage: 'partial', note: 'time_of_day · weather · scene_actions 본문 · 대사는 안 간다' },
      { from: 'v0', fields: 'visualIdentity.style', usage: 'partial', note: '매체 밀도 규칙을 쓰면서 format.medium 은 안 받는다 — 화풍 문자열에 매체어가 들어 있다는 계약에 의존' },
      { from: 'v2', fields: 'global_palette, locations[].id 만', usage: 'partial', note: '로케이션은 id 문자열만 — 광원·스타일·소품을 못 본다' },
      { from: 'v1', fields: 'actVisualArc 전체', usage: 'prompt', note: '없으면 아크 블록과 막 표기가 통째로 빠진다' },
      { from: 'budget-act', fields: '씬별 권장 샷 수 요약', usage: 'prompt' },
    ],
    outputs: [
      { field: 'shot_count_target', status: 'live', consumers: '데쿠파주 협상 규칙, 샷 수 가드의 기대치' },
      { field: 'avg_shot_seconds / cut_pace / rhythm_profile', status: 'live', consumers: '데쿠파주 협상 규칙' },
      { field: 'lens_vocabulary / camera_mounting / camera_energy', status: 'live', consumers: '샷 설계 디시플린 절' },
      { field: 'lighting_arc / spatial_axis_180 / coverage_pattern / dominant_pov / palette_emphasis / visual_intent', status: 'live', consumers: '샷 설계 (플랜 전체가 JSON 으로 통째 직렬화)' },
      { field: 'shot_count_total', status: 'dropped', consumers: '', note: '계산해서 반환하는데 두 오케스트레이터 모두 플랜 배열과 이슈 배열만 꺼내 쓴다' },
    ],
    outputProbes: [{ field: 'shot_count_total', match: 'shot_count_total', produce: [`${S}/v3_scene_plan.ts`] }],
    contracts: [
      '대화 씬은 180° 축 설정 필수',
      '한 씬 안에서 렌즈·마운트·에너지는 일관',
      '평균 샷 초는 <b>매체 밀도</b>가 정한 구간 밖으로 못 나간다 — 고밀도 6~9초, 중밀도 5~7초, 저밀도 3.5~5초',
      '단 대사 발화 시간은 매체와 무관한 물리량이라 구간을 초과해도 된다',
    ],
    prompts: [
      { label: '시스템 지시 — 전문 (매체 인지 예산 포함)', anchor: { file: `${S}/v3_scene_plan.ts`, from: '당신은 V축 V3(씬 비주얼 플랜) 설계자이다.', keepFrom: true, to: '`;' } },
      {
        label: '유저 프롬프트 — 씬이 여기까지만 실린다',
        anchor: { file: `${S}/v3_scene_plan.ts`, from: '  const userPrompt = `', to: '`;' },
        note: '씬에서 실려 가는 것은 이 목록뿐이다. 시간대·날씨·비트 본문·대사는 여기 없고, 로케이션도 id 나열만 간다.',
      },
    ],
    samples: [{ label: '실제 산출 (한 씬)', file: '10_v3_sceneCinematography.json', pick: (j, ctx) => (j.scene_plans ?? []).find((p) => p.scene_id === ctx.sceneId) ?? j.scene_plans?.[0] }],
    why: [
      {
        what: '매체 밀도가 샷 길이 구간을 정한다',
        why: '샷 길이는 "관객이 프레임을 다 읽는 시간"이라는 전제. 질감·조명이 많은 실사는 독해가 느리고, 플랫한 저밀도 화면은 즉시 읽혀 여백이 곧 지루함이 된다. 단 대사 발화 시간은 물리량이라 예외로 열어 뒀다.',
        src: `${S}/v3_scene_plan.ts (#style-pacing)`,
      },
      {
        what: '응답이 최상위 배열로 와도 받는다',
        why: '기대형만 받던 시절, 모델이 배열을 바로 뱉으면 멀쩡한 플랜 전체가 빈 배열로 버려져 샷 수 0 으로 붕괴했다. 두 형태를 다 수용하도록 고쳤다.',
        src: `${S}/v3_scene_plan.ts extractScenePlans (2026-06-28 사고)`,
      },
    ],
  },
  {
    id: 'v3-val', band: 'vis', row: 1, col: 2, axis: 'v', kind: 'check',
    label: '촬영계획 규칙 검사', sub: 'validateSceneCinematography', fn: 'validateSceneCinematography() + 1회 교정',
    file: `${P}/validators/scene_cinematography.ts`,
    summary: 'v3 가 낸 플랜을 규칙으로 자기 검증한다 — 어휘·수치 범위, 그리고 상류 정합(v2 팔레트에 있는 색인가, 그 씬에 실제로 나오는 인물인가). 치명 위반이 있으면 위반 목록을 붙여 한 번만 다시 생성시키고, 치명이 더 적은 쪽을 채택한다.',
    inputs: [
      { from: 'v3', fields: 'scene_plans[]', usage: 'code' },
      { from: 's3', fields: 'scenes (등장 인물 대조)', usage: 'code' },
      { from: 'v2', fields: 'worldVisual.global_palette (색 대조)', usage: 'code' },
    ],
    outputs: [
      { field: '교정된 scene_plans[]', status: 'live', consumers: '데쿠파주, 샷 설계' },
      { field: 'validation.issues[]', status: 'flag', consumers: '', note: '"씬에 플랜 없음"이 경고 등급이라 교정을 유발하지도, 교정 문구에 실리지도 않는다 — 아래 샷 설계에서 씬이 통째로 증발하는 경로의 출발점' },
    ],
    contracts: [
      '교정본이 비었거나 형태가 깨졌으면 채택하지 않는다 — 원본 유지',
      '치명 <b>개수</b>가 줄거나 같을 때만 교정본을 쓴다 (씬 커버리지는 안 본다)',
    ],
    why: [{
      what: '재생성은 딱 한 번',
      why: '반복 교정은 비용이 선형으로 늘고 수렴 보장이 없다. 한 번 고쳐 보고 나빠지지 않았을 때만 받는다. 다만 비교 기준이 치명 개수뿐이라, 씬을 대량으로 잃은 교정본이 치명 0 이라는 이유로 채택될 수 있다.',
      src: `${S}/v3_scene_plan.ts 교정 분기`,
    }],
  },
  {
    id: 'infer-v3', band: 'vis', row: 1, col: 3, axis: 'v', kind: 'code',
    label: '씬 계획 역추론', sub: 'inferSceneCinematographyFromShots', fn: 'inferSceneCinematographyFromShots()',
    file: `${P}/util/infer_v3.ts`,
    summary: 'Compact 모드에서 v3 를 건너뛰었을 때 완성된 샷 설계로부터 씬 촬영계획을 거꾸로 만든다. 다만 <b>지금은 어떤 깊이도 Compact 로 판정되지 않아</b> 이 경로가 한 번도 돌지 않는다.',
    inputs: [
      { from: 'v4-llm', fields: 'shotDesign[]', usage: 'unused', note: 'Compact 판정이 항상 거짓이라 호출되지 않는다' },
      { from: 's3', fields: 'scenes', usage: 'unused' },
    ],
    outputs: [{ field: 'sceneCinematography[] (추론본)', status: 'dropped', consumers: '', note: 'Compact 스위치가 꺼져 있는 동안은 만들어지지 않는다. 180° 축은 원리상 복원 불가이고 설계 근거도 고정 문자열로 대체된다' }],
    checks: [{ label: 'Compact 트리거 목록', expect: '[]', file: 'src/lib/writer/types/pipeline.ts', re: /COMPACT_DEPTH_LEVELS:\s*readonly DepthLevel\[\]\s*=\s*(\[[^\]]*\])/ }],
    why: [
      {
        what: 'Compact 모드는 의도적으로 꺼진 스위치다',
        why: '전에는 짧은 영상이 씬 계획을 건너뛰고 샷 설계가 디시플린을 자체 판단했는데, 씬 단위 연출 규율이 약해졌다. 연출 품질을 위해 모든 깊이가 씬 촬영계획을 거치도록 바꾸고 트리거 목록을 <b>빈 배열</b>로 비웠다 — 되살리려면 깊이를 배열에 다시 넣으면 된다.',
        src: 'src/lib/writer/types/pipeline.ts (COMPACT_DEPTH_LEVELS)',
      },
      {
        what: '그 결과 Compact 분기가 통째로 도달 불가가 됐다',
        why: '역추론 모듈, 전용 이어달리기 파일, 샷 설계 지시서의 Compact 절이 코드에는 살아 있지만 실행되지 않는다. 죽은 코드가 아니라 <b>꺼둔 스위치 뒤의 코드</b>인데, 그 사실이 각 호출 지점에는 안 적혀 있어 읽는 사람이 살아 있다고 오해하기 쉽다.',
        src: `${P}/index.ts · ${P}/steps.ts · ${S}/v4_shots.ts 의 compact 분기`,
      },
    ],
  },

  // ── 샷 분해 ─────────────────────────────────────────────────────────────
  {
    id: 'physics', band: 'dec', row: 0, col: 0, axis: 's', kind: 'code',
    label: '샷 물리 상수', sub: 'SHOT_PHYSICS', file: `${P}/physics.ts`,
    summary: '샷 초 대역, 클립당 동사 상한, 모션 프롬프트 자수, 첫 프레임 프롬프트 자수. 모든 지시문이 이 한 곳에서만 문구를 가져간다.',
    outputs: [
      { field: '샷 초 대역 · 예외 상한', status: 'live', consumers: '데쿠파주 지시문, 샷 설계 지시문' },
      { field: '프롬프트 자수 대역', status: 'live', consumers: '샷 설계 지시문, v5 폴백 지시문' },
      { field: '동사 상한', status: 'live', consumers: '샷 설계, v5, 검수 판정 기준' },
    ],
    checks: [
      { label: '샷 초 하한', file: `${P}/physics.ts`, re: /shotSecondsMin:\s*(\d+)/ },
      { label: '샷 초 상한', file: `${P}/physics.ts`, re: /shotSecondsMax:\s*(\d+)/ },
      { label: '예외 절대 상한', file: `${P}/physics.ts`, re: /shotSecondsHardMax:\s*(\d+)/ },
      { label: '클립당 동사 상한', file: `${P}/physics.ts`, re: /verbsPerShotMax:\s*(\d+)/ },
    ],
    prompts: [{ label: '상수 정의 — 지시문에 주입되는 문구의 유일한 출처', anchor: { file: `${P}/physics.ts`, from: 'export const SHOT_PHYSICS', keepFrom: true, to: '\n\n// ──' } }],
    why: [{
      what: '같은 법칙이 스테이지마다 다른 숫자로 표류했다',
      why: '실측으로 데쿠파주는 "2~8초", 샷 설계는 "5~15초"를 동시에 말하고 있었고 자수도 "50~80자" 대 "50~100자"로 갈라져 있었다. 백엔드 법칙을 한 파일로 수렴시키고, 값을 바꾸면 회귀 배터리를 다시 돌리는 것을 계약으로 삼았다.',
      src: `${P}/physics.ts 헤더 (#prompt-audit 2026-07-21)`,
    }],
  },
  {
    id: 'policy', band: 'dec', row: 0, col: 1, axis: 's', kind: 'code',
    label: '대표 스토리보드 정책', sub: 'budget.ts', file: `${P}/budget.ts`,
    summary: '물리가 아니라 제품 정책. 장편은 정직한 커버가 목표가 아니라 "겉으로 30~60분 되는 척"이 목표라, 전역 샷 상한을 씬 수로 나눠 씬당 예산 힌트를 만든다.',
    inputs: [
      { from: 'in-genre', fields: 'depth_level, runtime_seconds', usage: 'code' },
      { from: 's3', fields: 'coverage_mode, 씬 수', usage: 'code' },
    ],
    outputs: [
      { field: 'shotBudgetHint (씬당 최대 샷)', status: 'live', consumers: '데쿠파주 지시문의 샷 예산 블록' },
      { field: 'renderBudgetBlock (씬 수·초 배분)', status: 'live', consumers: '씬 생성 지시문' },
    ],
    checks: [
      { label: '전역 샷 상한', file: `${P}/budget.ts`, re: /REPRESENTATIVE_SHOT_CAP\s*=\s*(\d+)/ },
      { label: '대표 모드 깊이', file: `${P}/budget.ts`, re: /REPRESENTATIVE_DEPTHS:\s*readonly DepthLevel\[\]\s*=\s*(\[[^\]]*\])/ },
    ],
    contracts: [
      '전역 샷 상한은 <b>프롬프트 문구로만</b> 존재한다 — 코드가 강제하지 않는다',
      '씬당 예산에 하한 3샷이 걸려 있어 씬이 아주 많으면 힌트를 완벽히 지켜도 상한을 넘는다',
    ],
    prompts: [{ label: '씬 생성에 주입되는 예산 블록 (두 갈래)', anchor: { file: `${P}/budget.ts`, from: 'export function renderBudgetBlock', keepFrom: true, to: '\n\nexport interface BudgetViolation' } }],
    why: [{
      what: '산수를 모델에게 맡기지 않는다',
      why: '모델은 총합 산수는 잘 맞추는데, 장편에서 씬당 액션을 3개로 고정한 채 씬 초만 부풀린다(중앙값 9~10배). 그래서 코드가 예산표를 계산해 주입하고 검증한다.',
      src: `${P}/budget.ts 헤더 (E3a 실측)`,
    }],
  },
  {
    id: 'cam-contract', band: 'dec', row: 0, col: 2, axis: 's', kind: 'code',
    label: '카메라 규율 계약', sub: 'buildSystemInstruction (env 분기)', fn: 'buildSystemInstruction()',
    file: `${S}/decoupage.ts`,
    calls: '환경변수 WRITER_CAMERA_CONTRACT 로 팔 선택 · 호출 시점에 읽는다',
    summary: '데쿠파주 지시문에 끼워 넣을 카메라 규율 문구를 고른다. 현행 기본은 완화판 v3 이고 옛 문구는 환경변수로만 나온다. 이 한 절이 전체 영상의 카메라 무빙 분포를 정한다.',
    outputs: [{ field: 'cameraContract 문자열', status: 'live', consumers: '데쿠파주 지시문 (그 자리에 그대로 삽입)' }],
    contracts: [
      '기본값은 완화판 v3. <code>legacy</code> 만 옛 문구로 되돌린다',
      '<code>relaxed</code> / <code>relaxed-v2</code> 는 과거 실험 팔 재현용',
      'env 는 모듈 로드가 아니라 <b>호출 시점</b>에 읽는다 — 팔 전환이 모듈 캐시에 갇히지 않게',
    ],
    prompts: [
      { label: '현행 기본 — 완화판 v3', anchor: { file: `${S}/decoupage.ts`, from: 'const CAMERA_CONTRACT_RELAXED_V3 = `', to: '`;' } },
      { label: '옛 기본 — legacy (환경변수로만 호출)', anchor: { file: `${S}/decoupage.ts`, from: 'const CAMERA_CONTRACT_LEGACY = `', to: '`;' } },
      { label: '팔 선택 코드 — 기본값이 무엇인지', anchor: { file: `${S}/decoupage.ts`, from: '  const contract = process.env.WRITER_CAMERA_CONTRACT', keepFrom: true, to: '\n  return `' } },
    ],
    why: [
      {
        what: '완화판이 기본으로 승격됐다',
        why: '옛 문구의 근거였던 "둥둥 떠다님"이 블라인드 9클립 재검증에서 0/9 로 반증됐고, 그 원관측은 모션 계약이 영상 모델에 전달되기도 전 시절이라 사유 자체가 무효였다. 반대로 고정 계약은 3/3 위반됐다 — 통제가 안 되는 쪽은 무빙 개방이 아니라 고정 준수였다.',
        src: `${S}/decoupage.ts 헤더 (#camera-contract-relax 2026-08-11)`,
      },
      {
        what: '억압은 비대칭이었다',
        why: '203샷에서 카메라 진폭 large 가 2건(1%)인데 <b>같은 프롬프트</b>의 인물 진폭 large 는 13건이었다. 모델 능력이 아니라 카메라 어휘만 눌려 있었다는 뜻.',
        src: `${S}/decoupage.ts 헤더 ③`,
      },
      {
        what: '완화는 양이 아니라 정확도를 올렸다',
        why: '3회 비중첩 A/B 에서 모션이 필요한 비트 적중은 28.4%→53.1% 로 올랐는데 정적 비트 오발은 오히려 6.03%→4.63% 로 <b>내려갔다</b>. 샷 수와 길이도 사실상 불변(145→146.3개, 7.62→7.49초). 채택 근거는 총량이 아니라 이 정확도다.',
        src: `${S}/decoupage.ts 헤더 ④ (camera-contract-relax-v3)`,
      },
      {
        what: '재현 주의 — 대조군 정의가 바뀌었다',
        why: '옛 실험들은 대조군을 "env 미설정"으로 정의했다. 기본값이 바뀌었으므로 지금 미설정으로 돌리면 대조군이 아니라 완화군이 나온다. 재현하려면 <code>legacy</code> 를 명시해야 한다.',
        src: `${S}/decoupage.ts 헤더 ⚠️`,
      },
    ],
  },
  {
    id: 'dec-prompt', band: 'dec', row: 1, col: 0, axis: 's', kind: 'code',
    label: '데쿠파주 지시문 조립', sub: 'buildUserPrompt', fn: 'buildUserPrompt()',
    file: `${S}/decoupage.ts`,
    summary: '씬 하나를 감독에게 보여줄 형태로 조립한다. 비트를 인덱스 붙여 나열하고, 촬영계획을 협상 규칙으로 붙이고, 사이즈 사다리 규칙과 예산 블록을 얹고, 등장 인물과 로케이션 디자인을 골라 넣는다.',
    inputs: [
      { from: 's3', fields: 'scene_id, purpose, location, time_of_day, emotion_beat, estimated_seconds, info_asymmetry, dialogue_summary, key_dialogue, scene_actions[]', usage: 'prompt' },
      { from: 'v3', fields: 'coverage_pattern, shot_count_target, rhythm_profile, cut_pace, avg_shot_seconds, lens_vocabulary, camera_energy', usage: 'partial', note: '플랜의 8항목 중 7개만 온다 — 조명 아크·팔레트 강조·주 시점·180° 축·마운트·설계 근거는 데쿠파주를 건너뛰고 샷 설계로 직행' },
      { from: 'in-cast', fields: 'id, role, personality 만', usage: 'partial', note: 'personality 는 매퍼가 비워 온다' },
      { from: 'v2', fields: 'worldVisual.locations 중 이 씬 로케이션만', usage: 'prompt' },
      { from: 'policy', fields: 'shotBudgetHint', usage: 'prompt', note: '대표 모드일 때만' },
      { from: 'cam-contract', fields: 'cameraContract', usage: 'prompt' },
    ],
    outputs: [{ field: 'userPrompt 문자열', status: 'live', consumers: '데쿠파주 LLM 호출' }],
    contracts: [
      '목표 샷 수 ±1 이 <b>상한</b> — 초과하려면 먼저 인접 샷 병합, 그래도 초과면 사유 명시',
      '평균 샷 초는 시청자의 인지 예산 — 샷 수를 늘리려고 개별 샷을 압착하지 마라',
      '인접 샷의 사이즈 사다리 3단계 이상 점프는 인서트·POV 동기 없이 금지',
    ],
    prompts: [
      { label: '촬영계획 협상 규칙 블록', anchor: { file: `${S}/decoupage.ts`, from: '[sceneCinematography 비주얼 플랜 — 협상 규칙', keepFrom: true, to: '`\n    : `[sceneCinematography 미제공' } },
      { label: '샷 사이즈 연속성 규칙', anchor: { file: `${S}/decoupage.ts`, from: '[샷 사이즈 연속성]', keepFrom: true, to: '`;' } },
      { label: '대표 스토리보드 예산 블록', anchor: { file: `${S}/decoupage.ts`, from: '[샷 예산 — 대표 스토리보드 모드', keepFrom: true, to: '`\n    :' } },
      { label: '씬 직렬화 + 출력 형식 — 씬이 이렇게 들어간다', anchor: { file: `${S}/decoupage.ts`, from: '  return `[씬 정보]', to: '`;\n}' } },
    ],
    why: [{
      what: '"참고용 힌트"가 협상 규칙으로 승격됐다',
      why: '힌트였던 시절 실측: 목표 5샷×6초 설계가 8샷 평균 3.2초로 압착돼 인지 과부하 컷이 됐다. 그래서 상한과 되돌리는 절차(병합 먼저)를 문구로 박았다.',
      src: `${S}/decoupage.ts (#p2-pacing 2026-08-04)`,
    }],
  },
  {
    id: 'dec-llm', band: 'dec', row: 1, col: 1, axis: 's', kind: 'llm', model: 'V',
    label: '데쿠파주', sub: 'decoupageForScene', fn: 'runDecoupage() / decoupageForScene()',
    file: `${S}/decoupage.ts`,
    calls: '씬당 1콜 · temperature 0.7 (연출 창의성 — 샷 설계보다 높다)',
    summary: '감독이 비트를 샷으로 분해한다. 네 가지 연산(1:1 파생 · 없던 샷 추가 · 여러 비트 병합 · 한 비트 분할)으로 샷을 저작하고, 샷마다 사이즈·길이·리듬 역할·카메라 의도·극적 목적을 붙인다. 샷 개수는 시간 계산이 아니라 연출 판단으로 정해진다.',
    inputs: [{ from: 'dec-prompt', fields: 'userPrompt + systemInstruction', usage: 'prompt' }],
    outputs: [
      { field: 'shots[].operation / source_beats', status: 'live', consumers: '샷 설계 지시문 (감독 데쿠파주 목록)' },
      { field: 'shots[].shot_size / intended_duration_seconds', status: 'live', consumers: '샷 설계 — 코드가 사후 보존까지 한다' },
      { field: 'shots[].camera_intent', status: 'flag', consumers: '샷 설계 지시문', note: '지시문으로만 전달된다 — 샷 설계가 코드로 보존하는 4필드에 없어서 모델이 안 따르면 무음으로 어긋난다' },
      { field: 'shots[].beat_summary / beat_summary_native', status: 'live', consumers: '샷 설계 지시문, 결정론 조립의 표시문, 대사 스테이지' },
      { field: 'shots[].rhythm_role / shot_function / dramatic_purpose / added_rationale', status: 'live', consumers: '샷 설계 지시문' },
      { field: 'shots[].camera_move_motivation', status: 'flag', consumers: '', note: '카메라 규율이 "왜 움직여야 하는지"를 반드시 적게 시키는 필드인데, 샷 설계 지시문의 데쿠파주 한 줄에 이 항목이 없다 — 카메라를 실제로 설계하는 단계가 그 동기를 못 본다' },
      { field: 'uncovered_beats[] / coverage_ratio / rhythm_profile / director_notes', status: 'dropped', consumers: '', note: '커버리지 감사 지표인데 읽는 코드가 없다' },
    ],
    outputProbes: [
      { field: 'camera_move_motivation', match: 'camera_move_motivation', produce: [`${S}/decoupage.ts`, 'src/lib/writer/types/pipeline.ts'] },
      { field: 'uncovered_beats', match: 'uncovered_beats', produce: [`${S}/decoupage.ts`, 'src/lib/writer/types/pipeline.ts'] },
    ],
    checks: [
      { label: '씬 동시성 기본값', file: `${S}/decoupage.ts`, re: /Math\.min\(Math\.floor\(raw\), MAX_SCENE_CONCURRENCY\) : (\d+)/ },
      { label: '동시성 상한', file: `${S}/decoupage.ts`, re: /MAX_SCENE_CONCURRENCY\s*=\s*(\d+)/ },
    ],
    contracts: [
      '샷 개수는 <b>연출적</b> 결정 — 목표 샷 수는 힌트',
      '모든 비트를 커버하되, 의도적 생략은 인덱스로 명시',
      '정적 비트를 반드시 1개 이상 배치 — 관객의 눈이 쉴 곳',
      '같은 사이즈를 연속 배치하지 마라',
    ],
    prompts: [{ label: '시스템 지시 — 전문 (카메라 규율은 위 노드가 끼워 넣는다)', anchor: { file: `${S}/decoupage.ts`, from: '당신은 영화 감독이다.', keepFrom: true, to: '`;\n}' } }],
    samples: [{
      label: '실제 산출 — 한 씬의 앞 3샷 (추가·병합·파생이 나란히)',
      file: '10b_c_decoupage.json',
      pick: (j, ctx) => {
        const sc = (j.scenes ?? []).find((s) => s.scene_id === ctx.sceneId) ?? j.scenes?.[0]
        if (!sc) return null
        return { 씬: sc.scene_id, 비트수: sc.beat_count, 샷수: sc.shot_count, 커버리지: sc.coverage_ratio, 앞3샷: (sc.shots ?? []).slice(0, 3) }
      },
    }],
    why: [
      {
        what: '비트와 샷을 분리한 것 자체가 이 단계의 존재 이유',
        why: '"없던 샷을 더하는 것이 연출의 본질"이라는 전제로, 설정샷·리액션·인서트·컷어웨이를 모델이 스스로 추가하게 한다. 시간 제약은 이 단계를 <b>움직이는 힘</b>이 아니라 뒤에서 재는 자로만 둔다.',
        src: `${S}/decoupage.ts 헤더 (linear_pipeline Turn 7)`,
      },
      {
        what: '리듬 저작이 "뇌 아픈 영상"의 해독제로 설계됐다',
        why: '모든 샷이 같은 길이·에너지면 시청자가 지친다는 진단에서, 리듬 역할을 다양하게 쓰고 감정 곡선에 컷 템포를 맞추라는 절이 지시문의 가장 강조된 자리에 들어갔다.',
        src: `${S}/decoupage.ts 시스템 지시`,
      },
      {
        what: '씬 단위 체크포인트와 착수 게이트',
        why: '17씬 프로젝트가 한 인보케이션 예산을 구조적으로 넘겨 재시도 3연속으로 런이 죽던 사고의 처방. 새 씬을 <b>착수하기 전</b>에 예상 소요(이 패스 최대 실측 ×1.25)로 끝날 시간을 예측해 막는다. 사후 게이트만 두면 동시성이 높을 때 큐가 먼저 비어 게이트가 한 번도 안 걸리고 328초까지 밀렸다.',
        src: `${S}/decoupage.ts (#scene-checkpoint 2026-08-09)`,
      },
      {
        what: '기본 동시성이 1 에서 4 로 바뀌었다',
        why: '호출부가 환경변수 없을 때 1 을 넘기고 있어서 프로덕션에서 데쿠파주가 순차로 돌았다(실측 약 262초). 내부 기본값으로 통일하고 호출부는 미지정을 넘긴다.',
        src: `${S}/decoupage.ts (#concurrency-gap 2026-08-10)`,
      },
    ],
  },
  {
    id: 'dec-index', band: 'dec', row: 1, col: 2, axis: 's', kind: 'code',
    label: '전역 샷 번호 재인덱싱', sub: 'runDecoupage 조립부', file: `${S}/decoupage.ts`,
    summary: '씬별로 만들어진 샷 id 를 씬 경계를 넘어 하나의 순번으로 통일한다. 체크포인트에 저장된 씬-로컬 id 를 최종 조립 시점에 한 번만 정리하는 자리다.',
    inputs: [{ from: 'dec-llm', fields: 'SceneDecoupage[] (완료 씬 전부)', usage: 'code' }],
    outputs: [
      { field: 'shots[].shot_id (전역 순번)', status: 'live', consumers: '샷 설계, 결정론 조립, 대사 조인' },
      { field: 'total_shots / total_added / total_merged / total_split', status: 'partial', consumers: '진행 마커', note: '서버리스에서는 파일 로깅이 꺼져 있어 이 관측치가 남지 않는다' },
    ],
    contracts: ['state 에 병합된 객체를 변형하지 않게 얕은 복제 후 재인덱싱'],
  },

  // ── 샷 설계 ─────────────────────────────────────────────────────────────
  {
    id: 'v4-sys', band: 'des', row: 0, col: 0, axis: 's', kind: 'code',
    label: '샷 설계 지시서 조립', sub: 'generateL4ForScene 지시부', file: `${S}/v4_shots.ts`,
    summary: '샷 설계자에게 줄 시스템 지시를 만든다. 데쿠파주가 있으면 "샷 경계를 바꾸지 말고 스펙만 붙여라" 모드가 켜지고, 모션 어휘 전문·공간 앵커 규칙·출력 언어 고정·자수 규칙이 이 자리에서 합쳐진다.',
    inputs: [
      { from: 'dec-index', fields: '데쿠파주 존재 여부 → 확정 모드 분기', usage: 'code' },
      { from: 'v3', fields: 'lens_vocabulary, camera_mounting, camera_energy, lighting_arc, spatial_axis_180', usage: 'prompt' },
      { from: 'motion-vocab', fields: '모션 어휘 설명 전문', usage: 'prompt' },
      { from: 'physics', fields: '샷 초 대역, 동사 상한, 자수 대역', usage: 'prompt' },
    ],
    outputs: [{ field: 'systemInstruction 문자열', status: 'live', consumers: '샷 설계 LLM 호출' }],
    contracts: [
      '데쿠파주 확정 모드에서는 <b>샷 개수·경계·순서 변경 금지</b>',
      '자유서술 필드는 예외 없이 영어 — 번역 없이 그대로 생성기 프롬프트가 되기 때문',
      '같은 씬 인접 샷은 직전 샷의 공간 앵커를 레이어 하나에 반드시 남긴다',
      '카메라 큰 무브 + 인물 큰 액션 + 환경 변화 동시 금지',
    ],
    prompts: [
      { label: '데쿠파주 확정 모드 절', anchor: { file: `${S}/v4_shots.ts`, from: '[데쿠파주 확정 모드]', keepFrom: true, to: '` : \'\'}' } },
      { label: '공간 앵커 절', anchor: { file: `${S}/v4_shots.ts`, from: '[공간 앵커 —', keepFrom: true, to: '\n\n[출력 언어' } },
      { label: '출력 언어 고정 절', anchor: { file: `${S}/v4_shots.ts`, from: '[출력 언어 —', keepFrom: true, to: '\n\n${MOTION_VOCABULARY_GUIDE}' } },
      { label: '디시플린 절 — 일반 모드 / Compact 모드 두 갈래', anchor: { file: `${S}/v4_shots.ts`, from: '  const disciplineSection = compactMode', keepFrom: true, to: '\n\n  const systemInstruction' } },
      { label: '작성 규칙 — 동적·정적', anchor: { file: `${S}/v4_shots.ts`, from: '샷 분배 원칙:', keepFrom: true, to: '`;' } },
    ],
    why: [
      {
        what: '공간 앵커 규칙은 도시가 통째로 사라진 사고에서 나왔다',
        why: '폐허 도시 한가운데 씬에서 비스타 샷 하나만 도시가 사라져 연속성이 깨졌다. 그래서 프레이밍이 크게 바뀌어도 배경 지형지물을 레이어 하나에 유지하고, 제거는 데쿠파주가 공간 이동을 명시했을 때만 허용한다.',
        src: `${S}/v4_shots.ts (FIX-B #space-anchor)`,
      },
      {
        what: '출력 언어를 영어로 못 박았다',
        why: '이 값들은 번역을 거치지 않고 그대로 이미지·영상 생성기 프롬프트가 되거나 영어 템플릿에 삽입된다. 고정 어휘 필드는 원래 영어라 지시 대상에서 빼 뒀다.',
        src: `${S}/v4_shots.ts (2026-07-22 제품 오너 판정 E11)`,
      },
    ],
  },
  {
    id: 'v4-cont', band: 'des', row: 0, col: 1, axis: 's', kind: 'code',
    label: '청크 연속성 계약', sub: 'buildV4ContinuityBlock', fn: 'buildV4ContinuityBlock()',
    file: `${S}/v4_shots.ts`,
    summary: '한 씬의 샷이 청크 크기를 넘어 여러 번 나눠 호출될 때, 직전 청크가 확정한 샷 꼬리의 첫 프레임·모션 스펙을 다음 청크 지시문에 계약으로 넣는다. 씬 사이에는 쓰지 않는다.',
    inputs: [{ from: 'v4-llm', fields: '직전 청크의 확정 ShotDesign 꼬리 2개', usage: 'prompt' }],
    outputs: [{ field: '연속성 계약 블록', status: 'live', consumers: '다음 청크의 샷 설계 호출' }],
    checks: [{ label: '청크 크기', file: `${S}/v4_shots.ts`, re: /SHOT_CHUNK_SIZE\s*=\s*(\d+)/ }],
    contracts: ['동일 구도 복제 금지 — 이어지되 새 프레임', '씬 간에는 전달하지 않는다 (씬 병렬 설계 보존)'],
    prompts: [{ label: '연속성 계약 블록 문구', anchor: { file: `${S}/v4_shots.ts`, from: '[직전 확정 샷 스펙 — 연속성 계약]', keepFrom: true, to: '`;' } }],
    why: [{
      what: '청크 경계에서 의상·소품·조명이 리셋됐다',
      why: '긴 씬을 잘라 부르면 각 호출은 앞 청크가 무엇을 확정했는지 모른다. 꼬리 2개를 계약으로 넘겨 단절을 봉합했다. 씬 사이에 안 쓰는 이유는 씬 병렬 처리를 깨지 않기 위해서.',
      src: `${S}/v4_shots.ts (#n-1 2026-08-05)`,
    }],
  },
  {
    id: 'v4-llm', band: 'des', row: 0, col: 2, axis: 's', kind: 'llm', model: 'V',
    label: '샷 설계 3분할', sub: 'v4 · runShotDesign', fn: 'runShotDesign() / generateL4ForScene()',
    file: `${S}/v4_shots.ts`,
    calls: '씬당 1콜 (샷이 청크 크기를 넘으면 나눠 순차) · temperature 0.6 · 파싱 실패 시 1회 재시도',
    summary: '감독이 정한 샷 하나하나에 스펙을 붙인다. 셋으로 나뉜다 — 의도(왜 이 샷인가, 길이 근거, 관객 초점), 정적 스펙(렌즈·앵글·심도·프레이밍 3레이어·조명·인물 블로킹·소품·팔레트·질감·첫 프레임 프롬프트), 동적 스펙(카메라 모션·인물 동작·시선 아크·환경 변화·전환·모션 프롬프트). 첫 프레임 프롬프트와 모션 프롬프트가 최종 렌더 입력이다.',
    inputs: [
      { from: 'v4-sys', fields: 'systemInstruction', usage: 'prompt' },
      { from: 'dec-index', fields: 'shot_id, operation, shot_function, shot_size, intended_duration_seconds, source_beats, camera_intent, rhythm_role, dramatic_purpose, beat_summary, added_rationale', usage: 'partial', note: '한 줄 요약으로 직렬화 — camera_move_motivation 과 beat_summary_native 는 빠진다' },
      { from: 's3', fields: '씬 전체 (JSON 통째)', usage: 'prompt' },
      { from: 'v3', fields: '해당 씬 플랜 전체 (JSON 통째)', usage: 'prompt' },
      { from: 'v0', fields: 'visualIdentity.style 만', usage: 'partial' },
      { from: 'v2', fields: 'global_palette, 이 씬 로케이션, 등장 인물의 costume 만', usage: 'partial', note: '외형·인물 팔레트·색 의미·VFX 방향은 안 간다' },
      { from: 'in-cast', fields: '이 씬 등장 인물 전체 객체', usage: 'prompt' },
      { from: 'v4-cont', fields: '직전 청크 꼬리 스펙', usage: 'prompt', note: '청크 호출일 때만' },
    ],
    outputs: [
      { field: 'static_spec.first_frame_prompt', status: 'live', consumers: '결정론 조립 → 이미지 생성 프롬프트 (최종본)' },
      { field: 'dynamic_spec.motion_prompt', status: 'live', consumers: '결정론 조립 → 영상 생성 프롬프트 (최종본)' },
      { field: 'static_spec 전체', status: 'live', consumers: '조립이 통째로 운반 → 샷 기록, 러프 보드의 상세 스펙' },
      { field: 'dynamic_spec 전체', status: 'live', consumers: '조립이 통째로 운반 → 샷 기록, 모션 계약문, 러프 그리드' },
      { field: 'intent.duration_seconds / dramatic_purpose / shot_position_in_scene', status: 'live', consumers: '결정론 조립' },
      { field: 'intent.operation / source_beats / shot_function / rhythm_role', status: 'dropped', consumers: '', note: '데쿠파주 출처를 결정론적으로 심는데, 바로 다음 단계인 조립기가 네 필드를 하나도 읽지 않는다' },
      { field: 'dynamic_spec.transition_in / transition_out', status: 'dropped', consumers: '', note: '타입 정의와 지시문에만 존재 — 읽는 곳 0' },
      { field: 'intent.duration_justification / audience_focus / story_beat_ref', status: 'dropped', consumers: '', note: '생성만 되고 하류 소비처가 없다' },
    ],
    outputProbes: [
      { field: 'source_beats', match: 'source_beats', produce: [`${S}/v4_shots.ts`, `${S}/decoupage.ts`, 'src/lib/writer/types/pipeline.ts'] },
      { field: 'transition_in', match: 'transition_in', produce: [`${S}/v4_shots.ts`, 'src/lib/writer/types/pipeline.ts'] },
      { field: 'duration_justification', match: 'duration_justification', produce: [`${S}/v4_shots.ts`, 'src/lib/writer/types/pipeline.ts'] },
    ],
    checks: [
      { label: '씬 동시성 기본값', file: `${S}/v4_shots.ts`, re: /Math\.min\(Math\.floor\(raw\), MAX_SHOT_CONCURRENCY\) : (\d+)/ },
      { label: '동시성 상한', file: `${S}/v4_shots.ts`, re: /MAX_SHOT_CONCURRENCY\s*=\s*(\d+)/ },
      { label: '씬당 재시도', file: `${S}/v4_shots.ts`, re: /MAX_SCENE_TRIES\s*=\s*(\d+)/ },
    ],
    contracts: [
      '데쿠파주 샷과 <b>1:1</b> — 추가·삭제·병합·분할 금지',
      '정적 스펙의 샷 타입은 데쿠파주 사이즈 그대로, 의도의 길이는 데쿠파주 길이 그대로',
      '동사 1~2개, 순차 표현 금지',
      '렌즈는 촬영계획의 렌즈 어휘 안에서만, 색온도는 조명 아크 구간 안에서',
    ],
    prompts: [{ label: '감독 데쿠파주 직렬화 — 샷 하나가 이렇게 들어간다', anchor: { file: `${S}/v4_shots.ts`, from: '[감독 데쿠파주 — 이 샷들에', keepFrom: true, to: '\n    : `[샷 목표 수]' } }],
    samples: [{ label: '실제 산출 — 샷 하나의 3분할 전체', file: '11_v4_shotDesign.json', pick: (j, ctx) => (j.shots ?? []).find((s) => s.intent?.shot_id === ctx.shotId) ?? j.shots?.[0] }],
    why: [
      {
        what: '기본 동시성이 4 에서 8 로 올랐다',
        why: '15씬·157샷 고정 입력으로 3팔×3런 재측정: 235.5초 → 133.9초(−43.1%), 에러 0, 샷 수 불변. 실효 병렬도가 3.80→6.69 로 거의 선형이었다. 수용량 비용도 0 — 동시 런의 병목은 여기가 아니라 샷 검수 단일 콜의 토큰 한도라 계산상 동시 런 수가 같다.',
        src: `${S}/v4_shots.ts (shotdesign-concurrency v2, 2026-08-11)`,
      },
      {
        what: '샷이 많으면 청크로 자른다',
        why: '긴 러닝타임에서 씬당 15~20샷이 되면 호출당 JSON 출력이 커져 응답이 잘리거나 호출이 극단적으로 길어진다. 출력 크기 상한으로 방어한다.',
        src: `${S}/v4_shots.ts (#B)`,
      },
      {
        what: '샷 수 불일치가 조용히 통과하던 구멍이 있었다',
        why: 'shot id 표준화가 인덱스 매핑이라 개수가 어긋나면 뒤쪽 데쿠파주 샷이 통째로 사라진다. 그런데 JSON 손실 복구가 아이템을 버리고도 파싱을 성립시켜 에러가 0 이었다 — "8샷이 2샷으로 줄어도 무사 통과"의 기제였다.',
        src: `${S}/v4_shots.ts (#p4-json-guard 2026-08-11)`,
      },
    ],
  },
  {
    id: 'v4-parse', band: 'des', row: 0, col: 3, axis: 's', kind: 'code',
    label: '응답 형태 방어', sub: 'parseL4Shots', fn: 'parseL4Shots()',
    file: `${S}/v4_shots.ts`,
    summary: '모델이 다섯 가지 형태 중 무엇으로 답해도 샷 배열로 만든다 — 기대형, 배열 래핑, 샷 배열 직접, 이중 중첩, 그리고 샷 id 를 키로 한 맵.',
    inputs: [{ from: 'v4-llm', fields: '원 응답 (형태 미상)', usage: 'code' }],
    outputs: [{ field: 'ShotDesign[]', status: 'live', consumers: '샷 수 가드' }],
    prompts: [{ label: '방어하는 다섯 형태 — 코드 주석', anchor: { file: `${S}/v4_shots.ts`, from: '// 방어: 모델이 다음 중 하나로 응답할 수 있음', keepFrom: true, to: 'export function parseL4Shots' } }],
    why: [{
      what: '다섯 번째 형태는 실측으로 추가됐다',
      why: '샷 id 를 키로 한 맵 형태가 실제로 관측돼 케이스가 하나 늘었다. 형태 방어가 없으면 스테이지 전체가 죽는다.',
      src: `${S}/v4_shots.ts (2026-07-15 실측)`,
    }],
  },
  {
    id: 'v4-count', band: 'des', row: 1, col: 0, axis: 's', kind: 'check',
    label: '샷 수 가드', sub: 'judgeShotCount', fn: 'judgeShotCount()',
    file: `${S}/v4_shots.ts`,
    summary: '돌아온 샷 수가 기대와 맞는지 본다. 데쿠파주 구동이면 정확히 일치를 요구하고, 촬영계획 구동이면 ±1 을 허용한다. 어긋나면 한 번 재시도하고, 최종 시도에서 절반 이하만 왔으면 수용하지 않고 씬 실패로 넘긴다.',
    inputs: [
      { from: 'v4-parse', fields: '파싱된 샷 수', usage: 'code' },
      { from: 'dec-index', fields: '기대 샷 수 (데쿠파주 구동)', usage: 'code' },
      { from: 'v3', fields: 'shot_count_target (플랜 구동)', usage: 'code' },
    ],
    outputs: [
      { field: '판정 (ok / retry / fatal / accept)', status: 'live', consumers: '샷 설계 재시도 루프' },
      { field: 'ShotCountBadge[]', status: 'flag', consumers: '스테이지 산출물·완료 마커', note: '수용한 불일치의 유일한 흔적인데, 서버리스에서는 파일 로깅이 꺼져 있어 운영 환경에 남지 않는다' },
    ],
    checks: [{ label: '대량 소실 임계', file: `${S}/v4_shots.ts`, re: /CATASTROPHIC_LOSS_RATIO\s*=\s*([\d.]+)/ }],
    contracts: [
      '데쿠파주 구동 = 오차 0, 플랜 구동 = 오차 1 (프롬프트 계약이 ±1)',
      'Compact 모드는 기대치가 없어 하한만 본다',
      '기대의 절반 이하는 대량 소실로 보고 거부',
    ],
    prompts: [{ label: '가드가 필요한 이유 — 코드 주석', anchor: { file: `${S}/v4_shots.ts`, from: '// 왜 필요한가: 아래 shot_id 표준화가', keepFrom: true, to: '\nexport interface ShotCountBadge' } }],
    why: [{
      what: '경미한 어긋남은 받되 흔적을 남긴다',
      why: '8→6 같은 경미한 차이로 씬을 통째로 실패시키면 비용이 크다. 수용하되 배지를 스테이지 산출물과 완료 마커에 박는다 — 콘솔 경고는 흘러가 버리기 때문. 다만 그 배지 자체가 운영 환경에서는 안 남는다.',
      src: `${S}/v4_shots.ts judgeShotCount`,
    }],
  },
  {
    id: 'motion-vocab', band: 'des', row: 1, col: 1, axis: 's', kind: 'code',
    label: '모션 어휘 교정', sub: 'normalizeCameraMotion', fn: 'normalizeCameraMotion() / normalizeCharacterMagnitude()',
    file: 'src/lib/writer/motion-vocabulary.ts',
    summary: '카메라 유형·방향·속도·진폭과 인물 동작 크기의 정본 낱말을 한 곳에서 정의하고, 지시문에 실을 어휘 설명을 만들고, 목록 밖 값이 오면 여기서 한 번만 정규화한다. 교정 내역은 파일로 남긴다.',
    inputs: [{ from: 'v4-count', fields: 'dynamic_spec.camera_motion, character_motion[].magnitude', usage: 'code' }],
    outputs: [
      { field: '모션 어휘 설명 블록', status: 'live', consumers: '샷 설계 지시서 (어휘 문구의 유일한 출처)' },
      { field: '정규화된 camera_motion', status: 'live', consumers: '모션 계약문, 6축 카메라 컨트롤, 준수 검수, 씬 역추론' },
      { field: '교정 기록 파일', status: 'flag', consumers: '사람이 읽는 진단 파일', note: '"조용한 열화를 막으려고" 만든 채널인데 서버리스에서는 파일 쓰기가 꺼져 있어 그 기록 자체가 조용히 사라진다' },
      { field: 'mapped 플래그 (어휘 밖 미상 표시)', status: 'dropped', consumers: '', note: '저장 시 떨어뜨린다 — 소비처가 매번 다시 정규화해서 지금은 무해하지만, "판단은 소비처에 남긴다"는 신호가 데이터에 안 실린다' },
    ],
    contracts: [
      '방향·속도를 유형 이름에 붙이지 마라 — 유형과 방향을 따로 적는다',
      '매핑 실패는 <b>고정으로 떨구지 않는다</b> — 원문을 유지한 채 미상으로 표시',
      '카메라 진폭 미상은 최소값, 인물 동작 크기 미상은 보통값 (기본 방향이 반대)',
    ],
    prompts: [
      { label: '지시서에 실리는 어휘 설명 전문', anchor: { file: 'src/lib/writer/motion-vocabulary.ts', from: 'export const MOTION_VOCABULARY_GUIDE = `', to: '`;' } },
      { label: '이 파일이 생긴 이유 — 헤더 주석 전문', anchor: { file: 'src/lib/writer/motion-vocabulary.ts', from: '// ─ 왜 이 파일이 생겼나', keepFrom: true, to: '// ── 어휘 (정본)' } },
    ],
    why: [
      {
        what: '모델의 판단은 맞았고, 고장은 전달 경로에 있었다',
        why: '손동작·시선·감정 3쌍(대상이 프레임 안 vs 밖)을 제품 경로에 통과시킨 실험에서 <b>모델의 판단은 6/6 정확했다</b>. 프레임 안이면 고정, 밖이면 이동을 골랐고 이유도 맞았다. 그런데 결과가 틀렸다.',
        src: 'src/lib/writer/motion-vocabulary.ts 헤더 (camera-follow-disambiguation, 2026-08-11)',
      },
      {
        what: '지시서의 어휘 목록이 말줄임표로 잘려 있었다',
        why: '카메라 유형 9종 중 3종만 보여주고 말줄임표로 끝나 있었다. 말줄임표가 리터럴이다 — 모델은 어휘를 어긴 게 아니라 모른 채 그럴듯한 값을 지어낼 수밖에 없었다.',
        src: 'src/lib/writer/motion-vocabulary.ts 헤더',
      },
      {
        what: '목록 밖 값이 네 곳에서 서로 다르게, 조용히 죽었다',
        why: '① 모션 계약문에서 회전 전용 절이 사라져 회전과 이동의 차이가 영상 모델에 전달되지 않는다 ② 6축 카메라 컨트롤이 전 축 0 으로 떨어져 글로는 "팬", 숫자로는 "가만히"를 동시에 보낸다 ③ 준수 검수에서 방향 검사가 통째로 스킵돼 이 계열 사고는 자동으로는 영영 안 잡힌다 ④ 씬 역추론이 카메라가 도는 씬을 고정으로 기록한다.',
        src: 'src/lib/writer/motion-vocabulary.ts 헤더',
      },
      {
        what: '두 스케일의 가운데 낱말이 서로 다른 것도 함정이었다',
        why: '카메라는 minimal|moderate|large, 인물은 micro|small|medium|large — 가운데가 moderate 대 medium 이다. 모델이 맞바꿔 쓰자 받는 쪽이 모르는 말로 취급해 최소값으로 떨궜고, "보통 크기 고갯짓"이 발주문에 "거의 알아볼 수 없는 미세한 움직임"으로 <b>뒤집혀</b> 나갔다. 측정 대상 케이스에서 정확히 터졌다.',
        src: 'src/lib/writer/motion-vocabulary.ts 헤더',
      },
      {
        what: '매핑 실패를 고정으로 접지 않는 이유',
        why: '미상값을 정지로 접으면 모델이 설계한 이동이 소리 없이 사라지고, 계약문이 "완전 고정"으로 바뀌어 같은 프롬프트 안의 장면 묘사와 정면으로 모순된다. 그게 고치려는 사고의 더 나쁜 버전이다.',
        src: 'src/lib/writer/motion-vocabulary.ts normalizeCameraMotionType',
      },
    ],
  },
  {
    id: 'v4-id', band: 'des', row: 1, col: 2, axis: 's', kind: 'code',
    label: '샷 id 표준화·출처 각인', sub: 'generateL4ForScene 반환부', file: `${S}/v4_shots.ts`,
    summary: '데쿠파주가 정한 샷 id 를 인덱스로 맞춰 되돌려 놓고 세 블록의 id 를 통일한다. 동시에 데쿠파주 출처 네 필드를 의도 블록에 결정론적으로 심는다 — 모델이 되읊는 값에 의존하지 않기 위해.',
    inputs: [
      { from: 'motion-vocab', fields: '정규화된 ShotDesign[]', usage: 'code' },
      { from: 'dec-index', fields: 'shot_id, operation, source_beats, shot_function, rhythm_role', usage: 'partial', note: 'camera_intent 는 이 보존 목록에 없다' },
    ],
    outputs: [
      { field: '통일된 shot_id (3블록)', status: 'live', consumers: '결정론 조립' },
      { field: 'intent.operation / source_beats / shot_function / rhythm_role', status: 'dropped', consumers: '', note: '"비트→샷 추적성"을 위해 심는다고 주석에 명시돼 있는데, 조립기가 네 필드를 하나도 읽지 않는다' },
    ],
    prompts: [{ label: '출처를 심는 코드 — 정확히 네 필드', anchor: { file: `${S}/v4_shots.ts`, from: '        // 데쿠파주 출처를 결정론적으로 보존', keepFrom: true, to: '      }),' } }],
    why: [{
      what: '출처를 모델 되읊기가 아니라 코드로 심는다',
      why: '샷이 어느 비트에서 왔는지를 모델이 다시 적어 주기를 기대하면 틀릴 수 있다. 데쿠파주 객체에서 직접 복사해 심어 추적성을 결정론적으로 보장한다 — 다만 지금은 그 추적성을 소비하는 곳이 없고, 카메라 의도는 애초에 이 목록에 없다.',
      src: `${S}/v4_shots.ts 반환부 주석 (#8)`,
    }],
  },

  // ── 검수와 조립 ─────────────────────────────────────────────────────────
  {
    id: 'assemble', band: 'chk', row: 0, col: 0, axis: 'c', kind: 'code',
    label: '결정론 조립', sub: 'assembleShotsFromDesigns', fn: 'assembleShotsFromDesigns()',
    file: `${S}/c_application_2.ts`,
    summary: '샷 설계 하나를 샷 시퀀스 항목 하나로 정확히 1:1 매핑한다. 첫 프레임 프롬프트와 모션 프롬프트가 이미 최종본이라 LLM 없이 렌더 입력이 온전히 확보된다. 표시문·에셋 목록·액션 예산·인과 링크 자리도 여기서 채운다.',
    inputs: [
      { from: 'v4-id', fields: 'ShotDesign[] 전체', usage: 'code' },
      { from: 'dec-index', fields: 'shot_id → beat_summary / beat_summary_native', usage: 'code' },
      { from: 's3', fields: 'scene.purpose, emotion_beat, location', usage: 'code' },
    ],
    outputs: [
      { field: 'first_frame_generation.composition_prompt', status: 'live', consumers: 'v5, 샷 기록, 러프 보드' },
      { field: 'video_generation.motion_prompt', status: 'live', consumers: 'v5, 모션 계약문' },
      { field: 'design_ref', status: 'live', consumers: '러프 보드 상세 스펙 조인, 샷 기록' },
      { field: 'static_spec / dynamic_spec (원본 운반)', status: 'live', consumers: '샷 기록 → Director·러프·모션 계약문' },
      { field: 'S.character_action (표시문)', status: 'live', consumers: '샷 기록, 러프 보드, 화면 표시' },
      { field: 'C.hook_type / motif_active, continuity 4필드', status: 'dropped', consumers: '', note: '스키마에는 있지만 조립이 채우지 않는다 — 검수 지시문이 "비어 있다는 사실 자체를 이슈로 삼지 마라"고 따로 못 박는다' },
      { field: 'V 블록 / C.info_disclosure / action_budget', status: 'dropped', consumers: '', note: '채워지지만 샷 기록 컬럼으로 가지 않고 읽는 코드도 없다' },
    ],
    contracts: [
      '입력 1개당 출력 정확히 1개 — 샷 소실 원천 차단',
      '표시문 소스 랭킹: 데쿠파주 모국어 요약 → 영어 요약 → 모션 프롬프트 → 극적 목적(최후)',
    ],
    prompts: [{ label: '표시문 소스 랭킹 — 코드와 주석', anchor: { file: `${S}/c_application_2.ts`, from: '  // 표시문 소스 랭킹', keepFrom: true, to: '\n\n  const characters' } }],
    why: [
      {
        what: 'LLM 조립을 제거했다',
        why: 'A/B 실측에서 렌더 소비 필드(프롬프트·길이·에셋)는 이미 샷 설계가 최종본이라 LLM 조립이 같은 값을 복사할 뿐이었고(변조 0건), LLM 만 채우던 메타 필드는 소비처가 0 이었다. 제거로 콜 1개와 60~160초를 줄였다.',
        src: `${S}/c_application_2.ts 헤더 (E12b 2026-07-21)`,
      },
      {
        what: '표시문이 추상 의도문으로 새던 자리',
        why: '25샷 중 20샷이 "충격을 안긴다"류 의도문으로 표시·생성되고 있었다. 원인이 이 자리에서 극적 목적을 바로 쓰던 것이라, 데쿠파주의 구체 액션을 1순위로 올렸다.',
        src: `${S}/c_application_2.ts (#p2-wiring W3)`,
      },
    ],
  },
  {
    id: 'c2-llm', band: 'chk', row: 0, col: 1, axis: 'c', kind: 'llm', model: 'C',
    label: '샷 검수', sub: 'c2 · runShotCheck', fn: 'runShotCheck()',
    file: `${S}/c_application_2.ts`,
    calls: '런당 1콜 · 전 샷 한 번에 · temperature 0.3 · 실패는 흡수하고 진행',
    summary: '조립된 샷 시퀀스 전체를 한 번에 읽고 액션 스코프와 의미 정합을 본다. 한 샷에 안 담기는 것은 분할안으로 돌려주고, 나머지는 이슈로 낸다. 이슈마다 "이게 화면에서 고칠 수 있는 문제인가"를 반드시 분류하게 한다.',
    inputs: [
      { from: 'assemble', fields: '조립된 샷 시퀀스 전체 (JSON 통째)', usage: 'prompt' },
      { from: 'budget-act', fields: 'sceneBudgetIssues', usage: 'code', note: '지시문에는 안 들어간다 — 리포트에 합본만 된다' },
      { from: 'v2', fields: 'worldVisual (에셋 레지스트리용)', usage: 'code', note: '프롬프트에는 안 실린다' },
      { from: 'in-cast', fields: 'characters (에셋 레지스트리용)', usage: 'code', note: '프롬프트에는 안 실린다 — 검수 모델은 장르·캐스트·세계관을 못 본 채 샷만 보고 판정한다' },
    ],
    outputs: [
      { field: 'shots_to_split[]', status: 'live', consumers: '분할 자식 조립' },
      { field: 'semantic_issues[] (시각으로 분류된 것)', status: 'live', consumers: '시각 제약 부착 → 생성 프롬프트' },
      { field: 'semantic_issues[] (글·보고 전용)', status: 'partial', consumers: '검수 리포트만', note: '생성 프롬프트를 오염시키지 않는다 — 의도된 설계' },
      { field: 'shots_to_split[].reason', status: 'dropped', consumers: '', note: '모델에게 반드시 쓰게 하면서 코드가 한 번도 읽지 않는다 — 왜 쪼갰는지가 어디에도 안 남는다' },
    ],
    outputProbes: [{ field: '분할 사유 (reason)', match: 'shots_to_split', produce: [`${S}/c_application_2.ts`] }],
    contracts: [
      '모든 이슈에 제약 대상(시각/글/보고)을 반드시 정한다',
      '대명사·철자·문법·"누가 말하는가"는 <b>절대</b> 이미지·영상 제약이 아니다',
      '유효한 시각 제약은 판독기가 화면의 어느 물체·인물·상태를 가리켜 확인할 수 있어야 한다',
      '메타 필드가 비어 있다는 사실 자체를 이슈로 만들지 마라',
      '분할안의 각 자식은 그 반쪽이 담는 구체 행동을 써라 — 부모 문장 복사 금지',
    ],
    prompts: [
      { label: '시스템 지시 — 검증 항목', anchor: { file: `${S}/c_application_2.ts`, from: '당신은 샷 시퀀스의 액션 스코프와', keepFrom: true, to: '\n\n[제약의 전달 위치' } },
      { label: '제약의 전달 위치 절', anchor: { file: `${S}/c_application_2.ts`, from: '[제약의 전달 위치', keepFrom: true, to: '`;' } },
      { label: '유저 프롬프트 + 출력 형식', anchor: { file: `${S}/c_application_2.ts`, from: '  const valUser = `', to: '`;' } },
      { label: '단일 콜을 유지하는 이유 — 코드 주석', anchor: { file: `${S}/c_application_2.ts`, from: '  // 단일 콜 (전 샷 한 번에)', keepFrom: true, to: '\n  let valResult' } },
    ],
    samples: [{
      label: '실제 산출 — 리포트 요약과 이슈 분포',
      file: '12_c2_shotCheck.json',
      pick: (j) => {
        const dist = {}
        for (const i of j.issues ?? []) {
          const k = `${i.category}/${i.severity}`
          dist[k] = (dist[k] ?? 0) + 1
        }
        return {
          요약: { passed: j.passed, 이슈수: (j.issues ?? []).length, 분할: j.shots_split_count, 액션위반수정: j.total_action_violations_fixed },
          분포: dist,
          표본: (j.issues ?? []).slice(0, 2),
        }
      },
    }],
    why: [
      {
        what: '씬 단위로 쪼개는 것을 실험했다가 걷어냈다',
        why: '프롬프트를 한 글자도 안 바꿔도 컨텍스트를 씬으로 자르면 모델의 판정 분포가 바뀐다 — 벽시계 +70%(153.6→261.3초), 이슈 3배(57→170), 연속성 이슈 7.5배(13→97). 그 경고가 시각 제약으로 생성 프롬프트에 주입되므로 품질까지 함께 나빠진다. "규칙이 씬 로컬이면 절단도 중립"은 규칙의 성질이지 모델 출력의 성질이 아니었다.',
        src: `${S}/c_application_2.ts (#shotcheck-fanout 기각, 2026-08-10)`,
      },
      {
        what: '출력 다이어트도 기각됐다',
        why: '분할안을 델타 전용으로 좁혀 봤으나 벽시계 −2.2%(기준 30%)에 그쳤다. 실측상 분할안은 출력의 23~24%뿐이고 나머지 76%가 이슈였으며, 델타 스키마는 오히려 분할 페이로드를 20% 키웠다. 줄일 대상은 분할안이 아니라 이슈 쪽이다.',
        src: `${S}/c_application_2.ts (#output-diet 2026-08-10)`,
      },
      {
        what: '글 문제가 그림 지시로 새어 나갔다',
        why: '실험에서 대명사 같은 글 전용 지적이 이미지 프롬프트로 흘러나왔다. 그래서 명시적으로 시각이라고 분류된 이슈만 생성 모델에 전달한다 — 분류가 없으면 닫는 쪽으로.',
        src: `${S}/c_application_2.ts attachCheckNotes`,
      },
      {
        what: '검수 착수 전에 남은 예산을 잰다',
        why: '이 단계는 시간 예산을 모르는 단일 콜이다(실측 87~154초, 관측 최대 278초). 예산 끝에 착수했다가 함수 수명에 잘리면 방금 만든 샷 설계 수백 초가 통째로 사라지고 다음 인보케이션이 같은 유료 호출을 반복한다. 못 끝낼 것 같으면 <b>착수하지 않고</b> 양보한다.',
        src: `${P}/steps.ts (#shotcheck-gate 2026-08-11)`,
      },
    ],
  },
  {
    id: 'c2-split', band: 'chk', row: 0, col: 2, axis: 'c', kind: 'code',
    label: '분할 자식 조립', sub: 'buildSplitChildren', fn: 'buildSplitChildren()',
    file: `${S}/c_application_2.ts`,
    summary: '검수가 돌려준 분할안을 부모 샷 위에 델타로 병합해 자식 샷을 만든다. 첫 자식만 부모의 설계 참조와 정적·동적 스펙을 물려받고, 둘째부터는 일부러 안 물려받는다.',
    inputs: [{ from: 'c2-llm', fields: 'shots_to_split[].new_shots', usage: 'code' }],
    outputs: [{ field: '자식 샷들 (분할 출처 태그 포함)', status: 'live', consumers: '시각 제약 부착, 리넘버' }],
    contracts: [
      '누락 블록은 부모에서 결정론 상속 — 스키마 보장',
      '설계 참조·정적·동적 스펙은 <b>첫 자식만</b> 상속',
      '출처 필드는 시스템 소유 — 모델이 복사해 와도 무시',
    ],
    prompts: [{ label: '왜 첫 자식만 상속하는가 — 코드 주석', anchor: { file: `${S}/c_application_2.ts`, from: '/**\n * 분할안(new_shots) → 자식 샷 조립.', keepFrom: true, to: 'export function buildSplitChildren' } }],
    why: [
      {
        what: '형제 자식이 같은 그림을 두 번 그렸다',
        why: '부모의 첫 프레임 스펙은 보통 첫 자식의 시작 순간이다. 나머지 자식이 같은 스펙을 공유하면 러프가 같은 그림을 두 번 그린다(실측). 둘째부터는 자기 액션 텍스트 기반으로 가게 해 차별화를 구조로 보장했다.',
        src: `${S}/c_application_2.ts (#p2-split-siblings 2026-08-05)`,
      },
      {
        what: '모델이 출처 필드를 되읊어 방어를 우회했다',
        why: '실측에서 한 모델이 설계 참조를 그대로 에코해 위 방어를 우회했고 형제 중복이 재발했다. 그래서 출처는 시스템 소유 필드로 못 박고 모델 값을 무시한다.',
        src: `${S}/c_application_2.ts buildSplitChildren`,
      },
      {
        what: '분할안이 필수 블록을 빼먹어 DB 기록이 죽었다',
        why: '분할안이 씬 블록을 빼먹는 경우가 실측됐고, DB 기록이 그 자리에서 죽었다. 누락 블록을 부모에서 상속해 스키마를 보장한다.',
        src: `${S}/c_application_2.ts (#long-writer-run)`,
      },
    ],
  },
  {
    id: 'c2-notes', band: 'chk', row: 0, col: 3, axis: 'c', kind: 'code',
    label: '시각 제약 부착', sub: 'attachCheckNotes', fn: 'attachCheckNotes()',
    file: `${S}/c_application_2.ts`,
    summary: '검수 이슈 중 시각으로 분류되고 제약 문장이 있는 것만 해당 샷에 붙인다. 정보 등급은 제외하고, 매칭은 리넘버 전 id 공간에서 한다. 검수 결과가 실제로 화면에 닿는 유일한 통로다.',
    inputs: [{ from: 'c2-llm', fields: 'semantic_issues[]', usage: 'code' }],
    outputs: [{ field: 'shot.check_notes[]', status: 'live', consumers: '샷 기록 → 생성 프롬프트 주입' }],
    contracts: [
      '시각으로 명시 분류된 이슈만 통과 (분류가 없으면 닫는다)',
      '정보 등급 이슈는 붙이지 않는다',
      '분할 부모의 액션 예산 이슈는 자식에게 상속하지 않는다 — 분할 자체가 그 이슈의 수정이므로',
    ],
    prompts: [{ label: '부착 규칙 — 코드 주석', anchor: { file: `${S}/c_application_2.ts`, from: '/**\n * shotCheck 채널1', keepFrom: true, to: 'export function attachCheckNotes' } }],
    why: [{
      what: '"둘 중 하나만" 제약이 두 자식 모두에 주입됐다',
      why: '분할 부모의 액션 예산 이슈를 자식이 모두 물려받으니 같은 그림을 두 번 그리게 하는 제약이 됐다. 그 범주만 상속에서 뺐고 연속성 등은 유지한다.',
      src: `${S}/c_application_2.ts (F1 #p2-split-siblings)`,
    }],
  },
  {
    id: 'c2-renumber', band: 'chk', row: 1, col: 0, axis: 'c', kind: 'code',
    label: '리넘버와 조인 키', sub: 'runShotCheck Step 3', file: `${S}/c_application_2.ts`,
    summary: '최종 샷 순번을 다시 매기고, 리넘버 전 id 를 별도 필드로 영속화한다. 이슈의 위치 표기도 최종 id 로 다시 쓰고, 인접 샷 인과 링크를 순서 기반으로 계산한다.',
    inputs: [{ from: 'c2-notes', fields: '제약이 붙은 샷들', usage: 'code' }],
    outputs: [
      { field: 'shot_id (최종 순번)', status: 'live', consumers: 'v5, 샷 기록, 화면 전체' },
      { field: 'source_shot_id (리넘버 전 id)', status: 'live', consumers: '대사 트랙 조인 키', note: '대사는 데쿠파주 id 공간에 있어 최종 id 로는 못 붙인다' },
      { field: 'C.causal_link', status: 'dropped', consumers: '', note: '매 런 재계산하지만 읽는 코드가 없다' },
    ],
    why: [{
      what: '불변 id 대신 리넘버 + 설계 참조 되붙이기로 버틴다',
      why: '조립기가 순번을 다시 매기고 설계 참조를 나중에 붙이는 구조인데, 참조가 빈 분할 자식이 옆 샷의 설계를 훔친 사고가 같은 뿌리에서 재발했다. 불변 id 완전 이행은 샷 삽입·삭제 편집 기능이 커질 때로 미뤄 두고, 지금은 되붙이기 유지로 합의돼 있다.',
      src: `${S}/c_application_2.ts Step 3 · vault 2026-08-11 (미결)`,
    }],
  },
  {
    id: 'asset-norm', band: 'chk', row: 1, col: 1, axis: 'c', kind: 'code',
    label: '에셋 참조 정규화', sub: 'normalizeShotSequenceAssetRefs', fn: 'buildAssetRegistry() + normalize…()',
    file: `${P}/util/asset_refs.ts`,
    summary: '모델이 발명했거나 버전 접미사가 붙은 에셋 참조를 실재하는 정규 id 로 강제한다. 해결이 안 되면 참조를 버리고 이슈로 남긴다.',
    inputs: [
      { from: 'c2-renumber', fields: '샷들의 assets / base_assets', usage: 'code' },
      { from: 'in-cast', fields: 'characters (레지스트리)', usage: 'code' },
      { from: 'v2', fields: 'worldVisual.locations (레지스트리)', usage: 'code' },
      { from: 's3', fields: 'scene_id → location 매핑', usage: 'code' },
    ],
    outputs: [
      { field: '정규화된 assets / base_assets', status: 'live', consumers: 'v5 참조 에셋, 샷 기록' },
      { field: 'assetNorm.issues[]', status: 'flag', consumers: '검수 리포트', note: '"캐릭터 참조 전멸" 경고에 제약이 안 붙어 생성 프롬프트로 전달되지 않는다 — 캐릭터 에셋 없이 그려질 샷이라는 사실을 정작 그리는 쪽이 모른다' },
    ],
    contracts: ['하류에는 실재하는 에셋 id 만 도달하게 보장 — 미해결은 버리고 이슈로'],
  },
  {
    id: 'ladder', band: 'chk', row: 1, col: 2, axis: 'c', kind: 'check',
    label: '사이즈 급전환 검출', sub: 'detectLadderJumpIssues', fn: 'detectLadderJumpIssues()',
    file: `${S}/c_application_2.ts`,
    summary: '같은 씬 인접 샷의 사이즈 사다리 점프가 3단계 이상이면 경고를 낸다. 인서트 문법(급접근 후 즉시 원 사이즈 복귀)은 동기 있는 점프라 면제한다.',
    inputs: [{ from: 'asset-norm', fields: '최종 샷들의 카메라 타입', usage: 'code' }],
    outputs: [{ field: 'cinematography 경고', status: 'partial', consumers: '검수 리포트만', note: '제약을 달지 않아 생성 프롬프트에 주입되지 않는다 — 의도된 설계' }],
    contracts: ['씬 경계 전환은 정상 — 검사 대상 아님', '비거리형(OTS/POV/2S)은 중간값으로 취급'],
    prompts: [{ label: '검출 규칙 — 코드 주석', anchor: { file: `${S}/c_application_2.ts`, from: '/**\n * 급전환 결정론 검출', keepFrom: true, to: 'export function detectLadderJumpIssues' } }],
    why: [{
      what: '일부러 리포트 전용으로 만들었다',
      why: '급전환은 설계 사실이라 생성 프롬프트로는 못 고친다. 제약을 달면 그림에만 부담을 주므로 사람 채널과 후속 튜닝의 계측 소스로만 남겼다.',
      src: `${S}/c_application_2.ts (#p2-pacing T3)`,
    }],
  },
  {
    id: 'report', band: 'chk', row: 1, col: 3, axis: 'c', kind: 'code',
    label: '검수 리포트', sub: 'ShotCheckReport', file: `${S}/c_application_2.ts`,
    summary: '네 갈래 이슈를 한 배열로 합친다 — 씬 액션 예산, 검수 의미 이슈, 에셋 정규화, 사이즈 급전환. 치명 이슈가 하나라도 있으면 통과 판정이 내려간다.',
    inputs: [
      { from: 'budget-act', fields: 'sceneBudgetIssues', usage: 'code' },
      { from: 'c2-llm', fields: 'semantic_issues (위치는 최종 id 로 재표기)', usage: 'code' },
      { from: 'asset-norm', fields: 'assetNorm.issues', usage: 'code' },
      { from: 'ladder', fields: 'ladderIssues', usage: 'code' },
    ],
    outputs: [
      { field: 'issues[] (전 갈래 합본)', status: 'dropped', consumers: '', note: '런 상태와 로컬 스테이지 파일에만 남는다 — 내보내기도 이 리포트를 투사하지 않는다' },
      { field: 'passed (치명 이슈 유무)', status: 'flag', consumers: '', note: '게이트로 쓰이지 않는다 — 치명 이슈가 나와도 파이프라인은 그대로 다음 단계로 간다' },
      { field: 'total_action_violations_fixed', status: 'partial', consumers: '진행 마커', note: '모델이 요청한 분할 수를 세므로 대상을 못 찾아 건너뛴 요청까지 포함된다 — 실제 적용 수와 어긋날 수 있다' },
    ],
    why: [{
      what: '검수 결과가 화면에 닿는 유일한 통로는 시각 제약뿐이다',
      why: '제약은 이미 앞 단계에서 샷에 붙어 나갔고 리포트 본체는 뒤에 남는다. 그래서 씬 단위 판정(액션 예산·촬영계획 위반)은 리포트까지 배달되지만 그 뒤로 갈 경로 자체가 없다 — 사람이 열어 보지 않으면 아무 일도 일어나지 않는다.',
      src: `${S}/c_application_2.ts 리포트 조립 · ${P}/steps.ts`,
    }],
  },

  // ── 착지와 하류 ─────────────────────────────────────────────────────────
  {
    id: 'v5', band: 'land', row: 0, col: 0, axis: 'v', kind: 'llm', model: 'V',
    label: '렌더 프롬프트 정리', sub: 'v5 · runRenderPrompts', fn: 'runRenderPrompts()',
    file: `${S}/v5_prompts.ts`,
    calls: '샷당 0콜 (추출 성공 시) · 빠진 샷만 LLM 폴백',
    summary: '샷마다 이미지 프롬프트와 영상 프롬프트를 뽑아 화면비·해상도·fps·참조 에셋과 함께 한 묶음으로 정리한다. 값이 이미 있으면 그대로 꺼내 쓰고, 없을 때만 모델을 부른다.',
    inputs: [
      { from: 'report', fields: 'shotSequence.shots', usage: 'code' },
      { from: 'v0', fields: 'format.aspect_ratio / resolution / fps', usage: 'code' },
      { from: 'v2', fields: 'global_palette, color_meaning', usage: 'fallback', note: '폴백 지시문에만 실린다' },
    ],
    outputs: [
      { field: 'shots[].t2i.prompt / ti2v.motion_prompt', status: 'partial', consumers: '로컬 파일 → 이미지·영상 생성 라우트, 내보내기', note: '샷 기록은 이 값을 안 받는다 — 같은 값을 저장 단계가 따로 파생한다' },
      { field: 't2i.width / height, ti2v.fps, ti2v.camera_movement', status: 'dropped', consumers: '', note: '카메라 무빙 요약은 세 갈래 추출 로직까지 갖췄는데 읽는 코드가 없다' },
      { field: 'l0_meta / extraction_summary', status: 'dropped', consumers: '', note: '진단용으로 만들지만 소비처가 없다' },
    ],
    contracts: [
      '추출 우선순위 — 조립 출력 → 샷 설계 원본 → 씬 요약 조합',
      '폴백 프롬프트도 영어 고정 · 첫 프레임은 정적 묘사만 · 첫 프레임을 부정하지 마라',
    ],
    prompts: [
      { label: 'T2I 폴백 지시 (없을 때만 도는 경로)', anchor: { file: `${S}/v5_prompts.ts`, from: '당신은 T2I (Text-to-Image) 프롬프트 디자이너이다.', keepFrom: true, to: '`;' } },
      { label: '추출 우선순위 — 코드', anchor: { file: `${S}/v5_prompts.ts`, from: 'function extractT2IPrompt', keepFrom: true, to: '\nfunction extractTI2VPrompt' } },
    ],
    samples: [{
      label: '실제 산출 — 샷 하나 + 이 단계가 실제로 한 일',
      file: '14_v5_renderPrompts.json',
      pick: (j, ctx) => ({
        샷: (j.shots ?? []).find((s) => s.shot_id === ctx.finalShotId) ?? j.shots?.[0],
        추출요약: j.extraction_summary,
      }),
    }],
    why: [{
      what: '실제로는 거의 순수 통과 구간이다',
      why: '샷 설계가 첫 프레임·모션 프롬프트를 이미 최종본으로 내므로 추출이 항상 성공한다. 폴백이 발동하려면 샷 설계가 20자/5자 미만의 프롬프트를 냈어야 한다. 결과적으로 이 단계는 스텝 하나를 소비하면서 모델 호출은 0인 재포장이다.',
      src: `${S}/v5_prompts.ts 추출 사다리 · 실측 런의 추출 요약`,
    }],
  },
  {
    id: 'persist-shots', band: 'land', row: 0, col: 1, axis: 'x', kind: 'persist',
    label: '샷 DB 기록', sub: 'persistShotsToDb', fn: 'persistShotsToDb()',
    file: `${P}/util/persist_manifest.ts`,
    summary: '샷 시퀀스를 샷 테이블로 내려보낸다. 생성 프롬프트, 정적·동적 스펙 원본, 설계 참조, 검수 제약, 길이, 대사 줄이 여기서 컬럼이 된다. 사람이 편집한 칸은 덮지 않고 이어받는다.',
    inputs: [
      { from: 'report', fields: 'shotSequence 전체', usage: 'code' },
      { from: 'c2-renumber', fields: 'source_shot_id (대사 조인 키)', usage: 'code' },
    ],
    outputs: [
      { field: 'prompt / static_spec / dynamic_spec / design_ref / check_notes / duration_seconds / dialogue_lines', status: 'db-only', consumers: 'Director · 러프 보드 · 모션 계약문 · 6축 카메라' },
      { field: 'scenes.estimated_duration_seconds', status: 'db-only', consumers: '화면 표시', note: '샷 길이 합으로 씬 길이를 수렴시킨다' },
      { field: 'renderPrompts (t2i/ti2v 묶음)', status: 'dropped', consumers: '', note: '이 함수는 v5 산출물을 인자로 받지도 않는다' },
      { field: '이어받기 목록 밖의 생성물 컬럼', status: 'flag', consumers: '', note: '샷 행을 통째 삭제 후 재삽입하는데 이어받기 목록에 영상·스토리보드 이미지 컬럼이 없다 — 재실행 한 번에 사라진다' },
    ],
    checks: [{ label: '이어받기 컬럼 목록', file: `${P}/util/persist_manifest.ts`, re: /SHOT_USER_CARRY_FORWARD_COLUMNS = \[([\s\S]*?)\] as const/ }],
    contracts: [
      '사람이 편집한 컬럼은 이어받는다 — 카메라 설정·조명·캔버스 위치·속도·트림·로케이션',
      '샷 길이는 상한으로 클램프한 뒤 기록하고, 씬 길이 합산도 같은 클램프 값을 쓴다',
      '실패는 최대 3회 재시도 — 그래도 안 되면 런은 완료시키되 미기록을 로그로 남긴다',
    ],
    why: [{
      what: '독립 단계로 승격됐다',
      why: '내부의 다국어 파생 배치가 76샷 기준 40~60초 걸려, 렌더 프롬프트 꼬리에 붙어 있으면 함수 수명 끝자락에서 잘리거나 실패해도 지나쳐 샷 0행으로 끝났다(실측 2회). 자체 예산과 재시도를 가진 단계로 분리했다.',
      src: `${P}/steps.ts (#persist-step 2026-07-15)`,
    }],
  },
  {
    id: 'rough', band: 'land', row: 0, col: 2, axis: 'x', kind: 'down',
    label: '러프 스토리보드', sub: 'rough-storyboard*.ts', file: 'src/lib/writer/rough-storyboard{,-llm,-grid}.ts',
    summary: '샷의 정적 스펙과 표시문을 읽어 러프 보드 그림을 만든다. 단일 스트립 경로와 일괄 그리드 경로가 두 벌로 존재한다.',
    inputs: [{ from: 'persist-shots', fields: 'static_spec, prompt, design_ref, check_notes', usage: 'code' }],
    outputs: [{ field: '러프 보드 이미지', status: 'db-only', consumers: 'Director 화면' }],
    why: [{
      what: '같은 일을 하는 경로가 두 벌이다',
      why: '실사 리페인트에 단일과 일괄 두 경로가 있고, 텍스트를 한 글자도 안 보내는 일괄 경로가 Director 첫 진입 시 자동 실행된다. 어느 쪽을 표준으로 삼을지가 아직 열린 결정이다.',
      src: 'vault 2026-08-11 (미결) · use-writer-director-sync.ts',
    }],
  },
  {
    id: 'sixaxis', band: 'land', row: 0, col: 3, axis: 'x', kind: 'down',
    label: '6축 카메라 컨트롤', sub: 'shot-config-from-design.ts', file: 'src/lib/writer/shot-config-from-design.ts',
    summary: '동적 스펙의 카메라 모션을 6축 숫자 컨트롤로 옮긴다. 어휘 밖 유형이 오면 전 축이 0 이 되던 자리라, 모션 어휘 교정의 주요 소비처다.',
    inputs: [{ from: 'persist-shots', fields: 'dynamic_spec.camera_motion', usage: 'code' }],
    outputs: [{ field: 'camera_config 6축', status: 'db-only', consumers: 'Director 카메라 편집' }],
  },
  {
    id: 'motion-contract', band: 'land', row: 0, col: 4, axis: 'x', kind: 'down',
    label: '모션 계약문', sub: 'director/motion-contract.ts', file: 'src/lib/director/motion-contract.ts',
    summary: '동적 스펙을 영상 모델이 읽을 계약 문장으로 푼다. 카메라 유형별 전용 절(회전은 이동하지 않는다 등)과 시선 아크가 여기서 문장이 된다.',
    inputs: [{ from: 'persist-shots', fields: 'dynamic_spec (camera_motion, character_motion, gaze_arc)', usage: 'code' }],
    outputs: [{ field: '영상 생성 계약문', status: 'db-only', consumers: '영상 생성 요청' }],
  },
  {
    id: 'v6', band: 'land', row: 1, col: 0, axis: 'v', kind: 'orphan',
    label: '샷 이미지 생성', sub: 'v6 · runShotImages', fn: 'runShotImages()',
    file: `${S}/v6_images.ts · api/writer/generate/images`,
    summary: '렌더 프롬프트 묶음을 받아 첫 프레임 이미지를 생성하는 단계. 라우트는 살아 있고 소유자 인증도 걸려 있지만, 입력을 로컬 파일에서만 읽는다.',
    inputs: [{ from: 'v5', fields: '렌더 프롬프트 스테이지 파일 (로컬)', usage: 'fallback', note: '배포 환경에서는 파일 시스템이 꺼져 있어 항상 비어 온다' }],
    outputs: [{ field: '이미지 결과', status: 'dropped', consumers: '', note: '프로덕션에서는 도달 불가' }],
    checks: [{ label: '로거가 꺼지는 조건', file: 'src/lib/writer/logger/index.ts', re: /let fsDisabled = (Boolean\(process\.env\.\w+\))/ }],
    why: [{
      what: '프로덕션에서는 구조적으로 도달할 수 없다',
      why: '로거는 배포 환경에서 파일 쓰기·읽기를 아예 끈다(읽기 전용 파일 시스템). 그래서 이 라우트의 스테이지 불러오기가 항상 비어 돌아오고, 요청은 "파이프라인이 여기까지 완료되어야 함" 오류로 끝난다. 로컬 실행에서만 동작하는 경로다.',
      src: 'src/lib/writer/logger/index.ts · src/app/api/writer/generate/images/route.ts',
    }],
  },
  {
    id: 'v7', band: 'land', row: 1, col: 1, axis: 'v', kind: 'orphan',
    label: '샷 영상 생성', sub: 'v7 · runShotVideos', fn: 'runShotVideos()',
    file: `${S}/v7_videos.ts · api/writer/generate/videos`,
    summary: '첫 프레임과 모션 프롬프트로 클립을 생성하는 단계. 이미지 단계와 같은 이유로 프로덕션 경로가 끊겨 있다.',
    inputs: [{ from: 'v6', fields: '이미지 결과 + 렌더 프롬프트 (로컬)', usage: 'fallback' }],
    outputs: [{ field: '영상 결과', status: 'dropped', consumers: '', note: '프로덕션에서는 도달 불가' }],
  },
]

// 체인은 실제 런에서 값을 떠 온다 — 여기엔 "무엇을 보여줄지"와 해석만.
export const CHAIN = [
  { stage: 's3 · 씬', name: '씬 하나가 도착한다', what: '비트 배열이 곧 샷의 원재료', ref: 'scene',
    say: '샷 층이 받는 원재료. 여기서 <b>비트 인덱스</b>가 정해지고, 이후 모든 단계가 이 번호로 샷의 출처를 가리킨다. 시간대와 날씨도 여기 있지만 바로 다음 단계인 촬영계획에는 실려 가지 않는다.' },
  { stage: 'v3 · 씬 촬영계획', name: '이 씬을 어떻게 찍을지 정한다', what: '목표 샷 수 · 평균 초 · 조명 아크', ref: 'v3',
    say: '커버리지 패턴·렌즈·마운트·에너지를 정하고 조명을 켈빈으로 잡는다. <b>씬이 밤인지 낮인지 모르는 채</b> 정해지는 값이다.' },
  { stage: '데쿠파주 · 감독', name: '비트를 샷으로 분해한다', what: '추가 · 병합 · 파생', ref: 'dec',
    say: '개수가 같아도 <b>대응이 1:1 이 아니다</b>. 없던 설정샷이 앞에 붙고, 여러 비트가 하나의 샷으로 병합된다. 리듬 역할도 함께 배분된다.' },
  { stage: 'v4 · 샷 설계', name: '3분할 스펙을 붙인다', what: '의도 · 정적 · 동적', ref: 'v4',
    say: '감독이 정한 사이즈·길이·카메라 의도를 받고 렌즈·심도·프레이밍·조명을 채운다. <b>첫 프레임 프롬프트와 모션 프롬프트가 여기서 최종본으로 확정된다</b> — 이후 아무도 다시 쓰지 않는다.',
    delta: '출처 4필드가 의도 블록에 심긴다 → 바로 다음 단계가 하나도 안 읽는다. 카메라 의도는 애초에 보존 목록에 없다.' },
  { stage: 'c2 · 조립과 검수', name: '샷이 최종 번호를 받는다', what: '리넘버 + 설계 참조 되붙이기', ref: 'seq',
    say: '결정론 조립이 1:1 로 옮기고, 검수가 다른 샷들을 쪼개면서 번호가 밀린다. 설계 id 는 참조 필드로 되붙이고 대사 조인용으로 리넘버 전 id 도 따로 남긴다.',
    delta: '정적·동적 스펙 안쪽의 샷 id 는 옛 값 그대로 남는다 — 바깥 id 만 바뀐다.' },
  { stage: 'c2 · 리포트', name: '이슈가 쌓인다', what: '치명이 있어도 멈추지 않는다', ref: 'check',
    say: '화면에서 고칠 수 있다고 분류된 것만 제약으로 샷에 붙어 나가고, 나머지는 리포트에 남아 아무 데로도 가지 않는다.' },
  { stage: 'v5 · 렌더 프롬프트', name: '그대로 통과한다', what: '추출만 하고 모델은 안 부른다', ref: 'v5',
    say: '샷 설계가 이미 최종 프롬프트를 냈으므로 이 단계는 꺼내 담기만 한다. 화면비·해상도·fps 를 붙이고 참조 에셋을 모은다.' },
]
