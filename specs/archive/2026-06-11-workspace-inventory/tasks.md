# workspace-inventory — Tasks

## Archived (검증 waive 2026-06-10)

- [x] T10 Artist 패널 "인벤토리에 저장" 버튼 (`character-panel.tsx`, `world-panel.tsx`) — 코드 ✓ / 검증 waive 2026-06-10
- [x] T11 `inventory-grid.tsx` 재작성 + `src/app/studio/artist/page.tsx` onSelect 정리 — 코드 ✓ / 검증 waive 2026-06-10
- [x] T12 Director 인벤토리 picker (`ShotNodePopup.tsx` + 신규 `inventory-picker-dialog.tsx`) — 코드 ✓ / 검증 waive 2026-06-10 (nested Dialog focus-trap 포함)

## Done (코드 검증 완료)

- [x] T0 spec change scaffold (`specs/changes/workspace-inventory/`) — 2026-06-06
- [x] T1 마이그레이션 `014_inventory_items.sql` 작성 — 파일 ✓ (적용은 사용자, 아래 주의)
- [x] T2 타입 `InventoryItem`/`InventoryKind`/`SaveFromAssetInput` (`src/types/inventory.ts` + index re-export)
- [x] T4 `uploadImageFromUrl` export화 (`src/lib/fal/finalize.ts`) — 비파괴적
- [x] T5 API GET list (`src/app/api/inventory/route.ts`)
- [x] T6 API POST save-from-asset (SSRF allowlist 포함)
- [x] T7 API POST upload multipart (magic-byte 검증 포함)
- [x] T8 API DELETE (storage_path로 객체 정리, 멱등)
- [x] T9 `inventory-store.ts` (optimistic remove + rollback, persist 미사용)
- [x] T13 검증 — `tsc --noEmit` 0 / `eslint` 0 / `pnpm build` 성공

## 보안 리뷰 반영 (코드 검증 완료)

- [x] SSRF: `assertSafeImageUrl` host allowlist (Supabase storage + fal CDN, https-only)
- [x] 에러 메시지 일반화 (4 라우트 500 응답 → `internal error`, 상세는 server log)
- [x] 업로드 magic-byte 검증 (PNG/JPEG/WEBP만, SVG stored-XSS 차단)
- [x] 응답에서 `storage_path` 제거 (내부 키 미노출)
- [x] 업로드/로드 실패 사용자 노출 (inventory-grid)

## 후속 과제 (MVP 범위 밖, deferred)

- [ ] rate limiting (save-from-asset/upload) — 프로젝트 전역 limiter 부재, 별도 인프라 과제
- [ ] `inventory-store.load` race guard (AbortController/토큰) — 단일 사용자 MVP에선 저위험
- [ ] (선택) 인벤토리 → 새 프로젝트 캐릭터로 instantiate

---

## DoD 세부 기준

### T10 "인벤토리에 저장" 버튼
- 대표 이미지 있을 때만 활성, 없으면 disabled
- 클릭 → `saveFromAsset` 호출 → 성공 후 "저장됨"(BookmarkCheck) 토글
- [x] 코드 작성 완료 / 브라우저: 저장 후 토글 확인 → [x] — 검증 waive 2026-06-10

### T11 inventory-grid 재작성
- mount 시 `load(workspaceId)` 호출, workspace inventory_items 표시
- kind별 섹션 + 아이템 썸네일/name/kind badge + hover 삭제(Trash2, optimistic)
- 파일 업로드 `<label>`+hidden file input
- 빈 상태 안내 + CTA
- [x] 코드 작성 완료 / 브라우저: 탭 그리드 표시 + **프로젝트 A 저장 아이템이 프로젝트 B에서도 보임**(cross-project 핵심) + 업로드 + 삭제 확인 → [x] — 검증 waive 2026-06-10

### T12 Director picker
- ShotNodePopup reference 영역에 "인벤토리에서 선택" 버튼 추가
- picker Dialog에서 아이템 선택 → `referenceImages`에 publicUrl로 추가
- nested Dialog focus-trap 정상 동작 확인
- [x] 코드 작성 완료 / 브라우저: picker→선택→referenceImages 반영 + focus-trap 확인 → [x] — 검증 waive 2026-06-10

### T13 검증
- `npx tsc --noEmit` 0 errors
- `pnpm lint` 0 errors (console.log 금지, console.error 허용)
- `pnpm build` 성공

---

## 주의사항

- **마이그레이션 적용은 사용자 직접**: `014_inventory_items.sql` 파일 작성(AI) → Supabase 대시보드 SQL 에디터 실행(사용자) → `media` 버킷 존재 확인(사용자). 브라우저 검증 전 사용자에게 안내 필요.
- **workspace 가드**: `owner_id==null`(Default workspace) 통과 — `presets/route.ts`의 `.eq('owner_id',userId)` 복사 금지(null owner 전원 403 유발).
- **project-store.resetChildStores에 inventory-store 넣지 말 것**: 프로젝트 전환이 인벤토리를 비우면 cross-project(FR-2) 위반.
