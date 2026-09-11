# Hook failed 127 조치 기록

작성일: 2026-09-09. 사용자가 문서 작성 후 훅 오류 수정을 요청했고, 이어서 OMX·Warp 삭제도 허용했다. 최종 조치는 Warp 플러그인 제거와 OMX 실행 경로 보완이다. 제품 코드는 이 작업에서 수정하지 않았다.

## 확인한 원인과 조치

- Warp 0.4.0 플러그인이 스크립트 경로를 따옴표 없이 실행했다. 현재 Orca 계정 경로의 `Application Support`에서 명령이 끊겼다.
- 등록된 Warp 훅 5개 모두 수정 전 종료 코드 127을 재현했다. 오류는 `/bin/sh: /Users/xcape/Library/Application: No such file or directory`였다. 따라서 이번에 재현한 127의 직접 원인은 OMX가 아니었다.
- 경로를 인용하면 5개 모두 정상 실행됨을 먼저 확인했다. 이후 사용자의 삭제 허용에 따라 `codex plugin remove warp@codex-warp --json`으로 현재 Orca 계정과 기본 `~/.codex` 양쪽의 Warp 등록·캐시를 제거했다. 최종 상태는 수정한 Warp를 유지하는 것이 아니라 제거한 상태다.
- OMX 0.18.16은 유지했다. 현재 계정의 `hooks/omx-command.json` 누락도 발견해 설치된 Node와 OMX CLI의 절대 경로를 기록했다. 이는 PATH에서 `omx`를 찾지 못하는 별도 실행 실패를 해결한다. 외부 `node` 명령 자체가 없는 모든 환경까지 검증했다는 뜻은 아니다.
- 변경 전 설정과 훅 정의는 아래 백업에 보존했다. 전역 훅 신뢰 검사나 승인 검사를 해제하지 않았다.

## 검증 결과

| 확인 | 결과 |
|---|---|
| 두 설정 위치의 Warp 제거 명령 | 모두 종료 0 |
| 두 설정 위치의 Warp 플러그인 등록·캐시 | 없음 |
| 변경 후 새 Codex app-server에서 `hooks/list` | 15개, 오류·경고 없음, Warp 0개 |
| 남은 Orca 연결 훅 8개 + OMX 훅 7개 | 모두 enabled·trusted |
| OMX 7개 이벤트 실제 실행 | 모두 종료 0, stderr 없음, 출력 JSON 파싱 성공 |
| OMX 실행 환경 | 격리된 임시 작업 폴더, 외부 Node는 절대 경로로 실행, 내부 PATH는 `/usr/bin:/bin:/usr/sbin:/sbin` |
| `omx doctor`의 Native hooks·Native hook dist smoke | 모두 OK |
| `omx doctor` 전체 | 18 통과, 1 경고, 1 실패 |

실행한 OMX 이벤트는 SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, PreCompact, PostCompact, Stop이다. 전체 doctor에 남은 문제는 architect·critic 역할 설치 누락과 explore 역할 라우팅 경고다. 이 역할 설정까지 정상이라고 보고하지 않으며, 이번에 재현한 Warp 127과는 별개다.

위 등록 검증은 **수정된 파일을 새로 읽은 app-server** 기준이다. 이미 실행 중인 Orca 세션의 메모리에 저장된 훅 정의가 즉시 갱신됐는지, 해당 세션의 다음 Stop 이벤트가 성공했는지는 이 기록 시점에 확인하지 않았다. 다른 세션 작업을 끊는 앱·서버 강제 재시작은 하지 않았다.

## 위치와 복구 자료

- 현재 계정: `/Users/xcape/Library/Application Support/orca/codex-accounts/0d6197f4-4e83-44b9-bd74-4ff38a42c19b/home`.
- 보완한 OMX 파일: 위 계정의 `plugins/cache/oh-my-codex-local/oh-my-codex/0.18.16/hooks/omx-command.json`.
- 백업: `/Users/xcape/Library/Application Support/orca/codex-accounts/0d6197f4-4e83-44b9-bd74-4ff38a42c19b/home/backups/hook-127-repair-20260909-231521`.
- 백업에는 기존 훅 정의, 변경 전 설정, 제거 직전 설정, 변경 목록, 제거 명령 결과가 있다. 전체 설정을 그대로 덮어쓰면 다른 세션의 후속 설정을 잃을 수 있으므로 필요한 항목만 비교해 복구한다.
- 실행 결과: [hook-127-verification.json](hook-127-verification.json).
- 제품 개선 인수인계: [28개 TODO](../../../specs/mvp-feedback-todo.md), [사용자 원문 보존 사본](../../../specs/mvp-feedback-source.md).
