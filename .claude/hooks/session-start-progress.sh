#!/usr/bin/env bash
# SessionStart hook: PROGRESS.md 미검증 [c] 카운트 + 진행 중 changes/ 영역을 inject
# 출력은 결정적 JSON. 미검증 [c]가 0이고 changes/도 비어 있으면 nothing.

COUNT=$(grep -c '^- \[c\]' "${CLAUDE_PROJECT_DIR}/PROGRESS.md" 2>/dev/null || echo 0)
ACTIVE_CHANGES=$(ls "${CLAUDE_PROJECT_DIR}/specs/changes/" 2>/dev/null | grep -v '^archive$' | head -5)

if [ "$COUNT" -gt 0 ] || [ -n "$ACTIVE_CHANGES" ]; then
  TOP=$(grep '^- \[c\]' "${CLAUDE_PROJECT_DIR}/PROGRESS.md" 2>/dev/null | head -5)
  cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "PROGRESS.md 미검증 [c]: ${COUNT}개\n\nTop 5:\n${TOP}\n\n진행 중 changes/:\n${ACTIVE_CHANGES}\n\n사용자에게 1줄 보고 + (a)검증 (b)신규 (c)버그 (d)changes/ 진행 선택지 제시하세요."
  }
}
EOF
fi
exit 0
