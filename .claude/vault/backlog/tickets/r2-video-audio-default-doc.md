# r2-video-audio-default-doc — 영상 모델 오디오 기본값 주석이 코드와 반대이던 것 수리

- status: `awaiting-merge-review`  # 레벨 1 — 자가 머지 금지
- source: 기존 티켓 `t0-higgsfield-vs-pipeline-quality-gap.md` 확정 사실 5번
  (오너 메모 "v1,v2 writer … 퀄리티 차이" 조사에서 파생)
- run: `night-2026-08-18-b3d63b8d6e5342b6a76bfdead586277e` · contract `86d3be3fdcb41ea6`
- operation_key: `r2-audio-default-doc-v1`
- 작업 사본: `.claude/worktrees/night-0818-audiodoc` · 브랜치 `night/2026-08-18-audio-default-doc`
- 기준 커밋: `36cedb67b6c4a6434b9727a7807f69ed351667e3` · 결과 커밋: `386af9e`
- 허용 경로: `src/lib/video-models.ts` (주석만)

## interpretation

레벨 1이 명시적으로 허용하는 "내부 모순(주석≠코드)" 수리다. 주석은 "전 모델 OFF"라고 적혀
있는데 네 모델 전부 `audioDefault: true` 였다.

**어느 쪽이 틀렸는지 먼저 확정했다.** 커밋 이력을 보니
`91b83f6 feat(video-models): enable audio by default for all video models`(2026-06-06)이
값을 의도적으로 넷 다 true 로 바꾸면서 주석을 안 고쳤다. 즉 **코드가 의도이고 주석이 낡았다.**
그래서 주석을 고쳤다 — 값을 false 로 되돌리는 것은 유료 영상 발주의 동작 변경이라 밤이 독단으로
할 일이 아니다.

## 선기입 수용 기준 (실행 전 기록)

1. 주석과 코드 중 어느 쪽이 의도인지 **커밋 이력으로 확정**한 뒤에 고친다.
2. 동작 변경 **0줄** — 주석만 바뀐다.
3. `tsc --noEmit`·`eslint` 에 새 오류 0건.
4. 자가 머지하지 않는다.

## 결과 카드

- 판정: **pass** — 수용 기준 4항목 전부 충족
- created_at: 2026-08-18T02:55Z · estimated_review_min: 1 · reviewed_min: — · carryover_min: —
- merge_mode: `human` · merge_decision: — (오너 판정 대기)
- judgment_key: `stale-comment-vs-code` · judgment_version: 1
- 지출: $0

### 확인한 것

- 주석 `/** 오디오 기본값 (전 모델 OFF) */` (`src/lib/video-models.ts:39`, 수리 전)
- 실제 값: happy-horse·seedance·kling-o3·veo **전부** `audioDefault: true`
  (`video-models.ts:60,71,83,95`)
- 소비처는 한 곳뿐: `audioParam` 이 있을 때만 실어 보낸다
  (`src/app/api/director/generate-video/route.ts:173-174`). 그래서 `audioParam: null` 인
  happy-horse 는 이 값이 **전송되지 않는다** — 새 주석에 이 사실도 적었다.

### 검증

| 명령 | 결과 |
|---|---|
| `npx tsc --noEmit` | 새 오류 0건 |
| `npx eslint src/lib/video-models.ts` | 0건 |

### 확인 못 한 것 — 함께 발견했으나 손대지 않은 것

같은 파일에서 **kling-o3 의 `audioParam: 'audio'`** 가 눈에 띈다(`video-models.ts:83`).
8/17 조사 티켓은 fal 공식 파라미터 이름이 `generate_audio` 라 이 키가 무시될 것이라고
추정했다. **밤은 이것을 고치지 않았다** — 확인하려면 제공사 문서를 봐야 하고, 추측으로
파라미터 이름을 바꾸면 유료 발주의 동작이 조용히 바뀐다. 오너 확인 항목으로 남긴다.

### 다음 조치

- 사람 머지 검토: `git -C .claude/worktrees/night-0818-audiodoc log -1 -p`
