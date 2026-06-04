#!/usr/bin/env bash
# Stop hook: 작업 종료 직전 TypeScript 에러 게이트
# 에러 발견 시 exit 2로 Claude에 피드백. 사용자가 "타입 에러는 별도"라고 명시한 경우 Claude가 판단해서 우회.
#
# 알아둘 위험: GitHub issue #24327 — 일부 버전에서 exit-2 회귀로 완전 중단으로 처리될 수 있음.
# 1주일 운영 후 동작 확인 → 문제 시 exit 0 + stderr 메시지로 약화.

cd "${CLAUDE_PROJECT_DIR}" || exit 0

if [ -f package.json ] && grep -q '"typecheck"' package.json; then
  OUT=$(pnpm typecheck 2>&1)
else
  OUT=$(npx tsc --noEmit 2>&1)
fi

if echo "$OUT" | grep -qE 'error TS'; then
  HEAD=$(echo "$OUT" | head -30)
  cat >&2 <<EOF
TypeScript 에러가 있습니다:
$HEAD

작업 완료 전 해결하세요. 사용자가 "타입 에러는 별도"라고 명시했으면 무시하고 계속.
EOF
  exit 2
fi
exit 0
