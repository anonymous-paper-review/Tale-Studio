#!/bin/sh
# 야간 automation preflight — orca `--precheck` 로 물린다. 예약 실행 직전에 돌고,
# exit 0 이어야 본 실행이 진행된다(0 아니면 skipped 로 기록). 그래서 무조건 0으로 끝낸다.
#
# 왜 있나 (2026-08-13 01:30 실사고):
#   orca automation 은 명령줄을 **인터랙티브 zsh 에 타이핑해 넣는** 방식이다.
#   그날 oh-my-zsh 업데이트 프롬프트가 먼저 떠 있었고(`read -r -k 1`, 엔터 없이 1글자),
#   전송된 `claude '...'` 의 첫 글자 c 를 삼켰다 → 남은 `laude '...'` 가 실행돼
#   `zsh: command not found: laude`. 스위퍼는 기동조차 못 했는데 orca 는 completed 로 기록.
#   oh-my-zsh 자체 방어(`has_typed_input`)는 macOS 에서 상시 무효다 — GNU 전용 `stty --save`
#   를 쓰는데 BSD stty 가 `illegal option` 으로 거절해 항상 "입력 없음"으로 판정된다.
#
# 하는 일: 셸 시작 시 stdin 을 읽는 프롬프트를 미리 무장해제한다.

ZSH_DIR="${ZSH:-$HOME/.oh-my-zsh}"
CACHE_DIR="${ZSH_CACHE_DIR:-$ZSH_DIR/cache}"

# 1) omz 업데이트 프롬프트 타이머를 오늘로 밀어 발동 조건 자체를 없앤다.
#    (.zshrc 의 `mode disabled` 와 이중 방어 — 설정이 되돌아가도 여기서 막힌다)
if [ -d "$CACHE_DIR" ]; then
  printf 'LAST_EPOCH=%s\n' "$(( $(date +%s) / 86400 ))" > "$CACHE_DIR/.zsh-update" 2>/dev/null || true
fi

# 2) 새다 만 업데이트 락 제거 — 락이 남으면 24시간 동안 업데이트 검사가 조용히 건너뛰어져
#    "어떤 밤은 되고 어떤 밤은 안 되는" 비결정성의 원인이 된다.
rm -rf "$ZSH_DIR/log/update.lock" 2>/dev/null || true

# 3) claude 가 PATH 에 실제로 있는지 확인만 하고 기록. 없으면 본 실행은 어차피 실패하지만
#    precheck 를 실패시키면 원인 없이 skipped 로만 남으므로 exit 0 은 유지한다.
command -v claude >/dev/null 2>&1 || echo "[preflight] WARN: claude not on PATH" >&2

exit 0
