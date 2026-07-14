# 스타일 앵커 vs 텍스트 재료어 권위 — 후속 수정 제안 (검증용)

> 2026-07-14 · 상태: **제안(설계)** · 다음 세션 검증/구현 대기 · **미구현**
> 부모: `docs/style-anchor-injection.md` (§4 충돌 규칙 · §8 Q3 결과). 이 문서는 §8 Q3 실패의 후속 결정.
>
> **한 줄**: 스타일 앵커(그림체를 정하는 견본 이미지)와, 프롬프트에 들어가는 텍스트 재료어(`texture: photorealistic` 등)가 **"재료(그림체)를 누가 정하냐"를 놓고 담당이 겹친다.** 충돌 시 현재는 **텍스트가 이겨서** 앵커가 무시된다. 이 문서는 담당을 앵커 쪽으로 넘기는 최소 수정을 제안한다.
>
> **범위**: 백엔드 프롬프트/토큰만. UI 피커·프로듀서 흐름은 비목표(부모 문서와 동일).

---

## 1. 문제 (근본 원인 = 역할 겹침)

"이 그림을 어떤 **재료/그림체**로 그릴지"를 두 입력이 동시에 주장한다:

1. **스타일 앵커 이미지** — `image_urls[0]` + 앵커 지시절. **원래 이게 재료 담당.**
2. **텍스트 재료어** — 프롬프트 본문에 이미 박혀있는 `texture: photorealistic` 류.

앵커 설계 의도는 **직교**였다(앵커=재료, 텍스트=분위기/색). 하지만 실제 텍스트 한 칸이 재료를 들고 있어서 담당이 겹치고, **충돌 시 텍스트가 이긴다**(§8 Q3 실측: watercolor 앵커 + "photorealistic" 텍스트 → 출력 실사).

### 실 데이터 (2026-07-14 확인, 프로젝트 4개 샘플)

| 토큰(design_tokens.l1) | 실제 값 예시 | 성격 | 앵커와 충돌? |
|---|---|---|---|
| `art_style` | `noir`, `cinematic_sci-fi`, `steampunk_noir`, `dark_fantasy_cinematic` | **분위기/장르** | ✗ (매체 아님 — 유지) |
| `texture_philosophy` | `photorealistic`, `painterly_pbr` | **재료/렌더링** | ✅ **범인 후보 1** |
| `line_quality` | `clean`, `variable_weight` | 선 처리 | △ (수채=부드러운 경계와 충돌 가능 — A/B로 확인) |
| `shape_language` | `angular` | 형태 | ✗ (디자인 — 유지) |
| `palette` | 색 목록 | 색 | ✗ (앵커는 색 안 담음 — 유지) |

**⚠️ 정직한 주의:** §8 Q3 실험은 편의상 `art_style`에 `"photorealistic live-action"`이라는 **실제엔 안 쓰는 값**을 넣고 돌렸다. 방향("텍스트 재료어가 앵커를 이긴다")은 맞지만, **진짜 범인은 `art_style`가 아니라 `texture_philosophy`**로 보인다. 실제 조합으로는 아직 A/B를 안 했다(→ §4).

### 어느 경로가 재료어를 넣나 (실측)

- **캐릭터 시트 (`generate-sheet`)**: `CharacterPromptInput.texturePhilosophy = dt.l1.texture_philosophy` → `styleTokens()`가 `texture: photorealistic` **확정 주입**. → **주 수정 대상.**
- **draft-trigger**: promptInput = `{name, appearance, role}`만 → 재료어 없음 → **무관.**
- **배경 (`buildWorldShotPromptForLocation`)**: design_tokens가 아니라 **로케이션별 writer 텍스트**(`location.styleDescription`)를 씀. 매체어 포함 여부는 콘텐츠 의존 → **별개·약함** (확인 필요, §8).
- **샷/스토리보드 (director)**: **확인 필요** — director 프롬프트가 재료어를 넣는지 미확인.

---

## 2. 제안 프롬프트 절 (verbatim — 옵션 A: 말로만)

가장 싼 수정. `src/lib/style-anchor.ts`의 `STYLE_ANCHOR_CLAUSE`에 **권위 문장 한 줄 추가**(앵커가 재료의 유일 authority임을 못 박음):

```
If the text description names a different art medium, rendering style or texture
(e.g. "photorealistic", "photo", "3D render", "PBR"), IGNORE those words — the FIRST
reference image is the SOLE authority on art medium, rendering technique and texture.
Keep only the text's subject, character identity, mood, genre and color intent.
```

- 기존 절 뒤에 이어 붙인다(앵커 있을 때만 나가므로 no-op 불변).
- 이거만으로 모델이 앵커를 우선할 수 있음 → **A/B에서 제일 먼저 시험**(§4).
- `applyStyleAnchor`가 절을 조립하므로 상수만 바꾸면 4개 주입 지점에 자동 반영.

---

## 3. 토큰 억제 규칙 (옵션 B: 범인 쪽지 빼기 — A만으로 부족할 때)

앵커가 있을 때, 캐릭터 프롬프트에서 **재료어 토큰만** 빼고 분위기/색/형태는 유지.

**규칙**: `generate-sheet` 라우트에서 `CharacterPromptInput` 조립 시, 앵커가 있으면(`project.style_anchor_key` 존재) 아래를 생략:
- `texturePhilosophy` → 생략 (확정 범인)
- `lineQuality` → **A/B 결과에 따라** 생략 (수채 등 부드러운 경계와 충돌 시)
- `artStyle`(분위기)·`palette`·`shapeLanguage`·`characterProportion` → **유지**

```ts
// src/app/api/artist/generate-sheet/route.ts — input 조립부 (anchor 먼저 resolve 후)
const suppressMedium = !!anchor  // 앵커 있을 때만
const input: CharacterPromptInput = {
  ...,
  artStyle: dt.l1?.art_style,               // 분위기 — 유지
  shapeLanguage: dt.l1?.shape_language,       // 형태 — 유지
  lineQuality: suppressMedium ? undefined : dt.l1?.line_quality,       // A/B 결정
  texturePhilosophy: suppressMedium ? undefined : dt.l1?.texture_philosophy, // 범인 — 억제
  palette,                                    // 색 — 유지
  ...,
}
```

**원칙(부모 문서와 동일):**
- **비파괴**: 저장된 `design_tokens`는 안 건드림. 앵커 떼면 텍스트 원상복구.
- **생성 시점**에서만 처리(피커 UI 불요). "고를 때 저장값 덮어쓰기"는 **비목표**(§6).
- **no-op 불변**: 앵커 없으면(`style_anchor_key=null`) 바이트 동일 — 기존 `tests/style-anchor-noop.test.ts` 그대로 그린이어야 함.

---

## 4. 우선순위 — 실 A/B 먼저 (범인 토큰 확정)

**§8 Q3는 가짜 값으로 돌렸으니, 실제 조합으로 먼저 재본다.** `scripts/_anchor-exp3.mjs`를 확장(또는 유사 인라인)해 실제 토큰을 넣고 생성:

기준선(현행) 프롬프트 = `art style: noir` · `line quality: clean` · `shape language: angular` · **`texture: photorealistic`** · `palette: ...` + watercolor 앵커.

| # | 조건 | 목적 |
|---|---|---|
| C0 | 현행 그대로 (모든 토큰 + 앵커) | **진짜 문제인지 확인** (실사로 나오면 문제 확정) |
| C1 | + 옵션 A 문장(권위 절) | 말만으로 앵커가 이기나 |
| C2 | `texture` 토큰 제거 | 범인이 texture 하나였나 |
| C3 | `texture` + `line_quality` 제거 | line_quality도 범인인가 |

각 조건 ≥2회, 3항 루브릭(① 수채 채택 ② 캐릭터 정체성 ③ 아티팩트). **가장 싼 통과 조건을 채택** (C1 통과면 옵션 A만; 아니면 C2/C3의 최소 억제).

---

## 5. 검증 (구현 후)

- **A/B**: §4 조건표 결과를 `docs/style-anchor-injection.md` §8 하단(또는 본 문서)에 기록.
- **자동 테스트**:
  - no-op 회귀: `tests/style-anchor-noop.test.ts` 그대로 그린 (앵커 없으면 프롬프트 바이트 동일).
  - 신규: 앵커 있을 때 `generate-sheet`가 만든 프롬프트에 `texture:` (억제 대상)가 **없고**, `art style:`(분위기)·`palette:`는 **있음**을 assert. 옵션 A면 권위 문장이 절에 포함됨을 exact-string assert.
  - 전 스위트 + `pnpm typecheck` 그린.

---

## 6. 비목표

- **"고를 때 저장값(design_tokens)을 앵커 매체로 덮어쓰기"** — 원본 분위기(noir) 파괴 + 되돌리기 불가 + 피커 UI 의존. 채택 안 함.
- **분위기/장르(`art_style`)·색(`palette`)·형태 제거** — 앵커는 이것들을 안 담으므로 반드시 유지. 재료어만 억제.
- **UI/프로듀서 배선** — 부모 문서와 동일하게 비목표.
- **배경/샷 경로 전면 개편** — world는 writer 텍스트라 별개(§8). 필요 시 같은 원칙으로 별도 처리.

---

## 7. 코드 포인터

- 앵커 절 상수: `src/lib/style-anchor.ts` (`STYLE_ANCHOR_CLAUSE` — 옵션 A 문장 추가 지점)
- 재료어 방출: `src/lib/artist/turnaround.ts` `styleTokens()` (`texture: ${texturePhilosophy}`, `line quality: ...`, `art style: ...`)
- 캐릭터 입력 조립(억제 지점): `src/app/api/artist/generate-sheet/route.ts` (`CharacterPromptInput`; anchor는 `resolveStyleAnchorByKey`로 이미 resolve됨 — input 조립 전에 두면 됨)
- 배경(별개·writer 텍스트): `src/stores/artist-store.ts` `buildWorldShotPromptForLocation` → `src/lib/prompts.ts`
- 실험/검증: `scripts/_anchor-exp3.mjs` (§4 조건으로 확장)
- 룩 지문 영향 없음: 재료어 억제는 프롬프트만 바꿈. `computeLookFingerprint`(Q5)는 그대로.

---

## 8. 열린 질문 (A/B가 결정)

- **범인 토큰 범위**: `texture_philosophy`만인가, `line_quality`도인가? (△ 표시 — C2 vs C3)
- **옵션 A만으로 충분한가**: 권위 문장만으로 앵커가 이기면 토큰 억제 불필요(가장 싸다).
- **배경/샷 표면**: `location.styleDescription`/director 프롬프트에 매체어가 실제로 들어가 충돌하는가? (별도 확인)
- **실사 앵커 + 실사 텍스트**: 동일 매체면 충돌 없음(억제 skip해도 무해). 억제를 "앵커 매체 ≠ 텍스트 매체"로 좁힐지, "앵커 있으면 무조건"으로 할지 — 후자가 단순·안전(권장).
