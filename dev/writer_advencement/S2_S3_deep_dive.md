# S2 + S3 딥다이브: People/Action 클러스터

> 작성일: 2026-04-15
> S2(캐릭터/관계)와 S3(씬/감정/대사)의 전수 조사 + S2xS3 핍진성(verisimilitude) 분석
> V축 딥다이브(L0~L3)의 S축 대응 문서

---

## 문서 구조

```
PART 1: S2 -- 캐릭터/관계 (누가 이야기를 이끄는가)
  A. 캐릭터 아키타입 시스템
  B. 캐릭터 아크 유형
  C. 캐릭터 심리/동기
  D. 관계 다이나믹스
  E. 캐릭터 일관성 규칙

PART 2: S3 -- 씬/감정/대사 (각 순간에 무슨 일이 일어나는가)
  A. 씬 목적 분류 체계
  B. 감정 비트 패턴
  C. 대사 기능
  D. 정보 관리

PART 3: S2xS3 -- 캐릭터-씬 핍진성 (가장 중요)
  A. 캐릭터-행동 일관성
  B. 결정 논리
  C. 감정적 진정성
  D. 대사-캐릭터 적합성
  E. 씬 내 관계 다이나믹스

PART 4: 파이프라인 매핑 -- Tale Studio S2/S3 구현 설계
```

---

# PART 1: S2 -- 캐릭터/관계

> "누가" 이야기를 이끄는가. 변경 비용: 해당 캐릭터 관련 전체.

---

## A. 캐릭터 아키타입 시스템

### A.1 융(Jung) 아키타입 -- 원형 8개

캐릭터의 서사적 역할(function)을 정의. Campbell의 영웅의 여정(Hero's Journey)에서 구조화됨.

| 아키타입 | 서사 기능 | 핵심 특성 | 영상 시각화 힌트 |
|---------|----------|----------|----------------|
| **Hero** | 주인공, 변화의 주체 | 용기, 성장 의지, 결함 | 프레임 중심, 아이레벨, 리딩라인 수렴 |
| **Shadow** | 적대자, 히어로의 어두운 거울 | 히어로와 같은 욕망의 왜곡된 버전 | 로우키, 역광, 프레임 가장자리 |
| **Mentor** | 지혜/도구 제공자 | 경험, 한계, 종종 퇴장 | 안정적 구도, 소프트 라이트, 하이앵글에서 내려다봄 |
| **Trickster** | 규칙 파괴, 변화 촉매 | 유머, 예측불가, 경계 위반 | 더치앵글, 불안정 구도, 빠른 컷 |
| **Herald** | 변화 알림, 모험 시작 촉발 | 메시지 전달, 긴급성 | 갑작스런 등장, 도어웨이 프레이밍 |
| **Shapeshifter** | 충성 불명확, 관객 의심 유발 | 이중성, 매력+위험 | 그림자/빛 교차, 미러 숏, 시프팅 포커스 |
| **Threshold Guardian** | 진입 시험, 자격 검증 | 장애물, 테스트 | 블로킹(물리적 차단), 로우앵글 |
| **Ally** | 동행, 지원, 관계 반영 | 충성, 보완 능력 | 투샷, 동행 트래킹 |

### A.2 프로프(Propp) 캐릭터 기능 -- 7개

러시아 민담 100편 분석에서 도출. 기능(function) 중심이라 역할 중복 가능.

| 기능 | 서사 역할 | 현대 매핑 |
|------|----------|----------|
| **Villain** | 투쟁의 대상, 해를 끼침 | Shadow + 독립적 에이전시 |
| **Donor** | 마법 도구/지식 제공 | Mentor (제공 후 퇴장) |
| **Helper** | 히어로 과업 지원 | Ally (능동적 지원) |
| **Princess (Sought-for Person)** | 과업의 목표, 보상 | 현대: 구조 대상 → 독립적 캐릭터 |
| **Dispatcher** | 히어로에게 임무 부여 | Herald + 권위자 |
| **Hero** | 주인공, 과업 수행자 | Hero (직접 동일) |
| **False Hero** | 히어로 행세, 최종 폭로 | Shapeshifter의 극단 |

### A.3 현대 아키타입 진화

전통 아키타입의 해체와 재조합이 현대 스토리텔링의 핵심.

| 현대 유형 | 정의 | 전통 대비 변화 | 대표 사례 |
|----------|------|-------------|----------|
| **Anti-Hero** | 전통적 영웅 덕목 결여. 이기적, 비겁, 도덕적 모호 | Hero의 도덕적 확실성 제거 | Walter White, Deadpool, Kaz Brekker |
| **Reluctant Hero** | 소명 거부, 외부 압력으로 행동 | Hero의 자발성 제거 | Bilbo Baggins, Katniss Everdeen |
| **Morally Grey Protagonist** | 선/악 경계 의도적 모호 | Shadow와 Hero의 융합 | Amy Dunne (Gone Girl), Jaime Lannister |
| **Unreliable Narrator as Character** | 관객의 정보 자체를 왜곡 | Hero + Trickster 융합 | Tyler Durden, Leonard Shelby (Memento) |
| **Sympathetic Villain** | 관객이 동기에 공감하는 적대자 | Shadow의 인간화 | Thanos, Killmonger, Magneto |
| **Ensemble Protagonist** | 단일 히어로 없이 집단이 주인공 | Hero 분산 | Avengers, Ocean's Eleven, Parasite |

### A.4 아키타입의 장르별 매핑

| 장르 | 주요 아키타입 변형 | 이유 |
|------|-----------------|------|
| 호러 | 피해자 유형 분화 (Final Girl, Skeptic, Joker, Sacrifice) | 생존/죽음 패턴이 장르 기대 |
| 로맨스 | 리드 2인의 상보적 결함 (Ice Queen + Sunshine, Grumpy + Sunshine) | 관계 아크가 서사 중심 |
| 스릴러 | 불신할 수 없는 인물(Everyone is suspect) | 정보 비대칭이 장르 본질 |
| SF | 탐구자(Explorer) + 창조자(Creator)/파괴자(Destroyer) | 세계관 + 기술의 도덕적 함의 |
| 판타지 | 전통 아키타입 가장 직접 사용, 서브버전이 신선함 | 신화 구조와 직접 연결 |

### A.5 플랫 아키타입의 위험 vs 서브버전의 힘

**플랫 아키타입의 위험:**
- 예측 가능성 → 관객 이탈
- 캐릭터가 "기능"으로 전락 → 감정 투자 불가
- 현대 관객의 클리셰 인식 임계치 낮음

**서브버전 전략:**
| 전략 | 설명 | 사례 |
|------|------|------|
| 아키타입 반전 | 기대 역할의 정반대 행동 | Mentor가 배신 (한니발 렉터) |
| 아키타입 혼합 | 한 캐릭터에 2~3개 아키타입 중첩 | Hero + Shadow (Hamlet) |
| 아키타입 진화 | 서사 진행에 따라 아키타입 전환 | Villain → Ally (Zuko) |
| 장르 아키타입 위반 | 장르 기대와 불일치 | 호러의 Final Girl이 악당 (Midsommar) |

---

## B. 캐릭터 아크 유형

### B.1 분류 체계

9개 아크 유형. 각각의 필수 비트, 성공 조건, 장르 친화도.

---

#### B.1.1 긍정적 변화 아크 (Positive Change Arc)

**정의**: 약점/결함에서 출발 → 성장/극복 → 강점 획득.
**핵심 엔진**: 캐릭터가 "거짓 믿음(Lie)"을 품고 시작 → "진실(Truth)"을 발견.

**필수 비트 포인트:**

| 비트 | 위치 | 내용 |
|------|------|------|
| 1. 거짓 믿음 확립 | Act 1 초반 | 캐릭터의 잘못된 세계관 제시 |
| 2. 외부 목표 설정 | Act 1 후반 | Want (외적 욕구) 명확화 |
| 3. 거짓 믿음 도전 | Act 2 초반 | 진실의 힌트, 무시/거부 |
| 4. 중간 전환점 | Midpoint | 진실을 처음 수용하기 시작 |
| 5. 거짓 믿음 심화 | Act 2 후반 | 변화에 저항, 옛 방식으로 회귀 시도 |
| 6. 암흑의 순간 | Act 2 끝 | 가장 큰 실패, 거짓 믿음의 완전한 파산 |
| 7. 진실 수용 | Act 3 초반 | Need (내적 필요)를 인식 |
| 8. 최종 시험 | Climax | 진실에 기반한 행동으로 외부 목표 달성 |

**성공 조건:**
- 변화가 "누적적"이어야 함 (한 번의 깨달음으로 급변하면 forced)
- 각 비트 사이에 충분한 저항(resistance)이 있어야 함
- 내적 변화와 외적 사건이 동기화

**장르 친화도:** 거의 모든 장르. 특히 성장물, 모험, 로맨스.
**다수 동일 아크**: 가능하되 변화의 구체적 내용(어떤 Lie)은 반드시 상이해야 함.

**사례**: Zuko (Avatar) -- "명예는 아버지의 인정에서 온다(Lie)" → "명예는 옳은 행동에서 온다(Truth)"

---

#### B.1.2 부정적 변화 아크 / 타락 아크 (Negative Change Arc / Fall Arc)

**정의**: 미덕/능력에서 출발 → 타락/부패 → 추락.
**핵심 엔진**: 진실을 알면서도 거짓 믿음을 선택(또는 강제당함).

**필수 비트 포인트:**

| 비트 | 위치 | 내용 |
|------|------|------|
| 1. 초기 미덕 확립 | Act 1 초반 | 관객에게 공감 대상으로 제시 |
| 2. 유혹/압력 등장 | Act 1 후반 | 타락의 시작점 제시 |
| 3. 첫 번째 양보 | Act 2 초반 | "이번만", 자기 합리화 |
| 4. 돌이킬 수 없는 선택 | Midpoint | Point of No Return |
| 5. 가속 타락 | Act 2 후반 | 양보의 누적, 원래 자신과 괴리 |
| 6. 거짓 승리 | Act 2 끝 | 외적 목표 달성, 내적 공허 |
| 7. 대가 지불 | Act 3 | 타락의 결과 직면 |
| 8. 완전한 추락 or 불완전한 인식 | Climax | 파멸 또는 자각하지만 너무 늦음 |

**성공 조건:**
- 타락의 각 단계가 "그 캐릭터라면 할 수 있는" 범위 내여야 함
- 관객이 "나도 그 상황이면..." 이라고 느낄 수 있어야 함
- 자기 합리화(rationalization)의 설득력이 핵심

**장르 친화도:** 비극, 느와르, 범죄, 정치 드라마.
**사례**: Walter White (Breaking Bad) -- 가족을 위한 선택이 권력 중독으로 변질.

---

#### B.1.3 플랫/확고 아크 (Flat/Steadfast Arc)

**정의**: 캐릭터 자신은 변하지 않으나, 세계를 변화시킴.
**핵심 엔진**: 캐릭터가 이미 진실을 보유, 주변 환경/인물이 시험.

**필수 비트 포인트:**

| 비트 | 위치 | 내용 |
|------|------|------|
| 1. 진실 확립 | Act 1 초반 | 캐릭터의 핵심 믿음/가치 제시 |
| 2. 진실의 시험 | Act 1 후반 | 세계가 진실에 반하는 상황 제시 |
| 3. 외부 압력 증가 | Act 2 초반 | 진실을 포기하면 "쉬운 길" 열림 |
| 4. 최대 유혹 | Midpoint | 진실을 포기할 가장 큰 이유 |
| 5. 주변 변화 시작 | Act 2 후반 | 캐릭터의 확고함이 타인에게 영향 |
| 6. 최대 시험 | Act 2 끝 | 진실 유지의 최대 대가 |
| 7. 세계 변화 | Act 3 | 캐릭터의 확고함이 환경/타인을 변화 |
| 8. 진실 승리 | Climax | 변하지 않은 캐릭터가 옳았음 증명 |

**성공 조건:**
- "변하지 않음"이 수동이 아닌 능동적 선택이어야 함
- 매 시험마다 진짜 대가가 있어야 함 (의지만으로 버티면 지루)
- 캐릭터의 진실이 관객에게도 설득력 있어야 함

**장르 친화도:** 미스터리(탐정), 서부극, 리더십 서사, 사회 비판.
**사례**: Atticus Finch (To Kill a Mockingbird) -- 인종 차별 사회에서 정의를 고수.

---

#### B.1.4 환멸 아크 (Disillusionment Arc)

**정의**: 순진/이상주의에서 출발 → 가혹한 진실 발견 → 세계관 붕괴.
**핵심 엔진**: Lie를 믿고 시작 → Truth를 발견하지만, Truth가 Lie보다 더 비극적.

**필수 비트 포인트:**

| 비트 | 위치 | 내용 |
|------|------|------|
| 1. 이상주의 확립 | Act 1 | 세계에 대한 낙관적/순진한 믿음 |
| 2. 작은 균열 | Act 1 후반 | 이상과 현실의 첫 불일치 |
| 3. 부인/합리화 | Act 2 초반 | "이건 예외야", 이상 유지 시도 |
| 4. 결정적 폭로 | Midpoint | 이상이 환상이었음을 보여주는 증거 |
| 5. 저항 후 수용 | Act 2 후반 | 진실 수용, 하지만 비극적 톤 |
| 6. 세계관 재구성 | Act 3 | 새로운 (더 어둡지만 진실한) 세계관 |

**성공 조건:**
- 초기 이상주의가 "합리적으로 가질 수 있는" 것이어야 함
- 진실이 단순한 "세상은 나쁘다"가 아닌 구체적이어야 함
- 환멸 후에도 캐릭터에게 남는 것(의지, 선택)이 있어야 공허하지 않음

**장르 친화도:** 전쟁물, 정치 드라마, 성장물(어두운 변주), 디스토피아.
**사례**: Michael Corleone (The Godfather) -- 합법적 삶의 이상 → 가문의 불가피성.

---

#### B.1.5 순환 아크 (Circular Arc)

**정의**: 출발점으로 돌아오지만, 변화/불변 여부는 해석에 의존.

| 변형 | 설명 |
|------|------|
| 변한 채로 돌아옴 | 외적으로 같지만 내적으로 다른 인물 |
| 변하지 않은 채 돌아옴 | 비극 -- 경험이 무의미했음을 암시 |

**장르 친화도:** 실험 영화, 철학적 서사, 시간 루프물.

---

#### B.1.6 부패 아크 (Corruption Arc)

**정의**: 선 → 악. 타락 아크(B.1.2)의 극단 변형. 캐릭터가 악을 완전히 수용.

타락 아크와의 차이:
- 타락 아크: 자각 가능성 남음, 비극적 톤
- 부패 아크: 악을 자신의 정체성으로 수용, 후회 없음

**사례**: Anakin Skywalker → Darth Vader (부패 아크) → Luke에 의한 구원 (구원 아크).

---

#### B.1.7 구원 아크 (Redemption Arc)

**정의**: 타락/부패 상태에서 출발 → 도덕적 재생.

**필수 비트 포인트:**

| 비트 | 위치 | 내용 |
|------|------|------|
| 1. 타락 상태 확립 | Act 1 | 관객이 캐릭터의 "나쁨"을 인식 |
| 2. 구원의 촉매 | Act 1 후반 | 변화를 촉발하는 사건/인물 |
| 3. 과거와의 투쟁 | Act 2 | 옛 습관, 불신, 자기 혐오 |
| 4. 속죄 행위 | Midpoint~Act 3 | 과거의 잘못을 직접적으로 보상 |
| 5. 시험과 재확인 | Act 3 | 옛 방식으로 돌아갈 유혹 |
| 6. 구원의 완성 | Climax | 희생/선택으로 변화 증명 |

**성공 조건:**
- 구원이 "쉬워서는" 안 됨 (대가 필수)
- 과거 행동의 결과가 사라지지 않아야 함 (기억/트라우마 잔존)
- 완전한 허용보다 "불완전한 구원"이 더 진정성 있음

**장르 친화도:** 드라마, 종교적 서사, 전쟁물, 범죄 → 정의.
**사례**: Zuko (Avatar), Jean Valjean (Les Miserables), Darth Vader (Return of the Jedi).

---

#### B.1.8 성장/성년 아크 (Education/Coming-of-Age Arc)

**정의**: 미성숙 → 세계 경험 → 성숙. 긍정적 변화 아크의 특수 사례.

**고유 특성:**
- 변화의 원천이 "잘못된 믿음"이 아닌 "경험의 부재"
- 멘토/환경이 교사 역할
- 첫사랑, 첫 상실, 첫 도덕적 딜레마 등 "처음"이 비트 포인트

**장르 친화도:** 성장물, 학원물, 모험, 판타지.
**사례**: Simba (The Lion King), Harry Potter, Chihiro (Spirited Away).

---

#### B.1.9 시험 아크 (Testing Arc)

**정의**: 유혹에 노출되지만 끝까지 견딤. 플랫 아크와 유사하지만 유혹의 강도가 핵심.

**플랫 아크와의 차이:**
- 플랫 아크: 세계를 변화시키는 것이 목표
- 시험 아크: 자신이 무너지지 않는 것이 목표

**사례**: Frodo (Lord of the Rings) -- 반지의 유혹에 끝까지 저항(실패하지만).

---

### B.2 아크 유형 종합 비교

| 아크 유형 | 시작 상태 | 끝 상태 | 핵심 엔진 | 관객 감정 |
|----------|----------|---------|----------|----------|
| 긍정적 변화 | 결함/거짓 | 성장/진실 | Lie → Truth | 희망, 카타르시스 |
| 부정적 변화 | 미덕/진실 | 타락/거짓 | Truth → Lie | 비극, 경고 |
| 플랫/확고 | 진실 | 진실 (세계 변화) | 확고함 vs 압력 | 경외, 영감 |
| 환멸 | 순진/Lie | 진실 (비극적) | Lie → Tragic Truth | 슬픔, 통찰 |
| 순환 | 상태 A | 상태 A (변화/불변) | 순환 구조 | 아이러니, 성찰 |
| 부패 | 선 | 악 (수용) | 도덕적 침식 | 공포, 혐오 |
| 구원 | 악/타락 | 선 (불완전) | 속죄+시험 | 감동, 용서 |
| 성장 | 미성숙 | 성숙 | 경험 축적 | 공감, 노스탈지아 |
| 시험 | 미덕 | 미덕 (시험됨) | 유혹 강도 | 긴장, 경외 |

---

## C. 캐릭터 심리 / 동기

### C.1 Want vs Need 프레임워크

캐릭터 동기의 가장 근본적인 이원 구조.

```
Want (외적 욕구)              Need (내적 필요)
━━━━━━━━━━━━━              ━━━━━━━━━━━━━
- 캐릭터가 의식적으로 추구      - 캐릭터가 인식하지 못함
- 구체적, 행동 가능            - 추상적, 감정/가치 영역
- 서사의 외적 엔진             - 서사의 내적 엔진
- Act 1에서 명확               - Midpoint 이후 서서히 드러남
- 달성해도 만족 불가            - 충족되어야 진정한 해결
```

**연결 구조:**

```
Wound (과거 상처)
    ↓ 형성
Lie (거짓 믿음/잘못된 세계관)
    ↓ 동기화
Want (외적 목표 -- Lie에 기반한 해결책)
    ↓ 추구 과정에서 발견
Need (내적 필요 -- Lie의 교정, Wound의 치유)
```

**사례 -- Frozen의 Elsa:**
- Wound: 어린 시절 Anna를 다치게 한 경험
- Lie: "내 힘은 위험하다. 혼자여야 안전하다."
- Want: 고립, 자유 (얼음 성을 짓고 혼자 살기)
- Need: 사랑을 통한 연결, 힘의 수용

### C.2 동기 위계 (Motivation Hierarchy)

매슬로우(Maslow) 기반이지만 서사적으로 재해석.

```
5. 자아실현 (Self-Actualization)
   "나는 누구인가?" -- 정체성 서사, 예술가/철학자 캐릭터
       ↑
4. 존중 (Esteem)
   "나는 가치 있는가?" -- 권력, 명예, 인정 추구
       ↑
3. 소속/사랑 (Belonging)
   "나는 사랑받는가?" -- 로맨스, 가족, 우정 서사
       ↑
2. 안전 (Safety)
   "나는 안전한가?" -- 스릴러, 호러, 서바이벌
       ↑
1. 생존 (Survival)
   "나는 살아남을 수 있는가?" -- 재난, 전쟁, 포스트아포
```

**서사적 활용:**
- 같은 사건도 캐릭터 동기 위계에 따라 다르게 반응
- 상위 욕구 추구 중 하위가 위협받으면 즉시 하위로 전환 (강력한 긴장)
- 악당은 자주 3~4단계의 왜곡된 추구 (소속을 강제, 존중을 폭력으로)

### C.3 상처/배경스토리 모델 (Wound/Backstory Model)

| 상처 유형 | 서사 효과 | 행동 패턴 |
|----------|----------|----------|
| 유기(Abandonment) | 관계 회피 or 과도한 집착 | 거리두기, 테스트, 소유욕 |
| 배신(Betrayal) | 신뢰 불능 | 비밀 유지, 선제 공격, 고독 선택 |
| 무력감(Helplessness) | 과도한 통제 욕구 | 마이크로매니지, 분노, 완벽주의 |
| 수치심(Shame) | 자기 은폐, 가면 | 과잉 보상, 자기 파괴, 유머 방어 |
| 상실(Loss) | 과도한 보호 or 무감각 | 회피, 집착, 감정 차단 |
| 폭력(Violence) | 과잉 경계 or 폭력 재현 | 도주 반응, 공격성, PTSD |

### C.4 결함-강점 역학 (Flaw-as-Strength / Strength-as-Flaw)

모든 캐릭터 특성은 양면성을 가짐. 이것이 복잡한 캐릭터의 핵심.

| 특성 | 강점으로 작용할 때 | 결함으로 작용할 때 |
|------|-----------------|-----------------|
| 완고함 | 신념 유지, 포기하지 않음 | 타인 의견 무시, 적응 불능 |
| 공감력 | 관계 구축, 타인 이해 | 감정 과부하, 자기 희생 |
| 지능 | 문제 해결, 전략 수립 | 과도한 분석, 감정 무시, 오만 |
| 충성심 | 신뢰 구축, 관계 지속 | 맹목적 복종, 잘못된 편 들기 |
| 독립성 | 자주적 판단, 리더십 | 고립, 도움 거부, 관계 파괴 |
| 매력 | 설득, 사회적 성공 | 조종, 진정성 결여 |

**서사적 활용:**
- Act 1: 특성이 강점으로 작동
- Midpoint: 같은 특성이 결함으로 전환 (또는 그 반대)
- Climax: 양면성을 통합하여 사용

### C.5 설득력 있는 악당 만들기

**핵심 원칙**: 악당은 자신의 관점에서 정당하다고 믿는다.

| 악당 동기 유형 | 설명 | 사례 |
|-------------|------|------|
| 왜곡된 정의 | 선한 목표, 극단적 수단 | Thanos (인구 반감=자원 균형) |
| 트라우마 반응 | 과거 상처의 과잉 보상 | Killmonger (식민 역사 복수) |
| 이데올로기 | 신념 체계의 논리적 결론 | Magneto (뮤턴트 생존) |
| 생존 | 극한 상황의 합리적 선택 | Shere Khan (인간=불=위험) |
| 권력 중독 | 점진적 타락 (부정적 변화 아크) | Walter White |
| 사랑/보호 | 사랑하는 것을 지키기 위한 극단 | Cersei Lannister |

**악당 설득력 체크리스트:**
- [ ] 악당의 논리를 따라가면 "일리가 있다"고 느껴지는가?
- [ ] 악당에게도 잃을 것(stakes)이 있는가?
- [ ] 악당의 방법론이 악당의 과거에서 자연스럽게 도출되는가?
- [ ] 악당이 자신의 행동을 어떻게 정당화하는지 명확한가?
- [ ] 히어로와 악당이 같은 주제의 다른 답을 체현하는가?

---

## D. 관계 다이나믹스

### D.1 관계 유형 분류

| 관계 유형 | 서사 기능 | 갈등 원천 | 장르 연관 |
|----------|----------|----------|----------|
| **동맹 (Allies)** | 능력 보완, 지원 제공 | 방법론 차이, 우선순위 충돌 | 모험, 앙상블 |
| **라이벌 (Rivals)** | 상호 자극, 성장 촉매 | 같은 목표 경쟁 | 스포츠, 학원, 직장 |
| **멘토-학생** | 지식 전수, 성장 촉진 | 학생이 멘토를 초월, 멘토의 한계 | 성장물, 판타지 |
| **로맨틱** | 감정적 취약성 노출, 동기 부여 | Want/Need 충돌, 외부 장애물 | 로맨스, 드라마 |
| **가족** | 무조건적 유대 vs 의무 | 기대 vs 현실, 세대 갈등 | 드라마, 범죄 |
| **적대 (Nemesis)** | 외적 갈등의 인격화 | 존재적 대립 (하나만 남을 수 있음) | 액션, 스릴러 |
| **거래 (Transactional)** | 상호 이용, 불안정한 동맹 | 이익 불균형, 배신 가능성 | 스릴러, 정치 |

### D.2 관계 아크 패턴

| 시작 → 끝 | 서사 기능 | 필수 전환점 |
|-----------|----------|-----------|
| 낯선 사람 → 친구 | 동맹 구축, 신뢰 여정 | 공유 시련, 비밀 공유, 희생 |
| 친구 → 적 | 배신, 비극 | 가치 충돌, 거래 실패, 비밀 폭로 |
| 적 → 동맹 | 화해, 공동 목표 | 공동의 적, 상호 이해, 존중 |
| 멘토 → 동등 | 성장 완료, 독립 | 멘토 실패, 학생 초월, 역할 전환 |
| 사랑 → 증오 | 관계 파괴, 비극 | 배신, 정체 폭로, 가치 분기 |
| 증오 → 사랑 | 적 → 연인 (Enemies-to-lovers) | 강제 협력, 취약성 목격, 재평가 |

### D.3 권력 다이나믹스 (Power Dynamics)

```
권력 원천:
  - 물리적 힘 (Physical Power)
  - 지식/정보 (Knowledge Power)
  - 사회적 지위 (Social Power)
  - 감정적 영향력 (Emotional Power)
  - 경제적 자원 (Economic Power)

권력 이동 패턴:
  정적: 권력 불균형 유지 → 긴장 축적 → 폭발적 전환
  동적: 씬마다 권력 교환 → 긴장 유지 → 최종 결정
  반전: 약자→강자, 강자→약자 → 카타르시스/비극
```

**권력 이동의 시각화:**
- 프레이밍: 권력자 = 높은 위치/큰 사이즈, 약자 = 낮은 위치/작은 사이즈
- 시선: 권력자가 내려다봄, 약자가 올려다봄
- 공간: 권력자가 넓은 공간 차지, 약자가 구석/좁은 공간

### D.4 앙상블 다이나믹스 (3인 이상)

| 구조 | 특성 | 갈등 원천 | 사례 |
|------|------|----------|------|
| 삼각 관계 | 2인 동맹 + 1인 소외, 유동적 | 누가 누구 편인가 | Harry/Ron/Hermione |
| 리더+팀 | 위계적, 리더십 시험 | 리더 결정 vs 개인 의지 | Ocean's Eleven |
| 동등한 집단 | 민주적, 합의 필요 | 의견 분열, 파벌 | Avengers |
| 가족 구조 | 역할 고정(부모/자녀), 의무 | 세대 갈등, 기대 | Parasite |
| 서바이벌 그룹 | 일시적, 이해관계 기반 | 자원 경쟁, 배신 | Walking Dead |

**앙상블 핵심 규칙:**
- 모든 캐릭터 쌍에 고유한 관계 정의 필요 (n명이면 n(n-1)/2개 관계)
- 씬에서 "누가 누구에게 양보하는가"로 권력 관계 드러남
- 그룹 내 고립된 캐릭터 = 관객의 감정 초점

### D.5 포일 관계 (Foil Relationships)

캐릭터의 특성을 강조하기 위해 대비되는 캐릭터를 배치.

| 포일 유형 | 대비 방식 | 서사 효과 |
|----------|----------|----------|
| 도덕적 포일 | 같은 상황, 다른 도덕적 선택 | 주인공의 선택을 부각 |
| 능력 포일 | 같은 목표, 다른 방법 | 주인공의 접근법 정당화/비판 |
| 성격 포일 | 정반대 성격, 같은 환경 | 캐릭터 깊이 확장 |
| 사회적 포일 | 같은 배경, 다른 선택 | 환경 vs 선택의 주제 |

**사례:**
- Batman vs Joker: 질서 vs 혼돈
- Harry vs Draco: 선택에 의한 선 vs 환경에 의한 악
- Sherlock vs Watson: 지성 vs 감성, 고립 vs 연결

---

## E. 캐릭터 일관성 규칙

### E.1 캐릭터를 "진짜"로 느끼게 하는 것

| 요소 | 설명 | AI 파이프라인 구현 |
|------|------|-----------------|
| **결정 패턴** | 같은 유형의 상황에서 유사한 결정 | 결정 트리 / 성격 벡터 |
| **언어 패턴** | 고유한 어휘, 리듬, 직접성 수준 | 스피치 프로필 |
| **감정 반응 패턴** | 자극에 대한 일관된 반응 양식 | 감정 반응 매핑 |
| **바디 랭귀지** | 자세, 습관적 동작, 공간 사용 | 퍼포먼스 프리셋 |
| **가치 우선순위** | 충돌 시 어떤 가치를 선택하는가 | 가치 위계 정의 |
| **관계 패턴** | 사람과의 거리 조절 방식 | 관계 성향 프로필 |

### E.2 "일관되지 않은" 행동이 믿을 수 있는 경우

캐릭터가 기존 패턴을 벗어나야 하는 정당한 상황:

| 조건 | 설명 | 성공 기준 |
|------|------|---------|
| 극한 상황 | 생존 위협, 극도의 감정 | 상황의 극단성이 충분히 확립 |
| 드러나는 깊이 | 평소 숨겨왔던 면이 노출 | 사전 힌트(씨앗)가 존재 |
| 아크 진행 | 변화 과정의 자연스러운 단계 | 누적된 경험이 행동을 설명 |
| 의식적 선택 | 캐릭터 스스로 "다르게 행동하겠다" 결정 | 결정의 동기가 명시적 |
| 자기기만 | 자신조차 모르는 본성의 발현 | 관객에게는 힌트가 주어졌었음 |

### E.3 캐릭터 바이블 -- 정의해야 할 것 vs 자연 발생

| 반드시 정의 | 자연 발생 허용 |
|-----------|-------------|
| 핵심 가치관 (Top 3) | 특정 상황에서의 구체적 반응 |
| Wound / 배경 핵심 사건 | 사소한 습관/버릇 |
| Want / Need | 유머 스타일 |
| 다른 캐릭터와의 관계 본질 | 특정 주제에 대한 의견 |
| 아크 유형 + 시작/끝 상태 | 씬 간 감정 미세 변화 |
| 스피치 프로필 (어휘 수준, 직접성, 속도) | 구체적 대사 |
| 결정 성향 (충동적/분석적/감정적) | 예측 불가 순간 |

---

# PART 2: S3 -- 씬/감정/대사

> "각 순간에 무슨 일이 일어나는가". 변경 비용: 해당 씬만.

---

## A. 씬 목적 분류 체계 (Scene Purpose Taxonomy)

### A.1 10대 씬 목적

모든 좋은 씬은 복수 목적을 동시에 수행. 하지만 "주요 목적"은 항상 하나.

---

#### 1. 설정 씬 (Exposition Scene)

**주요 기능**: 관객에게 필요한 정보 전달.

| 내부 구조 | 설명 |
|----------|------|
| 시작 | 정보 필요성을 암시하는 상황 설정 |
| 중간 | 캐릭터 행동/대화를 통한 자연스러운 정보 노출 |
| 끝 | 정보가 이후 행동을 가능케 하는 전환 |

**적정 길이**: 짧을수록 좋음. 30초~1분. 길어지면 반드시 갈등을 동반.
**위치**: Act 1 초반~중반.
**성공 조건**: 관객이 "정보를 받고 있다"고 의식하지 못할 것. "As you know, Bob" 회피.

**기법:**
- 갈등 포장: 정보를 갈등 안에 숨김 (논쟁 중에 세계관 설명)
- 시각적 전달: 대사 대신 환경으로 보여줌
- 캐릭터 리액션: 정보 자체가 아닌 반응이 씬의 진짜 내용

---

#### 2. 갈등 씬 (Conflict Scene)

**주요 기능**: 캐릭터 간 또는 캐릭터-환경 충돌.

| 내부 구조 | 설명 |
|----------|------|
| 시작 | 갈등의 원인/도화선 |
| 중간 | 에스컬레이션 -- 양측이 물러서지 않음 |
| 끝 | 승패 결정 또는 교착/회피 |

**적정 길이**: 2~4분. 고강도.
**위치**: Act 전반에 걸쳐, 빈도 증가.
**성공 조건**: 양측 모두 "그들의 관점에서" 맞다고 느껴질 것.

---

#### 3. 결정 씬 (Decision Scene)

**주요 기능**: 캐릭터가 중요한 선택을 함.

| 내부 구조 | 설명 |
|----------|------|
| 시작 | 딜레마 제시 (양쪽 모두 대가) |
| 중간 | 옵션 탐색, 내적 갈등 |
| 끝 | 결정 + 즉각적 결과 또는 결과 예고 |

**적정 길이**: 1~3분. 내적 씬이므로 시각화 도전.
**위치**: 주요 전환점(Act 분기, Midpoint).
**성공 조건**: 두 선택지 모두 합리적이어야 함. 한쪽이 명백히 나으면 결정이 아닌 "당연한 행동".

---

#### 4. 발견 씬 (Revelation Scene)

**주요 기능**: 숨겨진 진실의 폭로.

| 내부 구조 | 설명 |
|----------|------|
| 시작 | 발견 직전의 상태 (무지 or 잘못된 믿음) |
| 중간 | 발견의 순간 (극적 아이러니 활용 가능) |
| 끝 | 발견에 대한 반응 + 이후 행동 결정 |

**적정 길이**: 발견 자체는 짧게(수 초). 반응이 씬의 본체(1~3분).
**위치**: Midpoint, Act 2 끝, Climax 직전.
**성공 조건**: 관객이 "그래, 그런데 몰랐어!" (놀라움) 또는 "드디어 알게 됐구나" (카타르시스).

---

#### 5. 변환 씬 (Transformation Scene)

**주요 기능**: 캐릭터가 눈에 띄게 변화하는 순간.

| 내부 구조 | 설명 |
|----------|------|
| 시작 | 변화 직전의 최대 압력 |
| 중간 | 변화의 촉매 (깨달음, 선택, 희생) |
| 끝 | 변한 후의 캐릭터 (시각적으로도 변화 표현) |

**적정 길이**: 2~4분. 감정적 무게에 비례.
**위치**: 주요 아크 전환점.
**성공 조건**: 변화가 "earned" (충분한 setup 선행). L2 의상/컬러 아크와 동기화.

---

#### 6. 전환 씬 (Transition Scene)

**주요 기능**: 시간/장소/감정 상태 이동.

| 내부 구조 | 설명 |
|----------|------|
| 시작 | 이전 상태의 잔향 |
| 중간 | 이동 과정 (물리적/감정적) |
| 끝 | 다음 상태의 시작 신호 |

**적정 길이**: 10~30초. 가능한 짧게.
**위치**: 씬 사이 어디든.
**성공 조건**: 감정적 비약 없이 자연스러운 연결. 몽타주로 처리 가능.

---

#### 7. 설치 씬 (Setup Scene)

**주요 기능**: 이후 회수(payoff)를 위한 정보/소품/관계 심기.

| 내부 구조 | 설명 |
|----------|------|
| 시작 | 일상적 상황 위장 |
| 중간 | 나중에 중요해질 요소를 자연스럽게 노출 |
| 끝 | 요소가 기억에 남되, 지나치게 강조하지 않음 |

**적정 길이**: 30초~1분. 너무 길면 "이거 중요하구나" 바로 파악됨.
**위치**: Act 1~2 초반.
**성공 조건**: 회수 시 관객이 "아, 그때 그것!" 반응. 보지 못해도 무방하지만 보면 보상.

---

#### 8. 회수 씬 (Payoff Scene)

**주요 기능**: 이전 설치의 결실.

| 내부 구조 | 설명 |
|----------|------|
| 시작 | 설치된 요소가 필요해지는 상황 |
| 중간 | 요소의 사용/발현 |
| 끝 | 해결 + 관객 만족 |

**적정 길이**: 설치보다 길어도 됨. 1~3분.
**위치**: Act 2 후반~Act 3.
**성공 조건**: 설치와 회수 사이에 충분한 거리 (최소 수 씬). 너무 가까우면 뻔함.

---

#### 9. 클라이맥스 씬 (Climax Scene)

**주요 기능**: 최대 긴장, 중심 갈등의 결정적 충돌.

| 내부 구조 | 설명 |
|----------|------|
| 시작 | 모든 세력이 수렴 |
| 중간 | 최대 강도의 갈등 (물리적/감정적/지적) |
| 끝 | 해결 -- 승리/패배/피로스 승리 |

**적정 길이**: 전체 서사 길이의 10~15%.
**위치**: Act 3 초중반.
**성공 조건**: 이전 모든 씬이 여기로 수렴해야 함. "이 순간을 위해 모든 것이 있었다."

---

#### 10. 해소 씬 (Resolution Scene)

**주요 기능**: 새로운 균형 제시, 감정 착지.

| 내부 구조 | 설명 |
|----------|------|
| 시작 | 클라이맥스의 여파 |
| 중간 | 새로운 일상 / 변화된 세계 |
| 끝 | 마지막 이미지 (첫 이미지와 대비) |

**적정 길이**: 30초~2분. 너무 길면 감정 소산.
**위치**: 서사의 마지막.
**성공 조건**: 관객에게 "완결감" + "여운" 동시 제공.

---

### A.2 씬 목적 종합 매핑

```
Act 1 (설정):  설정 → 설치 → 갈등(작은) → 결정(작은)
Act 2 전반:    갈등(중) → 설치 → 발견(작은) → 전환
Midpoint:      발견(큰) or 변환(중간)
Act 2 후반:    갈등(큰) → 회수(작은) → 결정(큰)
Act 2 끝:      발견(큰) → 변환(큰)
Act 3:         클라이맥스 → 회수(큰) → 해소
```

---

## B. 감정 비트 패턴

### B.1 씬 레벨 감정 아크

**모든 씬은 자체 감정 아크를 가진다.**

```
씬 진입 감정 ──→ 사건 ──→ 감정 전환점 ──→ 씬 퇴장 감정
 (Entry Emotion)  (Event)  (Emotional Turn)  (Exit Emotion)
```

**핵심 규칙: 진입 감정 =/= 퇴장 감정**

만약 캐릭터가 SAD로 진입하면, MAD, GLAD, SCARED 중 하나로 퇴장해야 함.
같은 감정으로 진입-퇴장하면 씬이 "가지 않았다"(went nowhere).

### B.2 감정 에스컬레이션 패턴

| 패턴 | 설명 | 효과 |
|------|------|------|
| 계단식 상승 | 작은 긴장 → 중간 → 큰 → 폭발 | 클라이맥스 빌드업 |
| 파도식 | 긴장 ↗ 이완 ↘ 긴장 ↗↗ 이완 ↘ | 지속적 관심 유지 |
| 갑작스런 전환 | 평온 → 갑작스런 충격 | 서프라이즈, 호러 |
| 서서히 끓는 냄비 | 미세한 긴장 축적, 감지 못할 정도 | 불안, 스릴러 |
| 감정 대비 | 기쁨 직후 슬픔, 공포 직후 안도 | 감정 증폭 |

### B.3 연속 씬 간 감정 변주 규칙

**절대 금지: 같은 감정 강도의 연속**

```
BAD:  긴장 → 긴장 → 긴장 → 긴장 → 긴장
      (관객 피로, 감각 마비)

GOOD: 긴장 → 안도(짧) → 긴장↑ → 유머 → 긴장↑↑ → 슬픔 → 긴장↑↑↑
      (감정 리듬, 대비 효과)
```

**감정 리듬 원칙:**
1. 고강도 씬 후에는 저강도 씬 (숨 돌릴 틈)
2. 코미디 비트는 긴장 해소 + 재충전 기능
3. 슬픔/성찰 씬은 다음 액션의 emotional stakes를 높임
4. 가장 큰 감정 임팩트는 "기대의 반대" (웃음 직후 충격)

### B.4 감정 전환점 (Emotional Turn)

씬 내에서 감정이 전환되는 정확한 순간.

| 전환 트리거 | 설명 | 시각화 신호 |
|-----------|------|-----------|
| 정보 수신 | 캐릭터가 새로운 사실을 알게 됨 | CU 리액션 샷 |
| 결정 순간 | 선택지 앞에서 결단 | 정적 → 행동 전환 |
| 관계 전환 | 타인의 예상 밖 행동 | OTS → CU 전환 |
| 환경 변화 | 물리적 상황 급변 | WS → CU 전환 |
| 내적 깨달음 | 자기 발견 | 슬로우 돌리, ECU, 정적 |

---

## C. 대사 기능 (Dialogue Functions)

### C.1 대사의 6가지 기능

모든 대사는 최소 2가지 이상의 기능을 동시에 수행해야 함.

| 기능 | 설명 | 함정 |
|------|------|------|
| **1. 정보 전달** | 관객/캐릭터에게 필요한 사실 전달 | "As you know, Bob" (인위적 설명) |
| **2. 캐릭터 드러냄** | 말하는 방식이 인격을 보여줌 | 모든 캐릭터가 같은 목소리 |
| **3. 갈등 표현** | 대립, 서브텍스트, 말하지 않는 것 | 직접적 감정 표현 (쇼, 돈트 텔) |
| **4. 플롯 전진** | 행동 유발, 사건 촉발 | 대사 없이 행동으로 대체 가능 |
| **5. 코믹 릴리프** | 긴장 해소, 캐릭터 매력 | 톤과 불일치하면 tonal whiplash |
| **6. 복선** | 나중에 중요해질 정보 심기 | 너무 노골적이면 바로 파악 |

### C.2 서브텍스트 (Subtext)

**정의**: 실제로 말하는 것과 의미하는 것의 차이. 진짜 대화는 표면 아래에서 일어남.

**서브텍스트 생성 조건:**
1. 캐릭터가 진짜 감정을 숨겨야 할 이유 (사회적 압력, 자존심, 두려움, 전략)
2. 관객은 숨겨진 감정을 알 수 있어야 함 (맥락, 바디랭귀지, 이전 씬 정보)
3. 말하지 않는 것이 말하는 것보다 더 많은 정보를 전달

**서브텍스트 기법:**

| 기법 | 설명 | 사례 |
|------|------|------|
| 화제 전환 | 불편한 주제 회피 | "그건 그렇고..." = "이야기하고 싶지 않아" |
| 과잉 주장 | 반대를 의미하는 강한 긍정 | "난 완전 괜찮아" = 괜찮지 않음 |
| 대리 대화 | 다른 대상에 대해 이야기하며 자신을 투사 | 반려동물 이야기 = 자기 이야기 |
| 질문으로 답 | 직접 답하지 않고 질문으로 회피 | "왜 그걸 묻는데?" = 대답 불가 |
| 행동 불일치 | 말과 행동이 다름 | "가도 돼" (문을 잡으며) |

### C.3 "As You Know, Bob" 회피 전략

정보를 전달해야 하지만 인위적이면 안 될 때:

| 전략 | 설명 |
|------|------|
| 갈등 내 삽입 | 논쟁 중에 세계관 정보가 자연스럽게 나옴 |
| 새 캐릭터 활용 | 모르는 사람에게 설명 = 자연스러움 |
| 시각적 전달 | 대사 대신 환경으로 보여줌 |
| 반박을 통한 노출 | "그게 아니라..." 로 시작하는 교정 |
| 감정적 폭발 | 분노/슬픔 속에서 과거 정보 누설 |

---

## D. 정보 관리 (Information Management)

### D.1 정보 비대칭 4 모드

| 모드 | 관객 아는 것 | 캐릭터 아는 것 | 효과 |
|------|-----------|-------------|------|
| **극적 아이러니 (Dramatic Irony)** | O | X | 서스펜스, 관객 우월감, 불안 |
| **서스펜스 (Suspense)** | X | X | 공동 탐구, 긴장 |
| **미스터리 (Mystery)** | X | O (일부) | 호기심, 추리 참여 |
| **서프라이즈 (Surprise)** | X | X → O | 충격, 재평가, 반전 |

### D.2 히치콕의 폭탄 이론

| 시나리오 | 관객 경험 | 효과 |
|---------|----------|------|
| 테이블 밑 폭탄, 관객 모름 | 폭발 순간 5초의 놀라움 | Surprise |
| 테이블 밑 폭탄, 관객 앎 | 대화 내내 15분의 긴장 | Suspense |

**원칙**: 가능하면 관객에게 정보를 주라. 서프라이즈보다 서스펜스가 더 오래, 더 강하게 작동한다.

**예외**: 서프라이즈가 더 효과적인 경우:
- 트위스트 자체가 서사의 핵심 (The Sixth Sense, Fight Club)
- 장르 기대의 위반이 목적 (Psycho의 샤워 씬)

### D.3 정보 타이밍의 감정적 임팩트

| 타이밍 | 효과 |
|--------|------|
| 너무 이른 공개 | 긴장 소진, "그래서?" |
| 적절한 공개 | 최대 감정 반응, 연쇄 효과 |
| 너무 늦은 공개 | 관객 좌절, 인위적 느낌 |
| 반복적 부분 공개 | 미스터리 유지, 관객 참여 |

### D.4 "알아야 할 때만 알려주기" 원칙 (Need-to-Know Principle)

```
정보 공개 테스트:

1. 이 정보가 없으면 관객이 씬을 이해할 수 없는가?
   → YES: 지금 공개
   → NO: 보류

2. 이 정보를 지금 공개하면 미래 씬의 감정적 임팩트가 줄어드는가?
   → YES: 보류
   → NO: 공개 가능

3. 이 정보를 보류하면 관객이 좌절하는가?
   → YES: 부분 공개 (힌트만)
   → NO: 완전 보류
```

---

# PART 3: S2xS3 -- 캐릭터-씬 핍진성 (VERISIMILITUDE)

> **이것이 전체 문서에서 가장 중요한 파트.**
> S2(캐릭터)와 S3(씬)이 만나는 교차점에서 핍진성이 결정됨.
> 핍진성 = "관객이 허구를 진짜로 느끼는 정도"

---

## A. 캐릭터-행동 일관성 (Character-Action Consistency)

### A.1 일관성의 정의

캐릭터의 행동이 "그 캐릭터답다"고 느껴지는 상태.
행동이 캐릭터의 성격, 배경, 현재 상황과 일치할 때 성립.

**핵심 구분:**

```
일관성 (Consistency)     =/=     예측 가능성 (Predictability)
━━━━━━━━━━━━━━━━              ━━━━━━━━━━━━━━━━━━━━
사후적으로 "그래, 그럴 수 있지"    사전적으로 "이렇게 하겠지"
깊이/복잡성 가능                  얕음/지루함 유발
내적 논리가 존재                  행동 패턴이 단순
```

### A.2 "얻어낸" 캐릭터 순간 (Earning Character Moments)

캐릭터의 행동이 "earned"(충분히 준비됨)으로 느껴지려면:

| 조건 | 설명 | 실패 시 |
|------|------|--------|
| 충분한 설정 | 그 행동을 할 수 있는 근거가 사전에 존재 | "갑자기" 느낌 |
| 누적적 변화 | 한 번의 사건이 아닌 축적된 경험 | "강제적" 느낌 |
| 관객 이해 | 관객이 캐릭터의 내적 상태를 파악 | "왜?" 반응 |
| 대가 존재 | 행동에 진짜 비용이 따름 | "쉬운" 느낌 |
| 저항 경험 | 행동 전에 내적/외적 저항이 있었음 | "당연한" 느낌 |

**비율 규칙:**
```
작은 행동 변화:  1~2 씬의 설정으로 충분
중간 행동 변화:  3~5 씬에 걸친 점진적 설정
큰 성격 전환:    서사 전체에 걸친 아크 설정
극적 반전:      가장 강한 외부 자극 + 내적 준비 모두 필요
```

### A.3 씬당 캐릭터 변화의 허용량

| 변화 유형 | 한 씬에서 가능한 범위 | 조건 |
|----------|-------------------|------|
| 감정 변화 | O (즉시 가능) | 충분한 자극이 존재 |
| 태도 변화 | 제한적 (씨앗→싹 수준) | 누적된 압력 + 촉매 사건 |
| 가치관 변화 | X (한 씬에서 불가) | 다수 씬에 걸친 아크 필요 |
| 관계 재정의 | 제한적 (전환점은 가능) | 이전 씬에서 긴장 축적 필요 |
| 정체성 전환 | X (한 씬에서 불가) | 서사 전체의 클라이맥스에서만 |

---

## B. 결정 논리 (Decision Logic)

### B.1 핵심 원칙: 캐릭터의 관점에서 논리적

캐릭터의 결정은 **관객의 관점이 아닌 캐릭터의 관점에서** 합리적이어야 함.

```
관객이 가진 것:          캐릭터가 가진 것:
━━━━━━━━━━━━━          ━━━━━━━━━━━━━━━
모든 씬의 정보           자기 씬의 정보만
전지적 관점             자기 관점만
감정적 거리             감정적 몰입
메타 지식(장르 규칙)     세계 내부 지식만
```

**따라서**: 관객에게는 "멍청한" 결정도 캐릭터에게는 "최선"일 수 있음.
그러나 이를 성립시키려면 **캐릭터의 정보 제한/감정 상태가 명확**해야 함.

### B.2 S2가 S3를 제약하는 방식

```
S2 캐릭터 심리 ══> S3 씬 내 결정 제약

성격: 충동적 → 충분히 고민하는 결정 씬은 OOC
배경: 군인 출신 → 전투 상황에서 패닉은 OOC (특수 조건 없이)
관계: A를 신뢰 → A의 경고를 무시하는 것은 OOC (갈등 없이)
상처: 유기 트라우마 → 쉽게 사람을 떠나보내는 것은 OOC
가치: 정의 우선 → 이익을 위해 정의를 포기하는 것은 OOC (아크 없이)

OOC = Out Of Character (캐릭터답지 않음)
```

### B.3 "바보 공" 문제 (Idiot Ball Problem)

| 문제 유형 | 설명 | 해결책 |
|----------|------|--------|
| 플롯 편의 바보 | 캐릭터가 플롯을 위해 멍청해짐 | 더 스마트한 장애물 설계 |
| 호러 바보 | 위험을 향해 걸어감 | 정보 비대칭 활용 (캐릭터는 위험 모름) |
| 소통 실패 바보 | "한마디면 해결"인데 안 함 | 안 하는 이유를 캐릭터 심리에 근거 |
| 분할 행동 바보 | "갈라지면 안 되는데..." | 갈라져야 하는 설득력 있는 이유 제공 |

**스마트 캐릭터로 긴장 유지하는 법:**
1. **대등한 적**: 똑똑한 주인공에는 더 똑똑한 적 (또는 다른 종류의 위협)
2. **정보 비대칭**: 캐릭터가 모르는 것이 합리적인 상황 설계
3. **시간 압박**: 최적의 결정을 내릴 시간이 없음
4. **트레이드오프**: 모든 선택에 대가가 있어 "정답"이 없음
5. **감정 간섭**: 스트레스/공포/분노가 판단력을 현실적으로 저하
6. **규모 불균형**: 아무리 똑똑해도 압도적 물리적 열세

### B.4 결정 검증 체크리스트

```
씬에서 캐릭터가 결정을 내릴 때:

[ ] 이 캐릭터가 이 시점에 가진 정보로 이 결정이 합리적인가?
[ ] 이 캐릭터의 성격/가치관과 일치하는가? 불일치라면 충분한 이유가 있는가?
[ ] 이 결정에 진짜 대가가 있는가?
[ ] 관객이 "나도 그 상황이면..."이라고 느낄 수 있는가?
[ ] 더 명백한 대안이 있다면, 왜 그 대안을 선택하지 않았는지 설명 가능한가?
```

---

## C. 감정적 진정성 (Emotional Authenticity)

### C.1 씬 내 감정 변화 속도

| 감정 전환 | 가능 속도 | 조건 |
|----------|---------|------|
| 공포 → 안도 | 즉시 | 위험 제거가 명확 |
| 분노 → 평온 | 느림 (수 초~수 분) | 분노의 강도에 비례 |
| 슬픔 → 기쁨 | 느림 | 충분한 촉매 (좋은 소식, 유머) |
| 사랑 → 증오 | 중간 | 배신/폭로 사건 필요 |
| 놀라움 → 수용 | 중간 | 정보 소화 시간 |
| 기쁨 → 공포 | 즉시 | 갑작스런 위협 |
| 평온 → 분노 | 빠름 | 도발의 강도에 비례 |

### C.2 톤 전환 충격 문제 (Tonal Whiplash)

**정의**: 감정 전환이 너무 갑작스러워 관객이 따라가지 못하는 현상.

**가장 흔한 문제: 슬픔 직후 유머**

| 작동하는 경우 | 작동하지 않는 경우 |
|-------------|----------------|
| 캐릭터 고유의 방어 기제로서의 유머 | 서사 편의를 위한 분위기 전환 |
| 다른 캐릭터가 유머를 제공 (슬픈 캐릭터는 아직 슬픔) | 슬픈 캐릭터 본인이 즉시 농담 |
| 쓴웃음/아이러닉 유머 (슬픔이 유지됨) | 밝은 유머 (슬픔이 사라짐) |
| 충분한 전환 시간 확보 | 즉각적 톤 전환 |

### C.3 성격별 사건 처리 차이

같은 사건이라도 캐릭터 성격에 따라 완전히 다르게 처리:

| 성격 유형 | 같은 비극에 대한 반응 | 시각화 |
|----------|-------------------|--------|
| 외향적/표현적 | 울음, 분노 표출, 타인에게 기댐 | CU 표정, 격한 바디랭귀지 |
| 내향적/억제적 | 침묵, 고립, 내면 처리 | WS 고독, 정적, 느린 동작 |
| 분석적 | 원인 파악 시도, 감정 후회 | 대화, 질문, 탐색 행동 |
| 충동적 | 즉각 행동, 나중에 감정 | 빠른 움직임, 이후 정적 |
| 보호적 | 자신의 감정보다 타인 챙김 | OTS, 돌봄 행동 |
| 자기파괴적 | 자해적 대처 (음주, 무모한 행동) | 어둠, 고립, 위험한 환경 |

### C.4 감정 마스킹 (Emotional Masking)

캐릭터가 보여주는 감정과 실제 느끼는 감정이 다른 경우.
**핍진성의 핵심 도구** -- 인간은 항상 감정을 숨김.

| 마스킹 유형 | 보이는 감정 | 실제 감정 | 서사적 용도 |
|-----------|-----------|----------|-----------|
| 사회적 마스킹 | 미소/긍정 | 불안/슬픔 | 외로움, 사회적 압력 |
| 보호적 마스킹 | 강함/분노 | 두려움/취약 | 방어 기제 |
| 전략적 마스킹 | 평온/무관심 | 계획/분노 | 반전, 서스펜스 |
| 자기기만 마스킹 | 행복 | 부정(denial) | 환멸 아크의 초기 |

**시각화 신호:**
- 미세 표정(마이크로 익스프레션): 0.5초 미만의 진짜 감정 노출
- 바디랭귀지 불일치: 웃지만 주먹을 쥠
- 환경 반응: 캐릭터는 괜찮다고 하지만 주변 환경이 불안을 반영
- 다른 캐릭터의 시선: 관찰자가 마스킹을 의심하는 반응

---

## D. 대사-캐릭터 적합성 (Dialogue-Character Fit)

### D.1 캐릭터별 고유 보이스 (Distinct Voice)

**원칙**: 이름표를 가리고 읽어도 누가 말하는지 알 수 있어야 함.

| 보이스 구성 요소 | 설명 | 파이프라인 구현 |
|---------------|------|--------------|
| **어휘 수준** | 일상어/전문어/은어/비속어 | vocabulary_level: casual/formal/technical/slang |
| **문장 길이** | 짧고 끊기는 vs 장문 | sentence_length: short/medium/long |
| **직접성** | 돌려 말하기 vs 직설 | directness: indirect/neutral/blunt |
| **속도/리듬** | 빠른 연사 vs 느린 사려 | speech_pace: rapid/measured/deliberate |
| **감정 표현도** | 감정을 드러내는 정도 | emotional_display: suppressed/moderate/expressive |
| **유머 스타일** | 건조/풍자/슬랩스틱/없음 | humor_style: dry/sarcastic/physical/none |
| **특징적 표현** | 고유 문구, 말버릇, 감탄사 | verbal_tics: ["you know", "listen", etc.] |
| **문화/지역** | 방언, 문화적 표현 | dialect_markers: [specific items] |

### D.2 보이스에 영향을 미치는 요인

```
교육 수준 ──> 어휘 + 문법 복잡도
문화 배경 ──> 관용 표현, 비유 유형
직업 ──────> 전문 용어, 사고 패턴
연령 ──────> 세대적 표현, 에너지
성격 ──────> 직접성, 감정 표현, 유머
관계 ──────> 상대에 따라 레지스터 전환
감정 상태 ──> 정상 패턴의 변형
```

### D.3 "탈보이스" (Out of Voice) 정당한 경우

| 상황 | 보이스 변화 | 서사적 의미 |
|------|-----------|-----------|
| 극도의 스트레스 | 공손한 사람이 거칠어짐 | 한계 노출 |
| 기만/연기 | 자신의 보이스를 의도적으로 바꿈 | 이중 정체성 |
| 성장/변화 | 서서히 보이스가 변화 | 아크 진행의 증거 |
| 특정 인물 앞에서 | 보이스가 전환 (부모 앞에서 퇴행) | 관계 역학 드러냄 |
| 취함/부상/질병 | 물리적 원인의 보이스 변화 | 상태 표현 |

### D.4 "모든 캐릭터가 작가처럼 말하는" 문제

AI 파이프라인에서 특히 위험한 문제: LLM이 모든 캐릭터에게 같은 어조를 부여.

**해결 전략:**
1. **스피치 프로필 선정의**: 캐릭터별로 보이스 파라미터를 사전에 정의
2. **금지어 목록**: 이 캐릭터가 절대 사용하지 않을 표현
3. **필수어 목록**: 이 캐릭터가 자주 사용하는 표현
4. **대사 교차 검증**: 대사를 다른 캐릭터에 배정해보고, 어색하면 성공
5. **대비 씬 활용**: 같은 상황에 대한 두 캐릭터의 다른 반응을 보여줌

---

## E. 씬 내 관계 다이나믹스

### E.1 권력 다이나믹스의 씬 내 표현

| 권력 관계 | 대사 패턴 | 시각적 표현 |
|----------|---------|-----------|
| A > B (지배) | A: 짧은 명령. B: 긴 설명/변명 | A: 서있음. B: 앉음. A가 프레임 지배 |
| A = B (균등) | 교대로 발언, 비슷한 발화량 | 대칭 구도, 아이레벨 |
| A < B (복종) | A: 조심스러운 어조. B: 단호함 | A: 시선 회피. B: 직시 |
| 역전 중 | 발화량 역전, 침묵의 의미 변화 | 구도 변화, 카메라 높이 전환 |

### E.2 관계 역사가 씬 행동에 미치는 영향

```
관계 역사 ──> 씬 행동 제약

오래된 친구:
  - 말하지 않아도 아는 것 → 설명 생략 가능
  - 내부 농담 → 서브텍스트 레이어
  - 과거 갈등의 그림자 → 특정 주제 회피

최근 만남:
  - 모든 것이 표면적 → 설명 필요
  - 예의/경계 → 직접성 낮음
  - 인상 관리 → 감정 마스킹 강함

적대에서 동맹으로:
  - 잔여 불신 → 뒤돌아봄, 무기 근처
  - 서툰 협력 → 소통 실패, 역할 혼란
  - 과거 참조 → "전에 네가 한 짓을..."
```

### E.3 대사의 서브텍스트와 관계 역사

두 캐릭터 사이에 역사가 있으면 대사의 표면과 심층이 분리됨:

| 표면 대사 | 관계 역사 | 실제 의미 |
|----------|---------|---------|
| "잘 지냈어?" | 5년 전 배신 | "아직 용서 안 했어" |
| "네 선택이야" | 멘토-학생 | "실망시키지 마" |
| "괜찮아, 갈 수 있어" | 연인 (현재 위기) | "가지 마" |
| "전에도 이런 적 있었지" | 동료 (반복된 실패) | "또 실패할 거야" |
| "네가 알아서 해" | 부모-자녀 | "내 방식으로 해라" |

### E.4 그룹 씬 다이나믹스

3인 이상이 등장하는 씬의 특수 규칙:

| 규칙 | 설명 |
|------|------|
| **스포크스퍼슨 규칙** | 모든 그룹에는 대변인이 있음. 누가 말하는가 = 권력 |
| **침묵의 의미** | 그룹 씬에서 말하지 않는 캐릭터의 비언어가 가장 중요 |
| **동맹 표시** | 누가 누구 옆에 서는가, 누구를 바라보는가 |
| **고립 표시** | 물리적으로 떨어진 캐릭터 = 감정적 고립 |
| **발언 순서** | 위계가 있는 그룹에서 누가 먼저 말하는가 |
| **시선 교환** | 말하는 사람이 아닌 듣는 사람들 사이의 시선 |

---

# PART 4: 파이프라인 매핑 -- Tale Studio S2/S3 구현 설계

> dual_axis_model.md의 S축 파라미터를 구체적 데이터 구조로 매핑

---

## 1. S2 데이터 구조 제안

```yaml
CharacterSpec:
  # 기존 (scene.ts Character 확장)
  characterId: string
  name: string
  role: protagonist | antagonist | supporting
  description: string
  fixedPrompt: string
  referenceImages: string[]

  # S2 확장: 심리/동기
  archetype:
    primary: hero | shadow | mentor | trickster | herald | shapeshifter | threshold_guardian | ally
    secondary: string | null      # 보조 아키타입 (혼합)
    modern_variant: string | null  # anti_hero, reluctant_hero, morally_grey, etc.
  
  arc:
    type: positive_change | negative_change | flat | disillusionment | circular | corruption | redemption | education | testing
    start_state: string            # "아버지의 인정을 갈구하는 왕자"
    end_state: string              # "자신의 길을 찾은 지도자"
    key_beats: Beat[]              # 아크 비트 포인트 (위치 + 설명)
  
  psychology:
    wound: string                  # 핵심 상처 (과거)
    lie: string                    # 거짓 믿음
    want: string                   # 외적 목표 (의식적)
    need: string                   # 내적 필요 (무의식)
    motivation_level: survival | safety | belonging | esteem | self_actualization
    flaw_strength:                 # 결함-강점 양면성
      trait: string
      as_strength: string
      as_flaw: string
    values: string[]               # 우선순위 순 핵심 가치 (Top 3)
  
  voice:
    vocabulary_level: casual | formal | technical | slang | mixed
    sentence_length: short | medium | long
    directness: indirect | neutral | blunt
    speech_pace: rapid | measured | deliberate
    emotional_display: suppressed | moderate | expressive
    humor_style: dry | sarcastic | physical | none
    verbal_tics: string[]          # 말버릇, 고유 표현
    forbidden_words: string[]      # 절대 사용하지 않는 표현
  
  behavior:
    decision_style: impulsive | analytical | emotional | strategic
    stress_response: fight | flight | freeze | fawn
    body_language_default: string  # 기본 자세/습관 설명
    emotional_processing: external | internal | analytical | destructive

RelationshipSpec:
  character_a: string              # characterId
  character_b: string              # characterId
  type: allies | rivals | mentor_student | romantic | family | nemesis | transactional
  power_dynamic: a_dominant | b_dominant | equal | shifting
  arc:
    start: string                  # "불신하는 낯선 사람"
    end: string                    # "서툰 동맹"
    turning_point_scene: string    # 관계 전환이 일어나는 씬 ID
  subtext: string                  # 표면 아래 숨겨진 관계 본질
  history: string                  # 사전 역사 (있는 경우)
```

## 2. S3 데이터 구조 제안

```yaml
SceneSpec:
  # 기존 (scene.ts Scene 확장)
  sceneId: string
  act: intro | dev | turn | conclusion
  narrativeSummary: string
  originalTextQuote: string
  location: string
  timeOfDay: string
  mood: string
  charactersPresent: string[]
  estimatedDurationSeconds: number

  # S3 확장: 목적/감정/정보
  purpose:
    primary: exposition | conflict | decision | revelation | transformation | transition | setup | payoff | climax | resolution
    secondary: string | null       # 보조 목적
  
  emotion:
    entry: string                  # 씬 시작 감정 상태
    turn: string                   # 감정 전환점 설명
    exit: string                   # 씬 종료 감정 상태
    intensity: 1-10                # 감정 강도
    escalation_pattern: stairs | wave | sudden | slow_burn | contrast
  
  information:
    mode: dramatic_irony | suspense | mystery | surprise | neutral
    audience_knows: string[]       # 관객이 이 시점에 아는 것
    character_knows: Record<characterId, string[]>  # 캐릭터별 아는 것
    revealed_in_scene: string[]    # 이 씬에서 공개되는 정보
    setup_for: string[]            # 이 씬에서 설치하는 것 (미래 회수용)
    payoff_from: string[]          # 이 씬에서 회수하는 것 (과거 설치 참조)
  
  dialogue:
    has_dialogue: boolean
    key_lines: string[]            # 핵심 대사 (원작 보존 or 핵심 전달)
    subtext_note: string           # 표면 vs 실제 의미 메모
    function_priority: exposition | character_reveal | conflict | plot_advance | comic_relief | foreshadow

  character_scene_fit:             # S2xS3 핍진성 검증
    - characterId: string
      action_consistency: string   # 이 캐릭터가 이 씬에서 왜 이렇게 행동하는지
      emotional_state: string      # 이전 씬에서의 감정 상태 이월
      decision_logic: string       # 결정이 있다면, 캐릭터 관점의 논리
      voice_variation: string      # 이 씬에서의 보이스 변화 (있다면 이유)
```

## 3. S2xS3 교차점 검증 규칙

AI 파이프라인에서 S2와 S3 교차 검증 시 자동 체크 항목:

```yaml
BelievabilityCheck:
  character_action:
    - rule: "캐릭터 결정이 psychology.values와 일치하는가"
    - rule: "psychology.decision_style과 결정 패턴이 일치하는가"
    - rule: "이전 씬에서의 감정 상태가 이월되었는가"
    - rule: "아크 진행 단계에 맞는 행동인가"
  
  dialogue_fit:
    - rule: "voice 프로필과 대사 스타일이 일치하는가"
    - rule: "관계 역사가 대사의 서브텍스트에 반영되었는가"
    - rule: "감정 마스킹이 필요한 상황에서 적절히 적용되었는가"
  
  emotional_authenticity:
    - rule: "감정 변화 속도가 현실적인가"
    - rule: "성격별 사건 처리 방식이 일관적인가"
    - rule: "톤 전환이 자연스러운가 (tonal whiplash 방지)"
  
  relationship_dynamics:
    - rule: "권력 다이나믹이 씬 구성에 반영되었는가"
    - rule: "관계 아크 진행이 씬 행동에 반영되었는가"
    - rule: "그룹 씬에서 동맹/고립이 명확한가"
  
  idiot_ball_prevention:
    - rule: "더 명백한 대안이 있다면 왜 선택하지 않았는지 설명 가능한가"
    - rule: "캐릭터의 정보 제한이 행동을 정당화하는가"
    - rule: "감정 상태가 비최적 결정을 정당화하는가"
```

## 4. 현재 파이프라인 대비 매핑

```
현재 파이프라인:
  Character = { id, name, role, description, fixedPrompt }
  Scene     = { id, act, narrative, mood, characters }

제안:
  Character → CharacterSpec (심리/동기/보이스/행동 추가)
  Scene     → SceneSpec (목적/감정/정보/핍진성 검증 추가)
  (신규)    → RelationshipSpec (관계별 독립 엔티티)
  (신규)    → BelievabilityCheck (S2xS3 자동 검증)

매핑 위치:
  S2 입력:  P1(Meeting Room)에서 수집 → P2(Script Room)에서 정교화
  S3 입력:  P2(Script Room)에서 L1 Scene Architect 과정 중 생성
  S2xS3:   L2 Shot Composer가 샷 생성 시 검증
```

## 5. V축과의 교차점 (S2→V, S3→V 자동 매핑)

```
S2 → V 매핑:
  archetype.primary ──> L1 쉐이프 제안
    hero → 안정적/대칭 쉐이프
    shadow → 각진/비대칭 쉐이프
    trickster → 불규칙/유동적 쉐이프
    
  arc.type ──> L2 의상/컬러 아크
    positive_change → 어두운색 → 밝은색
    negative_change → 밝은색 → 어두운색
    flat → 일관된 색상 유지
    
  psychology.wound ──> L3 퍼포먼스 프리셋
    유기 트라우마 → 눈 돌리기, 거리두기, 물리적 긴장
    배신 트라우마 → 경계, 시선 추적, 방어 자세
    
  voice ──> L3 대사 딜리버리
    blunt → 카메라 직시, 짧은 컷
    indirect → 시선 회피, OTS

S3 → V 매핑:
  purpose ──> L3 카메라/편집 레시피
    exposition → 마스터 + MS + 시각적 전달
    conflict → OTS + CU + 빠른 교차
    climax → 전체 레시피 최대 강도
    
  emotion.intensity ──> L3 조명 키:필 비율
    1-3 → 1:1~2:1 (밝고 평화)
    4-6 → 2:1~4:1 (긴장 시작)
    7-9 → 4:1~8:1 (고강도)
    10  → 8:1+ (극단)
    
  information.mode ──> L3 카메라/편집
    dramatic_irony → 관객이 위험을 보는 WS + 캐릭터의 무지 CU
    suspense → 느린 빌드, 정적, 제한된 시야
    surprise → 갑작스런 컷, 리액션 우선
```

---

## 리서치 출처

### 캐릭터 아크
- [12 Types of Character Arcs - Greenlight Coverage](https://glcoverage.com/2024/09/25/types-of-character-arcs/)
- [How to Write Character Arcs - Helping Writers Become Authors](https://www.helpingwritersbecomeauthors.com/write-character-arcs/)
- [5 Types of Character Arc: Negative Arcs - Helping Writers Become Authors](https://www.helpingwritersbecomeauthors.com/learn-5-types-of-character-arc-at-a-glance-the-3-negative-arcs-part-2-of-2/)
- [4 Basic Types of Character Arcs - September C. Fawkes](https://www.septembercfawkes.com/2022/05/the-4-basic-types-of-character-arcs.html)
- [Understanding the 3 Types of Character Arcs - Final Draft](https://www.finaldraft.com/blog/understanding-the-3-types-of-character-arcs)

### 아키타입
- [12 Character Archetypes - Boords](https://boords.com/storytelling/character-archetypes)
- [Character Archetypes: 8 Examples - Story Grid](https://storygrid.com/character-archetypes/)
- [Propp's 7 Character Types](https://media-studies.com/propp/)
- [Carl Jung's 12 Archetypes](https://www.structural-learning.com/post/carl-jungs-archetypes)
- [Archetypal Characters - Spines](https://spines.com/archetypal-characters-in-literature/)

### 캐릭터 동기/심리
- [Character Want vs Need - No Film School](https://nofilmschool.com/character-want-vs-need)
- [Character's Want vs. Need - September C. Fawkes](https://www.septembercfawkes.com/2021/02/characters-want-vs-need-explained-4.html)
- [Want Versus Need: Secret to Character Conflict - The Novel Smithy](https://thenovelsmithy.com/want-versus-need-storytelling/)
- [Villain Motivations - The Novel Factory](https://www.novel-software.com/villain-motivations/)

### 씬 구조/감정 비트
- [Types of Scenes - The Script Lab](https://thescriptlab.com/screenwriting/structure/the-scene/16-types-of-scenes/)
- [Scene Structure and Purpose - Fiveable](https://fiveable.me/screenwriting-i/unit-7/scene-structure-purpose/study-guide/cqm7ZaJtT7PLgoIR)
- [The 4 Emotions in Screenplay Writing - The Story Solution](https://www.thestorysolution.com/the-4-emotions-in-screenplay-writing/)
- [Emotional Beats - Fiveable](https://fiveable.me/key-terms/screenwriting-i/emotional-beats)
- [Pacing Within Scenes - September C. Fawkes](https://www.septembercfawkes.com/2022/03/pacing-within-scenes.html)

### 대사/서브텍스트
- [Creating Unique Character Voices - Greenlight Coverage](https://glcoverage.com/2024/06/14/how-to-give-characters-unique-voices-in-screenplay/)
- [How to Write Dialogue - Novela Studio](https://novela.so/en/blog/how-to-write-dialogue)
- [Dialogue and Subtext in Film/TV - Fiveable](https://fiveable.me/storytelling-for-film-and-television/unit-6)
- [Character Voice and Speech Patterns - Fiveable](https://fiveable.me/writing-the-episodic-drama/unit-5/character-voice-speech-patterns/study-guide/3cBB4VwmceIRxwyw)

### 핍진성/일관성
- [Verisimilitude - Storm Writing School](https://stormwritingschool.com/verisimilitude/)
- [What is Verisimilitude - No Film School](https://nofilmschool.com/verisimilitude)
- [What is Verisimilitude - StudioBinder](https://www.studiobinder.com/blog/what-is-verisimilitude-definition/)

### 정보 관리/극적 아이러니
- [Dramatic Irony in Film - FilmDaft](https://filmdaft.com/how-to-use-dramatic-irony-in-film/)
- [Surprise vs Suspense - EditMentor](https://help.editmentor.com/en/articles/5461285-surprise-vs-suspense)
- [Hitchcock's Suspense](https://somethingsaysthis.wordpress.com/2014/01/09/hitchcocks-suspense-the-sound-and-the-silence/)

### 관계 다이나믹스
- [Character Relationships and Dynamics - Fiveable Advanced Screenwriting](https://fiveable.me/advanced-screenwriting/unit-2/character-relationships-dynamics/study-guide/fnAKU6QXi3palnMt)
- [9 Ways to Approach Relationship Dynamics - Helping Writers Become Authors](https://www.helpingwritersbecomeauthors.com/9-ways-to-approach-relationship-dynamics-in-fiction/)
- [Writing Relationships - September C. Fawkes](https://www.septembercfawkes.com/2015/02/relationship-as-character-crafting-duos.html)

### 바보 공/스마트 캐릭터
- [Idiot Ball - TV Tropes](https://tvtropes.org/pmwiki/pmwiki.php/Main/IdiotBall)
- [Idiot Plot - TV Tropes](https://tvtropes.org/pmwiki/pmwiki.php/Main/IdiotPlot)

### 캐릭터 순간 획득/감정적 진정성
- [Six Stages of Character Development - The Script Lab](https://thescriptlab.com/features/screenwriting-101/10320-the-six-stages-of-character-development-in-screenplays/)
- [Plant and Payoff Scenes - Greenlight Coverage](https://glcoverage.com/2024/10/08/best-plant-and-payoff-scenes-for-screenwriters/)
- [How to Write Grieving Characters - Ryan Lanz](https://ryanlanz.com/2018/10/15/how-to-write-grieving-characters/)
- [Writing Grief Realistically - Story Embers](https://www.storyembers.org/six-tips-for-writing-grief-realistically/)
