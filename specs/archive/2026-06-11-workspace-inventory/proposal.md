---
change: workspace-inventory
status: active
created: 2026-06-06
decisions: []
---

# Workspace Inventory — Reusable Asset Library

## Why

현재 Artist Inventory 탭은 현재 프로젝트의 캐릭터/월드를 읽기 전용으로 재나열하는 껍데기다. 인벤토리 전용 DB 테이블이 없고, 저장/업로드/삭제 기능도 없다. 사용자가 Artist에서 생성한 이미지를 계정(workspace) 단위 라이브러리로 저장해 여러 프로젝트에서 I2I 레퍼런스로 재사용하고, Director ShotNodePopup의 reference 슬롯에서도 직접 참조하고 싶다는 요구가 있다.

## What Changes

- 신규 `inventory_items` 테이블 (`workspace_id` FK, kind/name/image_url/storage_path/thumbnail_url/source_project_id/source_character_id)
- API 4종: GET list, POST save-from-asset, POST upload(multipart), DELETE
- `src/stores/inventory-store.ts` 신규 (no-persist, workspace source-of-truth)
- Artist 캐릭터/월드 패널에 "인벤토리에 저장" 버튼 추가 + Inventory 탭 `inventory-grid.tsx` 완전 재작성 (artist-store 재나열 → workspace inventory_items 로드)
- Director `ShotNodePopup` reference 영역에 인벤토리 picker 진입점 + `inventory-picker-dialog.tsx` 신규

## Impact

- Affected specs: 없음 — 코드 source-of-truth
- Affected code: `src/app/api/inventory/`, `src/stores/inventory-store.ts`, `src/features/artist/` (character-panel, world-panel, inventory-grid), `src/features/director/canvas-popups/` (ShotNodePopup + 신규 inventory-picker-dialog)
- Affected stores: `src/stores/inventory-store.ts` (신규)
- Affected DB: 신규 `inventory_items` 테이블 (`databases/migrations/014_inventory_items.sql`)
- Affected decisions: 없음

---

## 코드-vs-룰 괴리 기록

- **API 응답 형식**: 룰 문서(`api-routes.md`)는 `{ok,data}` 규정하나 실제 라우트는 bare shape(`{publicUrl}`, `{presets}`, `{ok:true}`) — **실제 코드(bare shape) 따름.** 새 라우트도 bare shape 유지.
- **마이그레이션 네이밍**: 룰(`YYYYMMDD`)과 달리 실제 코드는 3자리 정수 prefix(`013`까지 존재) — **실제 코드(3자리 정수) 따름.** 다음 파일명 `014_inventory_items.sql`.
