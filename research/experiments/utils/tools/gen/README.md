# gen — 공용 2-레인 생성 디스패처 (fal + higgsfield)

실험이 이미지·영상을 생성할 때 **fal.ai와 higgsfield를 동시에** 굴려 병목을 줄인다.
실험은 "무슨 잡을 만들지"만 `jobs.json`으로 선언하고, 라우팅·동시성·resume·과금가드·프로버넌스는 이 디스패처가 처리한다.

> 왜 만들었나: 지금까지 실험마다 `tools/*_generate.mjs`(fal 단독, 동시성 4)를 복붙했고,
> in-flight 상한이 한 백엔드에 묶여 있었다. 두 번째 레인(higgsfield)을 붙여 처리량을 늘리고,
> 생성 레이어의 복붙을 공용층으로 걷어낸다. (CONVENTIONS.md 규칙 3-1: 공용물은 utils/)

## 사전 준비

```bash
# fal
export FAL_KEY=...                     # (기존 실험과 동일)

# higgsfield (OAuth 토큰은 short-lived — 배치 직전 로그인 권장)
higgsfield auth login
higgsfield workspace set <workspace_id>   # `higgsfield workspace list` 로 확인
```

## 쓰기

```bash
node research/experiments/utils/tools/gen/dispatch.mjs \
  --jobs <실험폴더>/jobs.json \
  --assets <실험폴더>/assets \
  --mode speed        # 기본. speed | ab | fal | higgsfield
```

### 모드

| 모드 | 동작 | 언제 |
|---|---|---|
| `speed` (기본) | 빈 레인이 아무 잡이나 집음 → 최대 throughput, 출력은 믹스(프로버넌스 태깅) | 자산 대량생성 |
| `ab` | 두 프로바이더가 같은 잡을 각각 실행, 파일 접미사 `__fal`/`__hf` | 프로바이더/모델 품질 비교 |
| `fal` / `higgsfield` | 한 프로바이더 고정 | 재현성(fal seed)·단일모델 판정 |

### 옵션

- `--fal-concurrency N` (기본 4) · `--hf-concurrency N` (기본 4)
- `--fal-cap N` · `--hf-cap N` (기본 50) — 프로바이더별 시도 상한(폭주·과금 가드)
- `--only t2i,i2v` — task 필터
- `--dry-run` — 생성 없이 계획 출력 + higgsfield 크레딧 견적

## jobs.json 포맷

배열. 이미지 단계(t2i·edit)가 먼저 돌고, 영상 단계(i2v)는 그 산출을 입력으로 받아 나중에 돈다.

```json
[
  { "id": "s01", "task": "t2i", "prompt": "...", "aspect": "16:9", "seed": 111, "out": "shots/s01.jpg" },
  { "id": "s01", "task": "i2v", "prompt": "...", "image": "shots/s01.jpg", "seconds": 5, "aspect": "16:9", "out": "clips/s01.mp4" }
]
```

| 필드 | 필수 | 설명 |
|---|---|---|
| `id` | ✓ | 잡 식별자(resume 키) |
| `task` | ✓ | `t2i` \| `edit` \| `i2v` |
| `prompt` | ✓ | 프롬프트 |
| `out` | ✓ | `--assets` 기준 상대 출력 경로 |
| `image` | edit·i2v | 입력 이미지 (assets 상대경로/절대경로/URL). higgsfield는 URL 불가 → 로컬 경로 권장 |
| `aspect` | | `16:9`(기본) 등. fal은 image_size 프리셋으로 자동 변환 |
| `seconds` | i2v | 영상 길이(초, 기본 5) |
| `seed` | | **fal만** 반영(재현성). higgsfield flux_2엔 seed 없음 |

## 산출

- `<assets>/<out>` — 실제 파일
- `<assets>/gen_state.json` — resume 캐시(완료분 skip=재과금 방지)
- `<assets>/provenance.json` — 자산별 `{provider, model, jobId, bytes, seconds}` → result.md 부록·규칙 7 근거

## task ↔ 모델 매핑 (models.mjs 에서 수정)

| task | fal | higgsfield |
|---|---|---|
| `t2i` | `fal-ai/flux-2/klein/9b` | `flux_2` (seed 없음) |
| `edit` | `openai/gpt-image-2/edit` | `gpt_image_2` |
| `i2v` | `alibaba/happy-horse/reference-to-video` | `happy_horse_video` |

세 task 모두 fal·higgsfield가 동일 계열 모델이라 `speed` 믹스 출력이 비교가능하다.
다른 모델(Seedream·Kling·Veo·Soul 등)을 쓰려면 `models.mjs`의 매핑만 바꾼다 — `higgsfield model list` 로 job_type 확인.

## 운영 주의

- **higgsfield 토큰 short-lived**: 밤샘 fire-and-forget 배치는 fal 쪽에 잡을 더 싣거나 higgsfield 배치를 청크로. 만료 시 `higgsfield auth login` 재실행.
- **재현성**: fal seed는 반영되나 higgsfield flux_2엔 seed 파라미터가 없다 → seed 고정 실험은 `--mode fal`.
- **캐릭터 신원**: higgsfield Soul(`text2image_soul_v2` 등)은 신원 전파에 강함 — continuity-copy 트랙은 별도 실험으로 다룰 값어치. 지금 매핑엔 미포함(edit=gpt_image_2 유지).
