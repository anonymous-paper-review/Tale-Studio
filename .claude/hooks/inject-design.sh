#!/usr/bin/env bash
# UserPromptSubmit hook: UI 작업 키워드 매칭 시 design.md consult 강제 inject
# 영문 + 한국어 키워드 모두 커버. 미스 시 nothing.

PROMPT=$(jq -r '.prompt // ""' < /dev/stdin 2>/dev/null || cat)
KEYWORDS='component|page|screen|button|form|modal|sheet|popover|dialog|card|shadcn|tailwind|tsx|style|theme|token|color|spacing|layout|design|canvas|node|컴포넌트|페이지|디자인|스타일|버튼|폼|모달|레이아웃|색|토큰|캔버스|노드'

if echo "$PROMPT" | grep -iEq "$KEYWORDS"; then
  cat <<'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "UI 작업 감지됨. specs/design.md를 반드시 consult하세요 (정성 reference는 specs/design-references.md). 토큰 source-of-truth: src/app/globals.css. Hard rules: dark-first with light parity; ONE accent (Netflix Red, decisions #30) for CTAs only; Geist Mono for camera-axis values; use canvas extension tokens (--canvas-*, --node-*, --edge-*); Higgsfield-style glassmorphism 금지."
  }
}
EOF
fi
exit 0
