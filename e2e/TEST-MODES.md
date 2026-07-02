# 테스트 모드 — Skip / Full

> 이 프로젝트의 검증은 **3층**이다. 아래 두 e2e 모드(Skip/Full)는 vitest 위층에서 **실브라우저·실DB 통합 경계**를 본다.
>
> | 층 | 무엇 | 목업 | 비용 | 언제 |
> |---|---|---|---|---|
> | **단위** (`tests/`, vitest) | 순수 로직·계약(source_hash, 게이트, 컬럼). fal/DB/webhook `vi.mock` | O | 0 | 항상(CI, `pnpm test`) |
> | **Skip e2e** (본 문서) | **이번 세션에 만든 기능만** 실브라우저로 눌러보고 실DB 저장 확인 | X(데이터 스텁만) | 0 | **커밋 전 기본** |
> | **Full e2e** (`README.md` 시나리오) | producer→끝. 실 fal 생성 + 실 webhook | X | $ | 온디맨드(시나리오별) |

핵심 구분: **Skip 은 "내가 방금 만든 것"을 싸게 확인하는 커밋 전 게이트**, **Full 은 파이프라인 전체를 시나리오로 돌리는 비싼 온디맨드 검증**.

---

## Skip 모드 — 커밋 전 기본 점검 (무비용, 에이전트 주도)

### 원칙
1. **대상은 이번 세션 변경분뿐.** 전체 파이프라인을 돌리지 않는다. 변경이 사는 스테이지까지 **지름길(seed + setStage)** 로 점프해서 거기서만 눌러본다.
2. **무목업(기능) + 데이터 스텁(비용).** 검증 대상 라우트·store·DB 는 실제로 돌린다. 단, 그 스테이지 진입 시 자동으로 도는 **비싼 부수효과(fal 이미지 생성)** 는 데이터 스텁으로 막아 **비용 0** 을 보장한다(예: `stubWorld` → `locations.wide_shot/establishing_shot` 더미 → `autoGenerateBaseImages` skip).
3. **판단자는 에이전트.** 기계 assertion 스위트가 아니다. 에이전트가 브라우저를 직접 몰고(버튼 클릭·채팅 입력), 스크린샷 + DB 조회 + 로그로 **정상/이상을 판단**하고 기록한다. → 그래서 Playwright 설치가 전제되지 않는다(헤드리스 에이전트 브라우저 + `harness.mjs` 로 충분).

### 경계 (중요)
- **에이전트 도구 의존**: 브라우저 드라이브는 에이전트의 헤드리스 브라우저로 한다. `harness.mjs` 는 **셋업/조회/정리(DB service-role)** 만 담당한다. 사람이 `pnpm` 한 방으로 통과/실패를 받는 CI 스위트가 아니다.
- **Skip 이 잡는 것**: UI 배선, 컨트롤드 입력 → 저장(PATCH) → 라운드트립, 게이트 진입, 낙관적 갱신. **Skip 이 못 잡는 것**: 실제 이미지 생성·webhook→finalize (그건 Full 몫).

### 절차
전제: `pnpm dev`(:3000) 실행 중. `.env.local` 의 `E2E_EMAIL/E2E_PASSWORD` + `SUPABASE_SERVICE_ROLE_KEY`. (Full 과 달리 ngrok 불요 — 생성 안 함.)

```
# 1) 세션 쿠키 굽기(브라우저 주입용, tmp)
pnpm e2e:db cookies /tmp/e2e-cookies.json

# 2) throwaway 프로젝트 + 대상 스테이지 게이트 오픈 (artist 예시, 비용 0)
pnpm e2e:db newProject "<기능명>"     # → NEW_PROJECT <pid>
pnpm e2e:db skipArtist <pid>          # seedCast + stubWorld + setStage artist
```

3) **에이전트 브라우저**: 쿠키 주입 → `/studio/producer?projectId=<pid>` 로드 → 사이드바로 대상 스테이지 **SPA 진입**(전체 새로고침 직접진입은 store 리셋 레이스 → 금지, README §3).
4) **기능 클릭·입력**: 변경한 버튼/입력/채팅을 실제로 조작. 컨트롤드 입력은 native value setter + `input` 이벤트로.
5) **판단**: `pnpm e2e:db chars/locs/candidates/jobs <pid>` 로 DB 저장 확인 + 새로고침 라운드트립 + 스크린샷. 아래 체크리스트로 통과/실패 판정·기록.
6) **정리**: `pnpm e2e:db rmProject <pid>` (또는 세션 끝에 `pnpm e2e:db pruneSkip` 일괄).

### 판단 체크리스트 (기능 공통)
- [ ] 대상 스테이지에 **변경분이 렌더**되는가(팝업 제거/인라인화 등 의도한 형태).
- [ ] 버튼/토글이 **실제로 동작**하고 시각 상태가 바뀌는가.
- [ ] 입력 → **DB 에 저장**되는가(디바운스 PATCH 등 실제 write 확인).
- [ ] **새로고침(재진입) 후에도 유지**되는가(라운드트립).
- [ ] 진입 시 **의도치 않은 fal 호출 0** 인가(`jobs <pid>` 로 확인).

### 하니스 명령 (skip 전용)
| 명령 | 설명 |
|---|---|
| `newProject [title]` | E2E 워크스페이스에 throwaway 프로젝트 생성 → `NEW_PROJECT <pid>` (제목에 `[e2e-skip]` 마커) |
| `skipArtist <pid>` | `seedCast`+`stubWorld`+`setStage artist` 한 방 (artist 게이트 비용 0 오픈) |
| `stubWorld <pid>` | 로케이션 shot 더미 → autogen fal skip |
| `cookies [outPath]` | E2E `@supabase/ssr` 세션 쿠키 파일로 굽기(기본 tmp) |
| `rmProject <pid>` | throwaway + 자식행 삭제 |
| `pruneSkip` | `[e2e-skip]` 프로젝트 일괄 삭제 |
> 다른 스테이지(writer/director/editor)용 `skipXxx` 는 필요 시 같은 패턴(seed + stub + setStage)으로 harness 에 추가한다.

### 실행 기록
> 세션마다 여기 한 줄. `상태` = `✅ YYYY-MM-DD` / `❌(요약)`.

| 날짜 | 기능(세션 변경분) | 스테이지 | 확인한 것 | 상태 |
|---|---|---|---|---|
| 2026-06-29 | artist 캐릭터 카드 인라인 편집(팝업 제거·역할 토글·설정/외형·+인물) | artist | 새 프로젝트 생성 → producer→artist SPA 진입 → +인물 카드 생성(DB 행) → 이름 인라인 편집 PATCH(카이→카이-E2E) → 역할 토글(protagonist→antagonist) → 설정/외형 입력 저장 → 새로고침 라운드트립. fal 호출 0. | ✅ 2026-06-29 |

---

## Full 모드 — 시나리오 기반 (비용, producer→끝)

producer 부터 **실제 핸드오프 → 실 fal 생성 → 실 webhook → 라이브 DB** 로 파이프라인 전체를 돌린다. 단위/Skip 이 못 잡는 **통합 경계 버그**(webhook→finalize→DB, source_hash null, FK)를 잡는 게 목적. **비용·인프라(ngrok)가 필요하므로 시나리오 단위**로만 돈다.

- **시나리오가 필수다.** "무엇을/어떤 라우트로/무엇을 관찰" 을 미리 표로 고정하고 돌린다.
- 시나리오 레지스트리·실행 절차·인프라(ngrok, 비용 캡, #57 불변식)는 **[`README.md`](./README.md)** 에 있다(현재 S1~S5: artist 이미지 파이프라인).
- 새 파이프라인/스테이지의 Full 검증을 추가하려면 README 레지스트리에 행을 추가하고 harness 에 필요한 구동/시드를 더한다.

Full 을 producer 부터 진짜로 돌리고 싶으면(작가 텍스트 파이프라인 포함) 비용 캡(`failRun`)을 언제 걸지부터 시나리오에 명시한다 — 자가 체이닝 텍스트 파이프라인은 캡 없으면 계속 돈다.

---

## 커밋 전 게이트 규약
- **UI/기능 변경**을 커밋하기 전, 그 변경분에 대해 **Skip 모드 1회**를 돌리고 위 [실행 기록](#실행-기록) 에 결과를 남긴다. 통과 못 하면 커밋하지 않는다.
- 단위(`pnpm test`)·타입·린트는 그대로 병행(기존 규약).
- Full 은 커밋 게이트가 아니다(비용) — 통합 경계를 건드린 변경일 때 온디맨드로 해당 시나리오만 돌린다.
