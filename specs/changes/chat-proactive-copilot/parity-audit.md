# 채팅 ↔ UI Parity 감사 (chat-proactive-copilot Phase 5)

> 목표(decision): (editor 제외) 각 스테이지 UI 기능을 **채팅으로도 전부** 수행 가능(parity).
> 본 문서는 *현재 커버리지*를 코드 기준으로 매핑하고 **갭**을 명시한다. 코드가 진실.
> 작성 2026-06-09. 근거: `global-chat-store.sendMessage` 분기 + 각 `/api/*/chat` updates 타입.

## 요약

| 스테이지 | 채팅 커버 | 주요 갭 |
|---|---|---|
| Producer | 설정 추출(applyExtractedSettings) | **핸드오프(saveAndHandoff) 채팅 불가** |
| Artist | createCharacter / regenerateCharacter / regenerateWorldAsset | **핸드오프(Approve & Direct) 채팅 불가** (Phase 1 넛지가 부분 보완) |
| Director | 12종 canvas mutation (아래) | 핸드오프→editor, 스토리보드 그리드 토글, 드래그 배치, 비디오 final(★) 마킹 |
| Editor | — (의도적 채팅 미지원) | 범위 밖 (추후) |
| writer | — (백엔드 전용, UI 없음) | N/A — Phase 5에서 `CHAT_SUPPORTED_STAGES`에서 제거 |

## writer 채팅 결정 (확정)

**제거.** writer는 UI 없는 백엔드 전용 스테이지(decision #38)이고 `/api/writer/chat` 라우트가 없어
`global-chat-store.sendMessage` switch의 `default`(에러)로 빠지던 죽은 경로였다. `CHAT_SUPPORTED_STAGES`에서
`'writer'` 제거(constants.ts). writer 채팅 endpoint 신설 안 함.

## 스테이지별 상세

### Producer (`/api/produce/chat`)
- ✅ 설정 대화 추출 → `producer-store.applyExtractedSettings` (playtime/genre/aspectRatio/tone/lang/storyText/storyReady)
- ❌ **핸드오프**: `saveAndHandoff()`(DB 저장 + `/api/writer/start` + stage 전환)는 채팅으로 트리거 불가.
  → 후속: chat이 `storyReady===true` 감지 시 "Artist로 핸드오프할까요?" 제안(navigate가 아니라
  saveAndHandoff 호출이라 새 action kind 필요).

### Artist (`/api/artist/chat`) — `ArtistUpdate` 3종
- ✅ `createCharacter` / `regenerateCharacter`(views 지정 가능) / `regenerateWorldAsset`
- ❌ **핸드오프**: `Approve & Direct`(→director) 채팅 불가. *Phase 1 프로액티브 넛지가 "Director로 가기"를
  제안해 부분 보완하나, 임의 시점 채팅 명령으로는 불가.*
- ❌ 캐릭터 잠금(lock) 토글, Inventory 저장/등록(Register)은 채팅 미커버.

### Director (`/api/director/chat`) — `DirectorCanvasUpdate` 12종
- ✅ addScene, addShot, updateScene, updateShot, addVideoTake, setCamera, setLighting,
  setCameraPreset, generateVideo, connect, selectNode, requestDelete
- ❌ 핸드오프→editor, StoryboardGrid 뷰 토글, 실제 노드 드래그 배치, VideoNode final(★) 마킹.

## 후속 작업 (별도 change 권장)
1. **핸드오프 채팅 명령 통일** — producer→artist, artist→director 핸드오프를 채팅으로.
   `ChatSuggestion.action`에 `kind: 'handoff'`(saveAndHandoff/handoffToStage 호출) 추가 또는
   `*Update`에 navigate/handoff 타입 추가. Phase 1 넛지 인프라(offerSuggestion) 재사용 가능.
2. **Artist lock/Register 채팅 커버** — ArtistUpdate에 toggleLock / register 타입 추가.
3. **Director final 마킹·뷰토글 채팅 커버** — DirectorCanvasUpdate에 setVideoFinal / setView 추가.
4. 드래그 배치 등 직접조작 본질 작업은 parity 대상에서 제외(채팅 부적합 — Contrarian 결정과 일치).
