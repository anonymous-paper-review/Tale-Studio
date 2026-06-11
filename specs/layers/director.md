# Director Canvas — P4 노드 그래프 재설계

> P4 The Set을 패널 UI에서 React Flow 기반 노드 그래프로 전면 재설계.
> Writer Scene/Shot 단방향 seed → Director 캔버스에서 카메라/조명/렌즈 설정 + 영상 생성.

## 역할

Writer가 정의한 Scene-Shot 구조 위에서, 각 Shot의 카메라/조명/렌즈 설정을 조정하고 영상을 생성하는 그래프 워크스페이스. Artist의 L0 Concept Canvas가 *이미지 기반 스토리보드*라면, Director Canvas는 *영상 기반 스토리보드 + 디렉팅*.

```
Writer Scene/Shot → [Director Canvas] → Editor 타임라인
                          ↓
                    Camera/Light Preset Library
```

**UX 매핑**: P4 The Set 전면 교체 (`specs/ux_pages.md` P4)
**선행 코드**: 샷·프롬프트 파이프라인은 `src/lib/writer/pipeline/` + `src/app/api/director/generate-shots/`; Director Canvas 패턴은 Director-only (Artist는 카드형 패널, `src/features/artist/`)
**기술**: React Flow (xyflow), Zustand 그래프 스토어

---

## 1. 워크스페이스 레이아웃

실제 레이아웃 구현 → `src/app/studio/director/page.tsx`.

요약: 무한 캔버스(React Flow) + 우측 GlobalChat 패널 + 하단 PaletteBar (Node/Storyboard 토글).

---

## 2. 노드 종류

노드 타입 열거 → `src/types/director.ts` (`DirectorNodeKind`).
구현 컴포넌트 → `src/features/director/canvas-nodes/`.

### 2.1 노드 색상 매핑 (결정, 2026-05-25)

의미 기반 매핑: **구조(주황) → 작업(녹) → 결과(빨강계)**.

| 노드 | 토큰 | 의도 |
|------|------|------|
| Scene | `--chart-3` (warm orange) | 상위 컨테이너 — 채도는 있되 시선의 핵심은 아님 |
| Shot | `--chart-4` (vivid green) | 작업 중심 — 가장 눈에 잘 띔 |
| Video | `--chart-5` (red orange) | 결과물 — take 변주가 누적될 때 시각적 변별 |

### 2.2 색 사용 룰

> 옛 "Artist 노드와의 색 충돌 완화" 표는 Artist 노드 그래프 폐기(2026-06-04 카드형 롤백)로
> 충돌 자체가 소멸해 삭제. 살아있는 룰만 유지:

- Director 캔버스 안에서 `--chart-4`는 Shot 외 사용 금지.
- Final 마킹 컬러는 chart-4 금지 — `--primary` 사용.

---

## 4. Scene 노드

### 4.1 역할

Writer 단계에서 정의된 Scene을 시각적으로 표시하는 컨테이너. Scene 자체는 영상 생성 단위가 아니라 *그룹화 + 메타데이터* 역할.

구현 → `src/features/director/canvas-nodes/SceneNode.tsx` + `src/features/director/canvas-popups/SceneNodePopup.tsx`.

---

## 5. Shot 노드 (핵심)

### 5.1 역할

영상 생성의 실제 단위. Artist에서 만든 이미지를 받아 카메라/조명/렌즈 설정을 부여해 영상으로 변환하는 출발점.

구현 → `src/features/director/canvas-nodes/ShotNode.tsx` + `src/features/director/canvas-popups/ShotNodePopup.tsx`.

---

## 6. Video 노드

### 6.4 Branch 옵션 (현재 결정)

사용자 의도: "기본 노드는 샷 단위, 설정 기반 재생성으로 충분".
따라서 **Branch 옵션 모달은 없음**. Shot의 Branch는 항상 새 Video 노드 1개를 만들고, 사용자가 NodePopup에서 어떤 설정을 다르게 할지 결정.

> Future: "조명 변주 / 카메라 무브 변주 / 렌즈 변주" 같은 프리셋 변주 템플릿이 필요해지면 BranchOptionModal 추가.

구현 → `src/features/director/canvas-nodes/VideoNode.tsx` + `src/features/director/canvas-popups/VideoNodePopup.tsx` + `src/types/director.ts`.

---

## 7. 핀 + 엣지 + 관계

엣지 카테고리(`parent` / `references` / `relates-to`)와 RelationModal 계약 → `src/features/director/canvas-edges/CategoryEdge.tsx` + `src/features/director/canvas-popups/RelationModal.tsx`.

---

## 8. Writer → Director Sync

Writer 구조가 Director 캔버스의 seed — 1회 로드, **단방향** (Writer → Director create-only, decision #45). Director→DB write-through. Writer에는 UI 없음 (decision #38).

구현 → `src/features/director/hooks/use-writer-director-sync.ts` (doc comment이 계약); `src/stores/director-store.ts` write-through 참조.

---

## 9. Real-time Propagation (Shot → Video)

### 9.1 핵심 원칙

- **전파 대상**: prompt / 카메라 / 조명 / 렌즈 / 참고 이미지
- **전파 범위**: 직계 Video 자식
- **자동 재생성 없음**: stale 배지만 표시. 사용자가 Video 노드에서 "재생성" 클릭해야 새 영상 생성 (토큰 비용 보호)

구현 → `src/stores/director-store.ts`.

---

## 10. Camera/Light Preset Library (Palette)

### 10.2 등록 조건 (결정 #5 근거)

사용자 명시적 액션. 임계 조건 없음.

> 사유: Director 프리셋은 *사용자 의도가 명확한 시점*에 즉시 저장하는 게 자연스럽다 (i.e. "이 셋업 마음에 든다" 순간).

프리셋 저장소: **DB 백엔드** (`camera_light_presets` 테이블), localStorage 금지 (decision #46).

구현 → `src/stores/preset-storage-store.ts` + `/api/director/presets`.

---

## 11. Artist Asset Storage 연동

### 11.1 참조 방향

Director는 Artist Asset Storage를 *읽기 전용*으로 소비. Shot NodePopup의 "등장 캐릭터/월드" 셀렉터에서 `assetStorageStore` 호출.

### 11.2 미등록 캐릭터 안내

⚠️ **미구현, forward**: Artist에서 아직 등록 안 된 캐릭터를 Shot에 쓰고 싶을 때:
- "등록된 캐릭터가 없어요. Artist 단계에서 먼저 등록해 주세요" 안내 + Artist 페이지 link
- 미등록 상태에서 Shot 생성 자체는 막지 않음 (Shot은 자체 프롬프트로도 동작)

---

## 12. Meeting Room — 5-Agent

### 12.1 패턴

`global-chat-store` 재사용. Director 페이지에서는 기본 agent = `director`. 구현 → `src/components/layout/global-chat.tsx`.

DirectorCanvasUpdate union 실제 타입 → `src/stores/director-store.ts` + `/api/director/chat`.

Warm starting 구현 → `src/features/director/hooks/use-director-warm-starting.ts`.

캔버스 컨텍스트 직렬화 → `serializeDirectorCanvasContext` in `src/stores/director-store.ts`.

---

## 13. 캔버스 인터랙션

인터랙션 전체 목록 → `src/app/studio/director/page.tsx` + `src/features/director/**` 코드.

---

## 14. 노드 삭제 cascade

삭제 정책 구현 → `src/stores/director-store.ts` (`deleteNode`) + `DeleteConfirmModal`.

---

## 15. Persistence

DB 단일 진실(`hydrateFromDb`). 노드 위치·씬/샷 메타·프리셋 모두 DB 영속화. LocalStorage는 캐시 전용(고정 키) (decision #48).

구현 → `src/stores/director-store.ts`.

---

## 16. Editor 핸드오프

| 시점 | 동작 |
|------|------|
| 사용자가 "Head to Editor →" 클릭 | 각 Shot에서 Final ★ 마킹된 Video 1개씩을 Editor `clips[]`에 export |
| Final 마킹 없는 Shot | export 시 경고 토스트: "Shot N개에 Final이 지정되지 않았어요. 마지막 테이크가 들어갑니다" (fallback: 가장 최근 Video) |
| Final 마킹 정책 | **Shot당 Final 1개 강제** (결정 #11). 사용자가 새 Video에 ★ 누르면 같은 Shot의 기존 ★ 자동 해제 |

⚠️ Final 선택 export는 미배선 (HandoffButton은 네비게이션만, editor는 `shots.video_url` 사용) — forward design.

---

## 17. 결정 사항

| # | 결정 | 근거 |
|---|------|------|
| 1 | React Flow 채택 | 학습 비용 0. (당시 근거 "Artist와 동일"은 Artist 카드형 롤백으로 소멸 — 캔버스는 현재 Director 전용) |
| 2 | Scene → Shot → Video 3-tier 계층 | 사용자 명시. Shot이 영상 생성 단위 |
| 3 | Branch = 새 Video 테이크 (옵션 모달 없음) | 사용자 의도 "샷 단위 + 설정 기반 재생성" |
| 4 | 등록 = Camera/Light Preset Library | 사용자 명시. Artist의 "캐릭터 등록"과 다른 도메인 |
| 5 | 등록 임계 조건 없음 | Director 프리셋은 의도 명확 시점에 즉시 저장이 자연스러움 |
| 6 | ~~Writer ↔ Director 양방향 sync~~ → **단방향 seed로 번복** | 원결정(양방향, last-write-wins)은 decisions #44에서 D-4 폐기, #45 단방향 채택. 현행 계약은 §8 |
| 7 | references 엣지는 논리적 (Artist 캔버스 외부 참조) | 두 캔버스 분리 유지 |
| 8 | Meeting Room = `global-chat-store` 재사용, Director agent 기본 | Artist 패턴 일관 |
| 9 | 자동 재생성 X, stale 배지만 | 토큰 비용 보호 |
| 10 | 노드 색: Scene=chart-3, Shot=chart-4, Video=chart-5 (2026-05-25) | 의미 매핑(구조→작업→결과). Video는 ▶ 아이콘으로 형태 단서 보강 |
| 11 | Final 마킹: Shot당 ★ 1개 강제. UI는 Video 헤더 별 아이콘(primary) + NodePopup 토글 (2026-05-25) | 명확함. Editor 핸드오프 시 자동 선정 가능 |
| 12 | 기존 Inspector 패널 처리: 단계적 마이그레이션 (2026-05-25) | 노드 그래프 검증 동안 둘 다 동작. 검증 완료 후 Inspector 제거 |
| 13 | Branch 변주 템플릿: MVP 제외 (2026-05-25) | Branch = 마더 설정 그대로 복사된 빈 새 Video 1개. 변주는 NodePopup에서 사용자가 직접 |
| 14 | director-store 마이그레이션: 점진적 (2026-05-25) | 새 `director-store.ts`가 메인. 기존 store는 의존 정리 후 제거 (Artist artist-store 빚 패턴) |
| 15 | 노드 위치 저장: shots/scenes에 `canvas_position` JSONB 컬럼 추가 (2026-05-25) | 같은 row에 설정·위치 공존, 마이그레이션 가벼움 |
| 16 | 프리셋 적용: 카메라/조명/렌즈 필드 전체 덮어쓰기. prompt/참고이미지는 유지 (2026-05-25) | 프리셋 = 셋업 단위. 부분 머지보다 의미 명확 |
| 17 | Scene 노드 박스: 메타 정보만, 자식 Shot 미니맵 X (2026-05-25) | 캔버스 그래프가 자식 관계 표현. 박스 안 중복 X |
| 18 | 자동 배치: 부모 Scene 우측, 형제 Shot 아래로 stacking, snap 16px (2026-05-25) | 예측 가능 + 구현 가벼움 |

---

## 19. 구현 마일스톤

모두 ship 완료. 이력 → `specs/archive/2026-06-05-redesign-director/`.

---

## 20. 참조

- `src/features/director/` — Director Canvas 구현 전체 (canvas-nodes, canvas-popups, canvas-edges, hooks)
- `src/features/artist/` — Artist 카드형 패널 패턴 (Director Canvas와 별개)
- `specs/data/asset_storage.md` — Artist 등록 자산 (Director가 참조)
- `src/lib/writer/pipeline/` / `src/app/api/director/generate-shots/` — 샷·프롬프트·영상 생성 파이프라인 (코드)
- `specs/design.md` — 색 토큰 / 모션 / 인터랙션 헌법
- `specs/decisions.md` — Artist 결정 #29~34 (패턴 참고)

---

## 변경 이력

- 2026-06-11 (2차): 부패 정정 — 결정표 #6 양방향 sync superseded 표기(#44/#45), §2.2 Artist 노드 충돌 표 삭제(폐기 UI 전제), #1/#9 "(Artist와 동일)" 제거, §8 인용 #45→#38, §10.2 Artist 임계 비교 삭제.
- 2026-06-11: spec diet — 구현 중복(§2-§7,§13-§14)·구식(§8 양방향 sync,§10/§15 localStorage,§12.2-12.3) 삭제, 의도·결정·계약만 유지.
