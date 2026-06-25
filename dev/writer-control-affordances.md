# Writer 러프보드 — Control Affordance 딥다이브 (방향 칩의 발전)

> 상태: 리서치/설계 노트 (캐넌 아님). 2026-06-25 작성.
> 맥락: writer 탭 러프 스토리보드에 "방향 칩"(seed 변주 + Emphasis 주입)을 MVP로 넣은 직후,
> 칩의 flavor text가 임의로 정해진 것이라 발전 여지를 정리한 문서.
> 코드 진실: `src/lib/writer/rough-storyboard.ts`, `src/app/api/writer/rough-storyboard/route.ts`,
> `src/features/writer/shot-detail-dialog.tsx`, `src/lib/writer/shot-config-from-design.ts`.

## 0. 한 줄 요약

방향 칩의 진짜 역할은 *기능*이 아니라 **"이런 걸 조정할 수 있다"를 가르치는 control 온보딩의 첫 계단**이다.
가장 본질적 발전은 칩 개수를 늘리는 게 아니라, 임의 flavor text를 **시스템이 이미 가진 control 축
(shot_type / 6축 camera / lighting)에 정합**시키고, 사용자를 더 세밀한 control(슬라이더·채팅)로 자연스럽게
끌어올리는 progressive disclosure를 설계하는 것이다. 단 **rich 경로의 spec 우선 구조**가 그 정합의 선행 장벽이다.

## 1. 근본 문제 재정의 — control은 두 축이다

사용자가 이미지를 통제하지 못하는 원인은 "프롬프트를 못/안 쓴다"이지만, 이를 두 축으로 분해해야 해법이 보인다.

| 축 | 사용자가 원하는 것 | 해결 수단 |
|---|---|---|
| **Exploration (변주)** | "같은 의도, 다른 느낌을 더 보고 싶다" | seed 변주 (재생성 = 다시 굴리기) — *구현됨* |
| **Steering (방향)** | "더 어둡게 / 더 가까이 / 더 긴장감 있게" | 방향 칩 / 슬라이더 / 채팅 |

핵심: **사람은 백지(blank prompt)를 못 채운다.** Steering의 장벽은 "감 없음/귀찮음"이 아니라 빈 입력창의
막막함이다. 그래서 해법의 공통 원리는 **"명세(specification)를 요구하지 말 것"** — 쓰게 하지 말고, 고르게/누르게 한다.

## 2. 현재 상태 (MVP)

- **칩**: `shot-detail-dialog.tsx`의 `DIRECTION_CHIPS` 6개 (더 어둡게/밝게/가까이/넓게/역동적/차분).
  label(사람 말)·hint(영문 수식어) 쌍. 둘 다 **임의로 정함** — 작동하는 최소 버전이지 최적 아님.
- **효과 경로**: 칩 클릭 → force 재생성(seed 변주) + hint를 프롬프트 **끝**에 `Emphasis: …` 절로 주입
  (`rough-storyboard.ts`의 `emphasisClause`).
- **미검증 리스크**: klein은 앞쪽 토큰에 강하게 반응한다(코드 주석). `Emphasis`가 프롬프트 끝이라 **효과가 약할 수 있음.**

## 3. 발전 축 ① — 내용: 임의 flavor → 시스템 축 정합

이 파이프라인은 이미 구조화된 control 축을 갖고 있다: `shots.shot_type`(EWS~ECU), 6축 `camera_config`
(-10~+10, `kling.ts` 의미론), `lighting_config`(position/brightness/colorTemp). 칩을 자유 텍스트가 아니라
이 축에 매핑하면 임의성이 사라지고, 효과가 빌더 차원에서 확정되며, 중첩·되돌리기가 가능해진다.

### 3.1 매핑 후보

| 칩 | 시스템 축 | 비고 |
|---|---|---|
| 더 가까이 / 더 넓게 | `shot_type` 한 단계 이동 (MS↔MCU↔CU↔ECU / MS↔FS↔WS↔EWS) | 이산적, 가장 명확 |
| 더 어둡게 / 더 밝게 | `lighting`(brightness↓/colorTemp↓ 또는 quality=hard) | 연속적 |
| (로우/하이 앵글) | `camera` pan(pitch) | 6축 |
| 더 역동적 / 더 차분 / 더 긴장감 | — (단일 축 매핑 애매) | **추상 — 텍스트 수식어 유지** |

→ 결론: **하이브리드**. 구조적 방향은 파라미터 조정, 추상 방향은 프롬프트 수식어. 모든 칩을 억지로
파라미터화하지 않는다.

### 3.2 ⚠️ 핵심 장벽 — rich 경로의 spec 우선 (비대칭)

칩을 DB 파라미터로 매핑하려 할 때 부딪히는 구조적 사실:

- **`buildFromSpec`(rich 경로)**: camera_angle·lens·lighting을 **shotDesign state spec**에서 읽는다.
  DB의 `camera_config`/`lighting_config`를 **읽지 않는다.**
- **`buildFromDbRow`(fallback 경로)**: `camera_config.pan`·`lighting_config.position`을 **DB에서** 읽는다.
- **`shot_type`만 예외**: 두 경로 모두 **DB `shots.shot_type` 우선**(2026-06-24 수정).

따라서 발전의 효과가 축마다 비대칭이다:

| 칩 종류 | DB 수정 시 rough 프롬프트 반영? |
|---|---|
| `shot_type`(가까이/넓게) | ✅ 즉시 반영 (경로 무관, 기존 수정 덕) |
| `camera`/`lighting`(어둡게/앵글) | ❌ rich 샷은 spec 우선이라 **무시됨** |

즉 **"칩을 camera/lighting 파라미터로 매핑"은 그 자체로는 rich 샷에 효과가 없다.** 선행 설계가 필요하다:

1. **(권장) 빌더가 DB config를 spec 위 오버레이로 읽기** — rich 경로에서도 사용자가 만진 DB 값이 있으면
   spec보다 우선. `shot_type`에 한 것과 같은 패턴을 camera/lighting으로 확장. *원천/파생 정합(`architecture §5`):
   spec=파생(상류), DB 사용자 편집=하류 사람 결정 → 하류가 우선.*
2. **칩이 state spec을 직접 수정** — writer_runs.state는 읽기 캐리어라 부적합(증발·재실행).
3. **(현재) 프롬프트 텍스트 주입(Emphasis)** — 경로 무관하게 단순. 그래서 MVP가 이걸 택한 건 우연이 아니라
   합리적 우회였다. 단 효과가 빌더 통제 밖(LLM 해석)이라 약할 수 있다.

> 정리: shot_type 칩은 지금 당장 파라미터화 가능(이미 반영됨). camera/lighting 칩은 **(1) 오버레이 읽기**를
> 먼저 깔아야 의미가 있다. 이 비대칭을 모르고 "칩을 파라미터로" 일괄 전환하면 절반은 조용히 안 먹는다.

## 4. 발전 축 ② — 메커니즘: 고정 칩 → 맥락 적응 / 에이전트

- **맥락 적응**: 이미 ECU인 샷에 "더 가까이"는 무의미. 현재 `shot_type`을 보고 **가능한/유용한 방향만** 노출
  (현재 상태의 경계에서 disable 또는 반대 방향만 제시).
- **LLM 동적 제안**: 칩을 고정하지 말고, 샷 내용·맥락을 보고 "이 컷엔 이 조정이 좋겠다"를 채팅 코파일럿이
  먼저 제시. `architecture §5`의 *"자동화하지 않은 빈자리가 에이전트의 일자리"* 와 정확히 맞물린다.
- **누적/토글**: "더 어둡게" 두 번 = 더 어둡게. 단 상대 조정 누적은 상태(샷별 modifier 스택) 저장이 필요해
  복잡도가 오른다 — 파라미터화(축 값) 이후에 자연히 풀린다(값은 누적 가능, 텍스트는 어렵다).

## 5. 큰 그림 — Control 온보딩 사다리 (progressive disclosure)

칩을 독립 기능이 아니라 **control 어휘를 가르치는 첫 계단**으로 본다:

```
[1] 재생성 버튼   — 변주 (아무것도 안 정함, 그냥 굴림)
[2] 방향 칩       — 원클릭 상대 조정 (방향만 안다)   ← 현재 MVP
[3] director 6축 슬라이더 — 정밀 수치 (축을 안다)
[4] 채팅          — 자연어 의도 (말로 다 한다)        ← 이미 구현됨
```

- 칩이 "무엇을 조정할 수 있는지"를 가르치고(discoverability), 익숙해지면 [3]/[4]로 자연스럽게 올라탄다.
- **일관성 기회**: [2]의 축과 [3] director 슬라이더의 축이 같은 어휘를 쓰면(둘 다 6축 camera/lighting),
  사용자가 한 번 배운 어휘가 탭을 건너 통한다. `architecture §4`의 *"같은 진실의 이중 기록 금지"* 와도 맞다.
  → 이것이 "칩을 시스템 축에 정합"시켜야 하는 또 다른 이유.

## 6. 로드맵 / 우선순위

원칙: **"발전 가능" ≠ "지금 필요".** 임의 flavor라도 *작동하면* 현재 목적엔 충분할 수 있다. 정교화는 과설계 위험.

1. **검증 먼저** — 현재 Emphasis 방식이 실제로 먹히는지 fal 직접 실험(칩 hint로 생성, before/after).
   *데이터가 정교화를 정당화하기 전에 만들지 않는다.*
2. **약한 축만 승격** — Emphasis가 약하게 먹히는 축부터 파라미터로. 가장 쉬운 건 `shot_type`(이미 반영 경로 있음).
3. **camera/lighting 파라미터화는 §3.2 오버레이 읽기 선행** — 빌더(rich)가 DB config를 우선 읽도록 깐 뒤.
4. **맥락 적응 / LLM 동적 칩** — 사용량·피드백이 정당화할 때.

## 7. architecture 정합 체크

- `§4 이중 정의 금지`: 칩 축 ↔ director 6축이 같은 control 어휘 → 통합 시 정합, 분기 시 위반. 정합 방향으로.
- `§5 원천/파생`: rough 프롬프트의 spec=상류 파생물, 사용자 칩 조정=하류 사람 결정 → **하류 우선(오버레이)**이 §5 정신.
- `§3 모델은 제안만`: LLM 동적 칩을 넣더라도 "제안"까지. 실제 적용은 사용자 클릭(명시적 apply) 유지.

## 8. 열린 질문

- Emphasis(텍스트 주입) vs 파라미터(축 값)의 효과 차이 — **실측 필요**. klein 9b가 프롬프트 끝 절을 얼마나 반영하나?
- camera/lighting 오버레이를 깔면 `shot-config-from-design.ts`(shotDesign→DB 근사, director용)와 방향이
  충돌/중복하지 않는가? (한쪽은 spec→DB 채움, 다른 쪽은 DB→프롬프트 읽기 — 합류 지점 점검 필요)
- 칩 라벨은 일상어("더 어둡게")가 맞나, 영화 용어("로우키")로 교육하나? 타겟(프롬프트 감 없는 B2B)엔 일상어 +
  툴팁 전문어가 절충으로 보임.
