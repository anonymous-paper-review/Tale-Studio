#!/usr/bin/env bash
# artist-style-anchor 공용 생성 헬퍼: higgsfield gpt_image_2 제출→대기→다운로드.
#
# 사용법: hf_image.sh <prompt_file> <out_png> [ref_image ...]
# 환경:   HF_AR (기본 1:1) — aspect_ratio 오버라이드.
# 전제:   higgsfield auth login + workspace set 완료 상태.
# 실패:   nsfw/타임아웃 등은 비-0 exit + 원인 출력 (IP 고유명사는 부정문이어도 nsfw 거부됨 — 프롬프트에서 제거할 것).
set -euo pipefail

PROMPT_FILE=$1; OUT=$2; shift 2
AR=${HF_AR:-1:1}

REF_ARGS=()
for r in "$@"; do REF_ARGS+=(--image-references "$r"); done

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

higgsfield generate create gpt_image_2 --prompt "$(cat "$PROMPT_FILE")" \
  ${REF_ARGS[@]+"${REF_ARGS[@]}"} --aspect_ratio "$AR" --json > "$TMP/create.json"

ID=$(node -e "
  // create --json 응답은 bare 배열 [\"uuid\"] (구버전 {id:[...]} 도 방어)
  const j=require('$TMP/create.json');
  const id=Array.isArray(j)?j[0]:(Array.isArray(j.id)?j.id[0]:(j.id||j.job_id));
  if(!id){console.error('CREATE FAILED: '+JSON.stringify(j).slice(0,300));process.exit(1)}
  console.log(String(id))")
echo "job: $ID"

if ! higgsfield generate wait "$ID" --timeout 15m --interval 5s --quiet --json > "$TMP/result.json" 2>&1; then
  echo "WAIT FAILED ($ID):" >&2; head -c 300 "$TMP/result.json" >&2; echo >&2
  exit 1
fi

URL=$(node -e "
  const j=require('$TMP/result.json');
  const m=JSON.stringify(j).match(/https:[^\"]+?\.(?:png|jpe?g|webp)[^\"]*/);
  if(!m){console.error('NO URL: '+JSON.stringify(j).slice(0,300));process.exit(1)}
  console.log(m[0].replace(/\\\\u0026/g,'&'))")

curl -sL "$URL" -o "$OUT"
echo "saved: $OUT ($(stat -c%s "$OUT") bytes)"
