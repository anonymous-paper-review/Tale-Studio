# 오너 노트 분류 (2026-08-31, `_Note.md` · `_Note2.md`)

루트의 형식 없는 오너 노트 2건과 캡처 4장(`~/projects/Pasted image 20260831*.png`)을 분류하고
당일 처리 가능한 것은 처리했다. 캡처는 증거 폴더로 복사해 보존.

| 노트 항목 | 분류 | 처리 |
|---|---|---|
| 핸드오프 승인 카드 전후 인터랙션 공백 (5초 무반응 · "승인 전에는…" 잔존 문구 · 승인 반응 발화 없음) | **그룹 D — 신규 D11** | 원장 기록 + 브랜치 `feat/group-d-chat-guidance` 생성. D 착수 시 1순위 |
| "확정했는데 씬·샷 빈 화면" + 새로고침 후 Producer 게이트백 (`fc7ec6d4`) | **버그 — B/D 아님, 당일 수리** | 원인: g4 migration이 공유 DB에 만든 NOT NULL 2컬럼(`scenes.narrative_time` · `shots.character_appearance_keys`)을 main 계열 insert가 안 채워 씬·샷 저장 전멸. 수리 `20ad126`(main). 상세는 아래 |
| 씬스토리 초안이 짧다 | **설계값 확인 — 버그 아님** | 이 프로젝트 런타임 60초 → 깊이 D2. 초안 길이는 런타임에서 유도되므로 60초짜리는 짧은 게 설계상 정상. 더 긴 초안을 원하면 런타임을 늘리는 게 정도. 그래도 짧다고 판단되면 G 계열(생성 품질)로 오너 판정 후 오픈 |
| 배경만 영어로 뜸 (미리보기 카드) | **표시 버그 — 표면 미특정** | 데이터는 정상: `locations.visual_description`=EN(base), `_native`=한국어 존재. 어떤 카드가 EN 필드를 집는지 화면 위치 특정 필요 — **오너에게 확인 요청**(어느 화면의 어떤 카드인지). 후보 표면 조사 결과 producer 준비 보드는 draft(한국어)라 무관 |

## "완료됐는데 씬·샷 0개" 상세 (수리 완료 + 남는 과제 1)

run `dbe1b402`(10:40~10:46 KST, status=completed, 14/14) 실측:
- Tier 1(`persistAssetsToDb`)은 **best-effort catch** — scenes insert가 NOT NULL 위반으로 죽어도 삼키고 계속.
- Tier 2(`persistShots`)는 3회 재시도 후 **give-up하면서 `_shotsPersisted=true` + status=completed**.
- 결과: 인물·배경만 저장되고 씬·샷 0행인데 화면·상태는 "완료". `_persistTries=3`이 증거.

수리(`20ad126`): 파이프라인 scenes/shots insert + 수동 addScene/addShot 4곳에
g4 백필과 같은 값(`narrative_time='present'`, 전 등장인물→`'current'` 맵)을 기록.
NOT NULL 재현 → 수리 후 모양 insert 성공으로 검증. main push 완료.

**남는 과제(오픈)**: persist give-up이 "완료"로 표시되는 것 — 실패를 사용자에게 보이게
(부분 완료/실패 상태 또는 챗 통지). D1(진행 표시)과 같은 표면을 쓰므로 D 작업에서 함께 다루면 싸다.

**복구 안내(`fc7ec6d4` director_test)**: 콘텐츠는 run state에 온전히 남아 있으나 씬·샷 재조립은
재실행이 가장 안전하다. **반드시 main 서버(:3100, 수리 반영)에서** Producer 배너의
"Writer 다시 실행 제안"을 누른다. :3000(director-node-wiring 워크트리)은 수리 전 코드라
같은 실패를 반복한다 — 그 브랜치는 main rebase 필요.

## 브랜치 현황 답변 (`_Note2.md`)

| 질문 | 답 |
|---|---|
| G4-G5 브랜치 | `feat/g4-character-variants` (origin에도 있음, 14커밋 — 시대 변형·사물 축·narrative_time·실측 리포트 포함). **:3001에 서버 이미 떠 있음** → http://localhost:3001 에서 Artist 테스트 |
| Director 노드 배선 브랜치 | `feat/director-node-wiring` (2커밋 — 노드 배선 3종 + 전체 영상 생성). **:3000 서버** → http://localhost:3000 에서 테스트. 단 Writer 실행은 위 수리 전 코드라 main rebase 전까지 :3000에서 돌리지 말 것 |
| main (수리 반영) | :3100 → http://localhost:3100 |

캡처 보존: `media/persist-writer-empty-board.png` · `media/persist-producer-gateback.png` ·
`../2026-08-26/evidence/owner-notes/d11-handoff-card-after-approve-{1,2}.png`
