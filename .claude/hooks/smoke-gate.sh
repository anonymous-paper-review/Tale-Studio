#!/usr/bin/env bash
# Stop hook: UI 를 고쳤는데 브라우저에서 한 번도 확인 안 했으면 상기시킨다.
#
# 왜: tests/ 130개는 전부 vitest 라 브라우저를 못 연다. "라우트가 403 뱉나"는 잠겨 있지만
#   "화면이 뜨긴 하나"는 커버가 0이었다. Orca 브라우저는 능력이 있는데도 55개 세션에서 0회 쓰였다 —
#   읽는 자리에 안 적혀 있으면 안 쓴다는 게 이 프로젝트에서 이미 관측됐다 (2026-08-17).
#
# 이 훅은 스모크를 대신 돌리지 않는다. 6개 화면 확인은 30초 타임아웃 안에 안 들어가고,
#   무엇을 확인할지(--expect)는 변경마다 다르기 때문이다. 상기만 하고 판단은 에이전트에 맡긴다.
#
# 절대 원칙: 애매하면 통과시킨다. 잘못 막는 비용이 잘못 통과시키는 비용보다 크다.
#   (typecheck-gate.sh 와 같은 exit-2 위험을 공유한다 — GitHub issue #24327)

cd "${CLAUDE_PROJECT_DIR}" || exit 0

# 전제가 없으면 스모크 자체가 skip 이므로 상기시킬 이유가 없다.
command -v orca >/dev/null 2>&1 || exit 0
orca status --json 2>/dev/null | grep -q '"reachable": true' || exit 0

# 작업 트리에서 바뀐 UI 파일 — 없으면 이 훅과 무관한 세션이다.
# src/app/api/** 는 화면이 없는 서버 라우트라 스모크 확인 대상이 아니므로 제외한다.
CHANGED=$(git status --porcelain -- src/app src/components ':!src/app/api' 2>/dev/null | awk '{print $NF}')
[ -z "$CHANGED" ] && exit 0

# 바뀐 UI 파일 중 가장 최근 것보다 새 스크린샷이 있으면 확인한 것으로 본다.
NEWEST=$(echo "$CHANGED" | xargs -I{} stat -f "%m %N" {} 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)
[ -z "$NEWEST" ] && exit 0
if [ -d .smoke ] && [ -n "$(find .smoke -name '*.png' -newer "$NEWEST" 2>/dev/null | head -1)" ]; then
  exit 0
fi

COUNT=$(echo "$CHANGED" | wc -l | tr -d ' ')
cat >&2 <<EOF
UI 파일 ${COUNT}개를 고쳤는데 브라우저 확인 기록이 없습니다 (.smoke/ 에 더 새 스크린샷 없음).

  pnpm smoke                                   # 등록된 화면 전부
  pnpm smoke /경로 --expect "그 화면에만 있는 문구"   # 고친 화면만

vitest 는 브라우저를 못 엽니다 — 렌더·콘솔 에러·인증 리다이렉트는 이걸로만 확인됩니다.
확인 뒤에는 스크린샷 경로를 오너에게 넘기세요(판정은 오너 몫).
브라우저 확인이 무의미한 변경(주석·타입·문자열 상수 등)이면 그 이유를 밝히고 넘어가세요.
EOF
exit 2
