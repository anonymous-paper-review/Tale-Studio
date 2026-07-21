# narrativeStructure → scenes — 유저입력 → 프롬프트 → 결과 (실제 예시)

> 프로젝트 `2beb605c`("에일리언 2", sci-fi 스릴러, 10분물). 실 run의 LLM 호출 로그 그대로 발췌.
> 읽는 법: **사람이 넣은 입력은 맨 위에 한 번** 들어가고, 각 단계가 그걸 `프롬프트로 감싸 → LLM → 결과`로 바꾼다. 그리고 **앞 단계 결과가 다음 단계 입력에 얹힌다.** 둘 다 gemini-3-flash-preview·🔷저작.

---

## 0. 전체 흐름 한눈에

```
① 유저입력  (스토리 + 장르)                         ← 사람이 넣음
      │
      ▼
② narrativeStructure
      프롬프트 = [역할(고정)] + [ ① 유저입력 + 출력형식 ]
      │
      ▼   결과 A  =  막 3개 · 주제 · 중심질문      (추상 "이야기의 모양")
      │
      ├──────────────┐  결과 A가 그대로 다음 입력에 얹힘
      ▼              ▼
③ scenes
      프롬프트 = [역할(고정)] + [ ① 유저입력 + 결과 A + 캐스트/로케이션 + 출력형식 ]
      │
      ▼   결과 B  =  7씬 (장소·시간·인물·대사·액션)   (찍을 수 있는 "장면들")
```

핵심: **유저입력은 한 번**, 그 뒤로는 각 단계가 `프롬프트→결과`를 만들고 결과가 아래로 흐른다. narrativeStructure는 유저입력만 받고, scenes는 유저입력 + narrativeStructure 결과를 받는다.

---

## 1. ① 유저입력 (파이프라인 최초 입력 — 두 단계 공통)

**스토리** (사람이 직접 쓴 premise):
> 대기업 사무실에서 상사에게 치이며 하루를 버티는 30대 직장인. 지친 현실을 도피하듯 밤마다 서재에 앉아 초록 조명 아래 소설을 쓴다. 소재는 직장에 외계인이 숨어있다는 이야기. 글을 온라인에 올리자 누군가 꾸준히 읽고 좋아요를 누른다. … 어느 밤 불 꺼진 사무실에서 조용한 남자 동료가 자신의 소설을 읽고 있는 것을 발견하고, 그 동료는 ET처럼 생긴 본래 얼굴을 드러낸다. 주인공은 경악하면서도 흥미진진함을 느낀다.

**장르 설정** (UI에서 고른 값):
```json
{ "tone": ["스릴러"], "genre": "sci-fi", "format": "horizontal_16:9",
  "subGenre": "thriller-to-action", "depth_level": "D4", "runtime_seconds": 600 }
```

> 참고: 캐스트(char·char_2·boss_kim·dr_lee)와 로케이션(서재·사무실·병원)은 **producer 단계에서 확정된 자산**이다. narrativeStructure는 안 쓰고, scenes부터 입력에 함께 들어간다.

---

## 2. ② narrativeStructure — 이야기 뼈대 짜기

### 입력
① 유저입력(스토리 + 장르) **그것뿐.**

### 프롬프트 — 역할 (system) · 코드 verbatim (`s1_structure.ts`)
```
당신은 영상 제작의 S1(내러티브 구조) 디자이너이다.
주어진 스토리와 genre를 바탕으로 구조 유형, POV, 주제, 중심 극적 질문(CDQ)을 결정한다.

구조 유형 가이드:
- 3-act: 가장 일반적, 명확한 갈등-해소
- kishōtenketsu (기승전결): 갈등 없이 대비/전환 중심, 동아시아
- hero's journey: 영웅 여정, 12단계
- non-linear: 시간 비선형, 회상/플래시포워드
- circular: 순환 구조

CDQ (Central Dramatic Question):
- yes/no로 답할 수 있는 하나의 질문
- 1막 끝에 제기되고 클라이맥스에서 답해짐
- 5가지 속성 충족: 명확성, 개인적 stakes, 불확실성, 보편성, 긴급성

깊이 레벨 ${genre.depth_level} 권장:
- D1: 구조 없음 — 한 순간/한 비트. CDQ 생략 가능, theme 한 단어
- D2: 미니 구조 — setup → action → result 1줄씩. CDQ 약식
- D3: 단순 구조 (3-act 또는 기승전결, 서브플롯 0)
- D4: 표준 구조 + 가벼운 서브플롯 1개
- D5: 표준 구조 + 서브플롯 1~2개
- D6: 다층 구조 + 서브플롯 2~3개
- D7: 다층 구조 + 서브플롯 다수 + 에피소드 연속성 가능
```
※ `${genre.depth_level}` 은 런타임 보간 — 이 run에선 `D4`. 그 외는 전부 정적(코드와 글자 단위 동일).

### 프롬프트 — 조립된 입력 (user = 유저입력을 감싼 것)
```
[스토리]
대기업 사무실에서… (① 유저입력 그대로)

[genre]
{ "tone":["스릴러"], "genre":"sci-fi", … "depth_level":"D4", "runtime_seconds":600 }

[출력 형식 - JSON]
{ "structure_type", "acts":[{"act_id","purpose","proportion"}], "pov",
  "theme", "central_dramatic_question", "turning_point_position(0~1)" }
acts의 proportion 합은 1.0이어야 함.
```

### 결과 A  (9.8s, 1.2KB)
```json
{
  "structure_type": "3-act",
  "acts": [
    { "act_id": "Act 1: Setup",         "purpose": "주인공의 지루한 사무실 일상과 글쓰기를 통한 은밀한 도피 확립, 허구와 현실이 처음 흐려지며 마무리.", "proportion": 0.25 },
    { "act_id": "Act 2: Confrontation", "purpose": "소설 속 사건이 사무실에 나타나며 심리적 긴장 고조. 온라인 지지자 서브플롯 + 실패한 병원 방문.",      "proportion": 0.5 },
    { "act_id": "Act 3: Resolution",    "purpose": "밤에 사무실로 돌아가 진실을 찾고, 외계인 동료와 대면하며 공포→스릴로 전환.",                          "proportion": 0.25 }
  ],
  "pov": "First-person limited (주인공 시점)",
  "theme": "평범한 현실과 비범한 상상의 경계가 무너질 때 찾아오는 해방.",
  "central_dramatic_question": "주인공은 이성을 잃기 전에 자기 소설 속 외계인이 실제임을 확인할 수 있을까?",
  "turning_point_position": 0.75
}
```
→ 장소도 대사도 없다. **막 3개 + 주제 + 질문 = 이야기의 "모양"만.**

---

## 3. ③ scenes — 장면으로 쪼개기

### 입력
① 유저입력(스토리+장르) + **② 결과 A(narrativeStructure)** + producer 캐스트·로케이션.

### 프롬프트 — 역할 (system) · 코드 verbatim (`s3_scenes.ts`)
```
당신은 영상 제작의 S3(씬 브레이크다운) 디자이너이다.
주어진 S0/S1/S2 위에서 씬 단위 분해를 한다.

씬 목적 분류:
- exposition: 정보 전달 (세계/캐릭터 소개)
- conflict: 갈등 (캐릭터 간 충돌)
- decision: 결정 (캐릭터의 선택)
- revelation: 폭로/발견 (진실 공개)
- transformation: 변환 (캐릭터/상황 변화)
- transition: 전환 (다음 비트로 연결)
- setup: 셋업 (나중을 위한 심기)
- payoff: 페이오프 (이전 셋업의 결실)
- climax: 클라이맥스 (최대 긴장)
- resolution: 해소 (새 균형)

정보 비대칭 (Hitchcock):
- "audience=character": 동시 발견
- "audience>character": 드라마틱 아이러니
- "character>audience": 미스터리

각 씬에 estimated_seconds를 추정 (총합 ≈ ${genre.runtime_seconds}초).
${sceneCountHint} 권장.

act 커버리지 (필수):
- S1.acts의 모든 act_id가 최소 1개 씬의 act_ref로 등장해야 한다 (빠지는 막 금지).
- 따라서 씬 수는 최소 S1.acts 개수 이상. 권장 씬 수와 충돌하면 act 커버리지를 우선한다.
- 가능하면 각 act.proportion 비율로 씬을 분배한다 (proportion 큰 막에 더 많은 씬).
- act_ref는 S1.acts의 act_id를 그대로 쓴다.

scene_actions:
- 씬에서 일어나는 주요 액션을 텍스트로 (예: "카이가 일어선다", "편지를 펼친다", "문을 연다")
- 5초 한 샷에 한 액션이 들어가도록 분리해서 작성
- 너무 많은 액션을 한 씬에 몰지 말 것 (한 씬은 보통 1~3 액션)

오픈 캐스트 규칙 (중요):
- 위 [기존 캐스트]는 producer가 이미 확정한 인물/사물이다. 등장시킬 때 **반드시 주어진 slug 그대로**
  characters_in_scene에 쓴다 (새 slug를 만들거나 이름을 바꾸지 않는다).
- 기존 캐스트만으로 스토리를 전개할 수 있으면 새 인물을 만들지 말 것 — new_characters는 빈 배열.
- **스토리 전개상 꼭 필요한 새 인물만** new_characters에 추가하고, 그 새 slug를 등장 씬의
  characters_in_scene에도 쓴다. 새 slug는 기존 캐스트 slug와 절대 중복되지 않게 snake_case로 만든다.
- 카드(기존 캐스트)에 자리가 없는 인물을 억지로 등장시키지 말 것. 등장은 스토리가 결정한다.

오픈 로케이션 규칙 (중요 — 캐스트와 동일 원칙):
- 씬이 [기존 로케이션] 중 한 곳에서 벌어지면 scene.location에 **반드시 그 id를 글자 그대로** 쓴다
  (번역·의역·새 이름 금지. 같은 장소를 다른 이름으로 다시 만들면 배경 이미지가 이중 생성된다).
- 기존 로케이션만으로 전개 가능하면 새 장소를 만들지 말 것.
- 전개상 꼭 필요한 새 장소만 새 이름으로 쓰되, **스토리와 같은 언어**로 짧고 구체적인 장소명을 짓는다
  (스토리가 한국어면 한국어 지명 — 임의로 영어 이름을 만들지 않는다).
```
※ 보간: `${genre.runtime_seconds}`→`600`, `${sceneCountHint}`→`5~10개 씬`(D4 매핑). `[기존 캐스트]`·`[기존 로케이션]`은 system이 아니라 user 프롬프트에서 조립됨(아래).

### 프롬프트 — 조립된 입력 (user)  ★ 결과 A가 여기 통째로 들어온다
```
[스토리]
대기업 사무실에서… (① 유저입력 그대로)

[genre]
{ … "depth_level":"D4", "runtime_seconds":600 }        (① 유저입력 그대로)

[narrativeStructure]                                    ← ★ ②의 결과 A가 통째로 삽입
{ "structure_type":"3-act", "acts":[Act 1 / Act 2 / Act 3 …], "theme":…, "central_dramatic_question":… }

[기존 캐스트] (producer 확정 — slug 그대로 사용)
- char (소설 쓰는 직장인, protagonist): 30대 남성, 직장에선 풀정장…
- char_2 (주현, antagonist): 20대 남성, 본래 모습은 ET 같은 얼굴에 손가락 4개
- boss_kim (김 부장, antagonist): 신경질적인 50대 상사
- dr_lee (이 의사, supporting): 하얀 가운의 차가운 의사

[기존 로케이션] (producer 확정)
- location(심야 서재) / location_2(대기업 사무실) / 정신병원 상담실

[출력 형식 - JSON]
{ "scenes":[{ scene_id, act_ref, location, time_of_day, weather, characters_in_scene,
  purpose, emotion_beat{start,end}, dialogue_summary, key_dialogue[], info_asymmetry,
  estimated_seconds, scene_actions[] }], "total_estimated_seconds", "new_characters"[] }
```

### 결과 B  (20.1s, 5.7KB) — 7씬 요약

| 씬 | act_ref | 장소 | 시간 | 인물 | 목적 | 감정(시작→끝) | 초 |
|---|---|---|---|---|---|---|---:|
| 1 | Act 1 | 대기업 사무실 | Day | char, boss_kim | exposition | exhausted→miserable | 70 |
| 2 | Act 1 | 심야 서재 | Night | char | setup | dull→excited | 80 |
| 3 | Act 2 | 대기업 사무실 | Day | char, char_2 | conflict | suspicious→anxious | 150 |
| 4 | Act 2 | 정신병원 상담실 | Day | char, dr_lee | transformation | desperate→hopeless | 150 |
| 5 | Act 3 | 대기업 사무실 | Night | char | transition | fearful→alert | 40 |
| 6 | Act 3 | 대기업 사무실 | Night | char, char_2 | revelation | shocked→terrified | 50 |
| 7 | Act 3 | 대기업 사무실 | Night | char, char_2 | climax | terrified→thrilled | 60 |

씬 하나의 실제 내용 (scene_1 원문 — 하나가 이만큼 구체적이다):
```json
{
  "scene_id": "scene_1", "act_ref": "Act 1: Setup", "location": "location_2",
  "time_of_day": "Day", "weather": "Sunny",
  "characters_in_scene": ["char", "boss_kim"],
  "purpose": "exposition", "emotion_beat": { "start": "exhausted", "end": "miserable" },
  "dialogue_summary": "김 부장이 주인공의 기획안을 던지며 실적에 대해 소리친다.",
  "key_dialogue": [
    { "character_id": "boss_kim", "line": "자네는 이 월급 받고 부끄럽지도 않나? 정신 안 차려?", "delivery": "Screaming with anger" }
  ],
  "info_asymmetry": "audience=character", "estimated_seconds": 70,
  "scene_actions": [
    "김 부장이 서류 뭉치를 공중에 흩뿌린다",
    "주인공이 고개를 숙인 채 떨어진 종이를 줍는다",
    "사무실의 다른 직원들이 눈치를 보며 타이핑을 멈춘다"
  ]
}
```
(전체 7씬 원문: `logs/2beb605c…/05_s3_scenes.json`)

---

## 4. 결과 A vs 결과 B — 무엇이 달라졌나

| 축 | 결과 A (narrativeStructure) | 결과 B (scenes) |
|---|---|---|
| 산출 단위 | 막 3개 (추상) | 씬 7개 (구체) |
| 담긴 것 | 구조·주제·시점·중심질문 | 장소·시간·인물·대사·액션·감정·초 |
| 찍을 수 있나 | ❌ 모양일 뿐 | ✅ 씬 = 촬영 단위 |
| 받은 입력 | 유저입력만 | 유저입력 + 결과 A + 캐스트/로케이션 |
| 크기·소요 | 1.2KB · 9.8s (🌳뿌리) | 5.7KB · 20.1s (🌿가지) |

관찰:
1. **입력이 누적된다.** narrativeStructure는 유저입력만, scenes는 거기에 **앞 단계 결과 + producer 자산**까지 받는다 — 프롬프트의 `[narrativeStructure]` 블록이 그 증거(§3).
2. **추상 → 구체(zoom-in).** "Act 2: 심리적 긴장 고조" 한 줄이 → scene_3(사무실 손가락 목격) + scene_4(병원 묵살) 두 개의 찍을 수 있는 장면으로 펼쳐진다.
3. **비율은 씬 개수가 아니라 길이로.** Act 2(0.5)=300초, Act 1·3(각 0.25)=각 150초 (총 600초 = 목표 런타임). 씬 수는 2/2/3이지만 시간 비중은 정확히 25/50/25.
4. **둘 다 "저작(발명)"이다.** scenes는 결과 A를 기계적으로 전개한 게 아니라 **원본에 없던 걸 새로 지어냈다**: 김 부장 대사("자네는 이 월급 받고 부끄럽지도 않나"), 날씨(Sunny/Rainy), 구체 액션("서류 뭉치를 공중에 흩뿌린다"). → `decoupage→shotDesign`(정해진 샷을 못 바꾸고 채우기만)과 달리, `narrativeStructure→scenes`는 finer zoom에서도 **새 판단을 계속 내린다** = 둘 다 🔷저작, 차이는 파급(뿌리 vs 가지)뿐.
