```yaml
id: t0-spec-blender-compile-probe
source: .claude/vault/2026-08-11-blockout-previz-video-reference.md §3 (spec→Blender 컴파일 프로브)
tier: T0
budget: { usd: 0, runs: 1, wall_min: 90 }  # 생성 AI 크레딧 0 — 에이전트 노동만
blockers: [ "owner-approval: 로컬 Blender 설치 (머신 상태 변경 — _MORNING.md Q14)" ]
status: blocked
priority: normal
```

- **가설**: v4 static_spec/dynamic_spec('플레이트 발주서')은 결정론 코드로 Blender 카메라 트랙에 컴파일 가능하다 — 성립 시 저작 축 문제(화살표 커버리지 37%)가 LLM 드로잉에서 코드로 이동한다.
- **전제**: 외부 증언(반토막AI 데모) — 초 단위 카메라 표를 에이전트가 Blender로 조작(사람은 안 열음). D-2026-08-10-e의 기각 전제("수동 카메라 노동 폭발")가 에이전트 자동화로 갱신됨 — 단 심장(뷰 자산화)은 불변. 배선 실측: seedance만 `video_urls` 보유, 제품은 미사용 채널.
- **예측**: 참이면 대표 샷 1개의 spec이 헤드리스 bpy 스크립트로 사상돼 블록아웃 무빙 렌더(mp4)까지 감. 거짓이면 사상 불가 어휘 지점이 발견됨(그 목록 자체가 산출).
- **측정**: 프로브 1회 — spec 1개 → bpy 카메라 트랙 스크립트 → 단순 도형 블록아웃 렌더(처방 3규칙: 단순 도형·색 구분·역할 분리). 판정: 컴파일 성립 여부 + spec 필드별 사상 가능/불가 표. 생성 AI 미사용.
- **기각 조건**: 사상 불가 어휘가 spec 필드의 과반이면 "컴파일 티어" 기각 — 3암 (c)암은 수동 블록아웃으로 진행(Q14 카드에 보고).

## 좌표 (동결)

- spec 스키마: `src/lib/writer/pipeline/stages/v4_shots.ts`(static_spec = camera_angle×shot_type×framing, dynamic_spec) · `src/lib/writer/types/pipeline.ts`.
- 대표 샷: sh_08_64("DOLLY IN" — 카메라무빙, previz-channel-ablation label_scan 실판독 근거). 프로젝트 Sample1 `9d6efa6d`.
- 외부 전거: vault 8/11 + 리포트 아티팩트 eeaf07e8 (카메라 표 방식 = Halon "수치 전달이 1:1 재현의 관건").

## 산출 계약

- `research/experiments/t0-spec-blender-compile-probe/{result.md, compile.py, 블록아웃 mp4(로컬)}` — 사상 가능/불가 표가 본체.
- status 갱신 + reports 1줄 + Q14 카드에 (c)암 저작 방식 증거로 링크.
