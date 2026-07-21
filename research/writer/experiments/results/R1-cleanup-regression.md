# R1 — W그룹 청소 회귀 배터리 결과

> 실행일: 2026-07-21 · 실행: 서브에이전트(Sonnet) ×2 (before/after) / 판정: Claude(Fable) · 상태 판정: **✅ 통과 — W1~W5 채택 (악화 지표 0)**
> 모델: gemini/gemini-3-flash-preview 고정 (before/after 동일) · 원시 로그: `logs/writer-stage-exp/*__before{1,2}.json`, `*__after{1,2}.json`, S축 before는 E3a의 `*__run{1..3}.json`
> 대상 변경: W1(물리 상수 단일 소스 `physics.ts` 주입 — decoupage/v4/v5, "5~15초" 삭제) · W2(V4 죽은 지시 2건 제거) · W3(S0/S2 명칭·V0 서사 정리) · W4(genre.format→화면비 코드 고정) · W5(V5 자수 정렬). 전부 워킹트리, `tsc` 통과.

## 1. 판정 기준 (사전 확정)

4 프리셋 × 지표에서 **악화 지표 0개면 통과**. 특히: 구조 선택 유지 / M1 유지 / duration >8s 미발생 유지 / 프롬프트 자수 동등 이상.

## 2. 비교표

### A. S축 (narrativeStructure + scenes)

| preset | 지표 | before | after | 판정 |
|---|---|---|---|---|
| shorts | structure/acts/씬수/M1 | 3-act / 3 / 3씬 / 0.0% (3run 동일) | 3-act / 3 / 3씬 / 0.0% | 동일 ✓ |
| ad |〃 | 3-act / 3 / 3씬 / 0.0% (3run) | 3-act / 3 / 3씬 / 0.0% | 동일 ✓ |
| kishoten | 〃 | kishōtenketsu / 4막 (선행 세션 — 씬 데이터 없음) | kishōtenketsu / 4막 / 4씬 / 0.0% | 구조 유지 ✓ (씬은 신규 베이스라인) |
| loop | 〃 | circular (선행 세션) | circular / 3막 / 3씬 / 0.0% | 구조 유지 ✓ |

### B. V축 (ad 풀체인 — decoupage + shotDesign, 스텁 비주얼)

| 지표 | before1 | before2 | after1 | after2 | 판정 |
|---|---|---|---|---|---|
| dec 샷수 (added/merged/split) | 13 (6/0/1) | 12 (4/0/5) | 12 (4/0/6) | 12 (2/0/4) | 동등 (자연 분산) |
| dec dur min/med/max | 2/2/3 | 1/2/4 | 1.5/2.5/4 | 1.5/2.5/3.5 | 동등 ✓ |
| dur >8s / >10s | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 유지 ✓ |
| v4 샷수 | 13 | 12 | 12 | 12 | 동등 |
| motion 자수 med (50~80 이탈) | 68 (7건: 23~93 양방향) | 73.5 (1건: 85) | 82 (8건: 81~93 상방) | 69.5 (0건) | 동등 (아래 §3-②) |
| ff 자수 med (200~400 이탈) | 289 (0) | 339.5 (0) | 296 (0) | 291 (0) | 유지 ✓ |
| 스테이지 에러 | 0 | 0 | 0 | 0 | 유지 ✓ |

## 3. 판정과 관찰

- **통과.** 구조 선택·M1·duration 대역·ff 자수·에러 전부 동등 이상. 청소가 산출 행동을 바꾸지 않았다 — 죽은 문구 제거가 목적이었으니 이게 정확히 기대 결과.
- 관찰 ① (기존 고질, 청소와 무관): **duration 하한(2s) 미만 샷이 before/after 모두 존재** (before min 1s, after min 1.5s). 하한은 validator에 없음 — 추후 검증 코드 후보.
- 관찰 ② (기존 고질): **motion 자수 이탈은 양쪽 모두 존재** — 총 이탈률 before 8/25(32%) vs after 8/24(33%), 방향성 없는 run 간 분산(after2는 0건). 상한 80자를 81~93으로 살짝 넘는 패턴. 회귀 아님. 개선하려면 프롬프트가 아니라 자수 검증 코드(+1회 교정) — E1 또는 별도 소청소 후보.

## 4. 데이터 위생 고지

- after의 `ad__narrativeStructure__after1.json`·`ad__scenes__after1.json`은 A(S축 단독)와 B(풀체인 run1)가 같은 경로를 공유해 **B가 A의 raw를 덮어씀** — A-ad 행 수치는 덮어쓰기 전 집계라 정확하나 A-ad 원본 JSON은 유실. 교훈: **다음 배터리부터 보존 접미사에 배터리 구분을 포함** (`__afterA1`/`__afterB1` 식). `__before*`/`__run*`은 무손상.

## 5. 후속 조치

- W1~W5 채택 확정 (커밋은 사용자 지시 시).
- 계획서 상태 표 갱신: W1~W5+R1 ✅.
- 파생 소항목: duration 하한·motion 자수 검증 코드(관찰 ①②) — E3b 구현 시 scenes 검증 코드와 함께 얹는 것이 자연스러움.
