# 파이프라인 컨텐츠 공백 & AI 한계 기반 타협점

> 작성일: 2026-04-20
> 범위: **코드 결함 제외**. 결과물 컨텐츠 퀄리티 / 영상 제작 개념 단위 누락 / AI 모델 한계 기반 타협
> 근거 데이터: `experiment/svc-pipeline/logs/2026-04-19_1hour_gravity_full_c656/` (354샷 / 3494초 / 45씬)
> 연관 문서: `pipeline_diagrams.md`, `linear_pipeline.md`, `cliche_framework.md`, `sound_ideation.md`, `user_input_scenarios.md`

---

## 0. 이 문서의 목적

현 파이프라인은 "**1시간 분량 스토리보드 JSON**"을 안정적으로 산출한다. 서사 밀도(샷당 디테일, 모티프 추적, CDQ 일관성)는 프로급이지만, **영화 전체로서의 리듬/서브텍스트/사운드/편집 감각은 부재**하다. 동시에 AI 영상 생성 모델의 구조적 한계 때문에 **포기하거나 우회해야 할 영역**이 명확하다. 이 두 축을 정리한다.

코드 레벨 결함(동시성/스키마 드리프트/타입)은 본 문서 범위 밖. 별도 이슈 트래커에서 처리 예정.

---

## 1. 결과물 컨텐츠 퀄리티 진단

### 1.1 정량 지표 (flagship run 기준)

| 지표 | 값 | 평가 |
|-----|---|-----|
| 총 샷 | 354 | ✅ 1시간 타겟 적정 |
| 총 duration | 3,494s / 3,600s | ✅ 97.1% |
| 씬 커버리지 | 45/45 | ✅ 완벽 |
| shot_id 유니크 | 354/354 | ✅ 완벽 |
| 평균 샷 길이 | 9.87s (σ=2.37) | ✅ 5~15s 중앙 |
| 카메라 타입 다양성 | 46종 | 🟡 MS 31% 편중 |
| 카메라 앵글 다양성 | 41종 | 🟡 eye_level 31% 편중 |
| 조명 색온도 다양성 | 43종 | ✅ 고른 분포 |
| 캐릭터 아크 다양성 | 6/8종 | ✅ 평면 방지 |
| 로케이션 활용률 | 28/37 (73%) | 🟡 27% 미사용 |
| 대화 보유 샷 | 43/354 (12.1%) | 🔴 드라마치곤 과소 |
| 대화 씬 vs 무언 씬 | 24 : 21 | 🟡 의도 불명확 |
| scene_transitions 명시 | 45 | ✅ 씬당 1개 |
| carry_forward_from 연결 | 184/354 (52%) | 🟡 절반만 인과 이음 |
| CDQ clarity | 0.88 | ✅ 상급 |

### 1.2 정성 — 현재 잘하는 것

| 요소 | 근거 예시 |
|-----|---------|
| **모티프 추적** | 계단 5단계 진화(물리→선택→관계→시간→순환) 샷마다 명시 |
| **구체적 디테일** | 렌즈 35mm, 4000K, 어깨 앞굽음 2~3도, hex #6B7A8A |
| **인과 링크** | "사운드 디졸브: 번개 잔향 위로 옥상 환기구 저주파 드론이 겹치며" |
| **감정 비트** | `emotion_beat: {start, end}` 샷 단위 감정 이동 |
| **CDQ 일관성** | 중심 질문 45씬 관통, 0.88 점수 |
| **캐릭터 아크 다양성** | 6종 (testing, disillusionment, redemption 포함) |
| **주제-이미지 은유** | "계단" = 형벌 계층 구조의 시각 상징 |
| **연속성 메타** | `continuity: {carry_forward_from, consistent_elements, changes}` |

### 1.3 정성 — 결과물에서 **약하거나 없는 것**

| 요소 | 현 상태 | 문제 |
|-----|-------|------|
| **Subtext (서브텍스트)** | S2에 subtext_notes 필드 있으나 샷에 전파 0 | 대사=정보전달 수준. "말하지 않는 것"의 시각화 부재 |
| **대화 비율** | 12.1% (43/354) | SF 드라마치고 조용. 의도성 불명확 |
| **대화의 시각 리듬** | 대화 씬도 MS 위주 | shot-reverse-shot, 반응샷, 오프스크린 구분 없음 |
| **Blocking / 동선** | `scene_actions` 문장 | 공간 내 이동, 거리 변화(2m→0.5m), 프레임 내 위치 미설계 |
| **템포/리듬** | 씬당 샷 수 거의 균일(7~10) | 침묵 씬 vs 격렬 씬 컷 수 차이 없음 |
| **청각 모티프** | `sound_ideation.md` 존재, 구현 연결 0 | 음향/음악 라이트모티프 부재 |
| **POV 전환** | S1에 pov 1개 | 씬별/샷별 시점 이동 없음 |
| **미장센 층위** | 단일 composition_prompt | 전경/중경/후경, 프레임-안-프레임 분리 없음 |
| **물리적 감정 표현** | arc 개념 수준 | 버릇, 미세 표정, 긴장 기호 미지정 |
| **라이트모티프** | 시각만 | 반복 사운드/음악/대사 미설계 |
| **Signature Frame** | 모든 샷 평등 | 포스터샷/트레일러용 "이거 하나로 영화 설명" 없음 |
| **감정 곡선** | turning_point_position 1개 숫자 | 1시간 저점/고점 그래프 부재 |
| **테마의 시각 은유** | theme 텍스트만 | 개념→시각 기호 매핑 체계 없음 |
| **Transitions 종류** | `is_scene_transition: bool` | 컷/페이드/디졸브/매치컷/와이프 구분 없음 |
| **보이스 특성** | S2.voice 필드 존재 | 억양/말버릇/방언 미반영 |
| **시간 경과 서사** | time_of_day 필드 | "3주 후" 시각화 전략 없음 |
| **커버리지 샷** | 주 샷만 | 리액션/인서트/establishing 자동 생성 없음 |

### 1.4 종합

**프로급 디테일 밀도 + 아마추어급 연출 다양성**. 한 샷은 프로 감독의 메모 수준이지만, 영화 전체의 "리듬감/서브텍스트/침묵 설계"가 없다. **문학적 스토리보드 ≠ 연출된 영화**.

- 서사/시각 품질: 9/10
- 연출 다양성: 4/10
- 편집 감각: 2/10
- 사운드 통합: 0/10

---

## 2. 파이프라인이 **개념적으로 놓치는 것**

### 2.1 영상 문법 (Film Grammar)

사람 감독이 당연히 아는, 현 파이프라인에 없는 것:

| 문법 | 현 파이프라인 | 필요 |
|-----|---------|-----|
| **180° 선 규칙** | 없음 | 씬 내 샷 간 좌우 연속성 검증 |
| **30° 규칙** | 없음 | 같은 피사체 인접 샷 각도 차이 |
| **Match cut** | C.causal_link에 간혹 서술 | 의도적 매치컷 설계 레이어 |
| **Jump cut** | 우연히 발생 가능 | 의도성 vs 실수 구분 |
| **Eyeline match** | 없음 | 시선 방향 일관성 |
| **Screen direction** | 없음 | 좌→우 이동의 시각 흐름 |

### 2.2 편집 단위(Editing)

현재 "샷 = 촬영 단위"로만 취급. 편집 개념 부재:

- **샷 vs 컷**: 동일시됨. 실제 영화는 1샷이 여러 컷으로 분해 가능
- **Editing rhythm**: 씬 내 컷 길이 패턴(점점 짧아짐 = 긴장)
- **Pre-lap / L-cut**: 오디오가 먼저/나중에 들어오는 편집
- **Montage sequence**: 압축 몽타주 ("10분간 훈련" → 7샷)
- **Cross-cutting**: 평행 편집 (A 액션 ↔ B 액션)

### 2.3 Sound Design Integration

`sound_ideation.md` 문서만 있고 파이프라인 연동 0:

- 각 샷의 예상 사운드 (음악/효과음/침묵) 메타
- 음향 모티프 (문 여닫는 소리, 특정 악기)
- Sound bridge (장면 전환에 소리 연결)
- Diegetic vs non-diegetic 구분
- Score cue 위치 (음악 시작/정지점)

### 2.4 Production Value 차등

모든 샷을 동일 비용/품질로 렌더? 현실적으로 불가:

```
현재: 354 샷 × 동일 예산
필요: hero(30샷 고품질) + standard(200샷 기본) + filler(124샷 재사용/정적)
```

`shot_priority` 필드 부재. 예산 라우팅 불가.

### 2.5 알트 테이크 / 변주

- 한 샷당 1안만 생성
- "이 컷은 3가지 변주 만들어서 고르기" 개념 없음
- 감독의 현장 기본 동작 (take 1, 2, 3) 없음

### 2.6 반대 방향 가드 (Cliché Framework 연동 미구현)

`cliche_framework.md`의 7차원이 샷 생성 시 참조되지 않음:

- "이 장르에서 피하고 싶은 클리셰 리스트"
- "기시감 있는 구도/대사 감지 후 대안 제안"
- 현재 C1 `cliche_count: 2`는 숫자만. 대안 제시 없음

### 2.7 Character Identity Lock

현 샷은 `"yujin_ha"` 문자열 레퍼런스만:

- 매 샷마다 AI가 다른 얼굴 생성 → IP-Adapter 필수
- asset_version (v1, v2...) 있지만 얼굴 vs 의상 vs 소품 구분 없음
- 캐릭터 시트 생성 단계 부재 (character bible)

### 2.8 전체 구조 관점 부재

`linear_pipeline.md`의 단계별 검증은 있지만:

- **Page-to-Screen Ratio**: 대본 1페이지 ≈ 1분 매핑 검증 없음
- **Scene Economy**: 짧은 씬/긴 씬 분포 체크 없음
- **Character Screen Time**: 7명 캐릭터의 화면 시간 분배 균형 검증 없음
- **Location Economy**: 37개 중 10개 미사용 — 프로덕션 현실성 체크 없음

### 2.9 관객 경험 모델 부재

- **Viewer attention curve**: 1시간 시청자 집중력 곡선
- **Setup-Payoff tracking**: 씬 5의 소품이 씬 23에서 payoff 되는지
- **Foreshadowing check**: 결말 단서가 적절히 뿌려졌나
- **Dramatic irony**: info_asymmetry 필드 있지만 누적 설계 없음

### 2.10 Post-Production 연결 부재

- Color grading pass
- VFX compositing
- ADR (대사 재녹음)
- Foley (발소리/옷 스침)
- 최종 음향 믹스

AI 영상 출력만 있고 "프리뷰" → "편집" → "완성본" 파이프라인 없음.

---

## 3. AI 모델 한계 기반 — **타협해야 할 것**

현행 AI 영상 모델(Kling, Hunyuan, Veo, Runway, Sora 등) 구조적 한계 기반.

### 3.1 완전 포기 (Give Up)

| 요소 | 이유 | 대체 전략 |
|-----|-----|---------|
| **완벽한 continuity** | 5초 컷 지나면 얼굴/의상 드리프트 | "연속감 환상" (같은 팔레트, 공간 단서) |
| **립싱크 정확도** | 현행 AI 비디오 립싱크 약함 | 오프스크린 대사, 백뷰, 원샷 |
| **대규모 군중** | 3명+ 일관성 붕괴 | 암시(off-screen 소리), 리액션 샷 |
| **격렬한 액션** | 격투/추격 구조 무너짐 | 단일 동작 + 인서트 + 사운드 |
| **복잡한 물리 현상** | 폭발/물/유리 불안정 | 순간 포착 + 컷 |
| **정확한 카메라 제어** | "35mm" 지시해도 근사치 | 의도만 기록, 결과는 포스트 크롭 |
| **텍스트/간판** | 글자 왜곡 | 프레임 밖, 흐림, 후합성 |
| **손/손가락** | 구조 깨짐 | 손 숨김 or 인서트 최소화 |
| **10초 초과 컷** | 인물/공간 드리프트 | 모두 5~10초로 조각 |

### 3.2 부분 타협 (Reduce Ambition)

| 요소 | 현실적 수준 |
|-----|---------|
| **씬 내 일관성** | IP-Adapter로 75% 유지, 100% 불가 |
| **정교한 조명비** | "4:1" 프롬프트 → 결과 ±2단계 편차. 후공정 그레이딩 필수 |
| **의도된 POV 변화** | 지시 가능 but AI 무시 빈번. 씬 단위까지만 신뢰 |
| **시간 경과 표현** | 자막 + 의상 + 계절 명시 조합. 프롬프트만으론 약함 |
| **감정 미세 표정** | "slight smile" 가능. "hesitant smile with guilt" 불안정 |
| **특정 장소 재현** | 실제 건물 → 장소성만. 랜드마크 명시 지양 |

### 3.3 완전 후공정 위임 (Post Only)

| 요소 | 이유 |
|-----|-----|
| **Color grading 정밀** | AI 출력은 대강의 톤. DaVinci로 LUT/커브 |
| **VFX 합성** | 타이포, 인포그래픽, UI 화면 — AE로 별도 |
| **사운드 전체** | BGM, SFX, 대사 분리 생성 → 믹스 |
| **Rhythm editing** | 컷 타이밍은 최종 편집자 판단 |
| **안정화/디노이징** | AI 생성 noise/flicker는 포스트 클린업 |

### 3.4 우회 전략 (Creative Workaround)

한계를 **서사적 자원**으로 전환:

- **짧은 컷 중심 편집** → "세련된 리듬"으로 포지셔닝
- **정적 샷 위주** → "관조적 톤", "예술영화 느낌"
- **대화 적음** → "이미지 우선", "비주얼 스토리텔링"
- **얼굴 변주** → 의도적 기호 활용 (아바타, 가면, 실루엣)
- **완벽한 공간 불가** → "꿈/기억/상징 공간"으로 탈육체화
- **긴 테이크 불가** → 몽타주/컷업/점프컷 미학 차용

---

## 4. 추가 수용해야 할 개념 (스키마/파이프라인 확장안)

기존 S/V/C 틀에 끼워 넣을 새 필드/단계.

### 4.1 샷 단위 추가 필드

```ts
interface ShotExtensions {
  shot_priority: 'hero' | 'standard' | 'filler' | 'reference'
    // hero: 3회 생성 후 best pick
    // filler: 재사용 허용, 단일 생성
    // reference: 생성 없이 기존 자산 배치

  take_count: number              // 알트 생성 수 (1~5)
  signature_flag: boolean         // 포스터/예고편 후보
  rhythm_tag: 'burst' | 'sustain' | 'pause' | 'transition'

  blocking: {
    start_position: string        // "frame_left_3m_from_camera"
    end_position?: string         // 이동이 있다면
    distance_to_subject_m?: number
  }

  subtext_beat: string            // 대사와 다른 속마음
  performance_note: string        // 미세 표정/버릇/기호

  sound_cue: {
    music?: { in_out: 'in'|'out'|'continue', mood: string }
    sfx?: string[]
    diegetic?: string[]           // 공간 내 소리
    score_timing?: string         // "enters at 0:03, swells at 0:08"
  }

  transition_type: 'cut' | 'fade' | 'dissolve' | 'match_cut' | 'wipe' | 'pre_lap' | 'l_cut' | 'j_cut'

  viewer_focus: string            // 관객이 봐야 할 지점
  off_screen_elements?: string[]  // 프레임 밖 상태
}
```

### 4.2 씬 단위 추가 필드

```ts
interface SceneExtensions {
  rhythm_profile: 'accelerating' | 'sustained' | 'decaying' | 'punctuated'
  dominant_pov?: character_id
  coverage_pattern: 'master+inserts' | 'shot-reverse' | 'developing' | 'handheld_continuous' | 'montage'
  screen_time_budget: Record<character_id, number>  // 씬 내 비율
  sound_motif_active: string[]
  silence_intentional: boolean                       // 의도된 무음
  off_screen_action?: string                         // 프레임 밖 서사
}
```

### 4.3 프로젝트 단위 추가 필드

```ts
interface ProjectExtensions {
  attention_curve: Array<{ timestamp: seconds, intensity: 0-10 }>
  signature_moments: shot_id[]                       // 3~5개

  character_screen_time: Record<char_id, {
    target_percent: number
    actual_percent: number
  }>

  setup_payoff_pairs: Array<{
    setup: shot_id
    payoff: shot_id
    promise: string
  }>

  forbidden_cliche_list: string[]                    // 사전 배제
  genre_obligations: string[]                        // 장르 필수 요소

  post_production_plan: {
    color_pipeline: string
    vfx_shots: shot_id[]
    adr_lines: Array<{ shot_id, line }>
    score_cues: Array<{ timestamp, mood }>
  }
}
```

### 4.4 새 파이프라인 단계 제안

```
S3.5: Blocking & Rhythm Pass
  → scene_actions → 공간 동선 + 타이밍 구조
  → rhythm_profile 결정

L2.5: Character Identity Lock Pass
  → 캐릭터 시트 생성 (얼굴/의상/포즈 레퍼런스)
  → Identity Adapter 패스 세팅 (IP-Adapter 시드)

L3.5: Coverage Planner
  → hero/standard/filler 분배
  → 알트 테이크 스케줄링
  → 시그니처 모먼트 마킹

L4 (신규): Sound Spec
  → 각 샷의 audio placeholder
  → BGM cue 위치, 음향 모티프 연동

L5 (신규): Post-Production Plan
  → 필요한 후공정 작업 리스트
  → 수동 수정 예상 샷 태깅
  → VFX/ADR/Color pipeline 분기
```

### 4.5 새 C 검증 레이어

```
C3: Blocking Consistency (공간 연속성)
C4: Rhythm/Pacing Check (리듬 균형)
C5: Character Screen Time Balance
C6: Setup-Payoff Completeness
C7: Cliché Radar (Cliche Framework 연동, 실질 차단)
C8: Production Feasibility (AI 생성 안정성 예측)
```

---

## 5. 의사결정 체크포인트

파이프라인 방향 결정 전 확답 필요한 질문:

```
[ ] 타겟 러닝타임 SOT: D3(단편) 우선? D4(중편)? D5(장편)?
[ ] 목표 시청자: 몰입형(D5)? vs 스킴형(D3/SNS)?
[ ] 장르 우선순위: 드라마? SF? 공포? 판타지? CF/MV?
[ ] 프로덕션 단계 어디까지: 샷 시퀀스? 실영상? 편집본? 완성본?
[ ] 품질 타협 정도: "인디/실험" 허용? "커머셜" 필수?
[ ] 샷당 비용 예산: hero에 얼마, filler에 얼마?
[ ] 수동 개입 점: 어느 지점까지 자동, 어디부터 사람 손?
[ ] 차별화 포인트: 속도? 품질? 커스터마이징? RAG?
[ ] 대화 비중: 대사 중심? 이미지 중심?
[ ] 음향 책임: 파이프라인 내? 후공정?
[ ] Identity Lock 수준: 완벽 추구? "느낌만" 타협?
[ ] Signature Moments 개수: 1시간당 3개? 10개?
[ ] 알트 테이크: 허용? 모든 샷 1안?
[ ] Negative Reference: 사용자에게 "피하고 싶은 것" 요청?
```

---

## 6. 우선순위 이정표 (5단계)

현 파이프라인이 "다음 한 걸음" 올릴 수 있는 영역:

| 단계 | 작업 | 효과 | 난이도 |
|-----|-----|-----|-----|
| **1** | **페이싱/리듬 설계 레이어 (S3.5)** | 씬 템포 변화, burst/sustain/pause 패턴 | 중 |
| **2** | **Sound Spec 파이프라인 (L4)** | 시각+청각 통합, sound_ideation.md 연결 | 중 |
| **3** | **Coverage Planner** | hero/standard/filler 차등, 비용 제어 | 고 |
| **4** | **Signature Moments + 관객 경험 모델** | attention curve, setup-payoff 추적 | 고 |
| **5** | **AI 한계 수용 가이드라인 문서화** | 타협 결정 기록, 프롬프트 가이드 | 저 (문서 작업) |

**추천 경로**: 5 (문서) → 1 (페이싱) → 2 (사운드) → 3 (Coverage) → 4 (관객 모델)

---

## 7. 한 줄 종합

> 현 파이프라인은 **"한 장면을 시적으로 쓰는 능력"은 프로급**이지만, **"영화 전체를 리듬있게 편집하는 감각"이 없는 신인 감독**이다. 서브텍스트·페이싱·사운드·알트테이크·시그니처모먼트 — 이 다섯이 다음 이정표. AI 모델 한계는 포기할 것/우회할 것/후공정 위임할 것을 **명시적으로 결정**해야 설계 대화가 수렴된다.

---

## 부록 A: 관련 문서

### 본 프로젝트 내 (dev/writer_advencement/)
- `dual_axis_model.md` — S/V/C 축 이론
- `linear_pipeline.md` — 선형 구조 실무 설계
- `cliche_framework.md` — 7차원 클리셰 분류 (본 문서 §2.6 미연동 참조)
- `sound_ideation.md` — 청각 레이어 (본 문서 §2.3, §4.4 L4 대상)
- `pipeline_diagrams.md` — 구현체 모식도
- `user_input_scenarios.md` — 사용자 입력 5축 분류
- `research_vlm_limitations.md` — VLM 한계 실증
- `research_closed_world_style.md` — 스타일 참조 시스템 전수
- `research_industry_material_practice.md` — 업계 자료 번들 실태

### 근거 데이터
- `experiment/svc-pipeline/logs/2026-04-19_1hour_gravity_full_c656/12_shot_sequence.json` — 354샷 shot_sequence
- `experiment/svc-pipeline/logs/2026-04-19_1hour_gravity_full_c656/04_S2.json` — 7캐릭터 S2
- `experiment/svc-pipeline/logs/2026-04-19_1hour_gravity_full_c656/05_S3.json` — 45씬 S3
- `experiment/svc-pipeline/logs/2026-04-19_1hour_gravity_full_c656/06_C_validation_1.json` — CDQ 0.88
- `experiment/svc-pipeline/logs/2026-04-19_1hour_gravity_full_c656/09_L2.json` — 37 로케이션

### 구현 레퍼런스
- `experiment/svc-pipeline/` — 선형 자동 파이프라인
- `experiment/dual-axis/` — Mid Preview + Back Adjust 대화형

---

*본 문서는 실행 계획 아닌 문제 진단 + 설계 청사진. 다음 세션에서 우선순위 결정 후 Phase별 착수.*
