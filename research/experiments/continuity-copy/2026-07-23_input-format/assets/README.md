# assets/ — 다섯 팔의 영상 생성 "직전 상태" (지도)

이 폴더에는 입력 포맷 실험(A·B1·B2·C·R)의 **I2V 직전 입력물 전부**가 들어 있다.
각 팔이 뭘 넣어서 뭘 만들었는지는 팔별 README에 상세히 적혀 있다:

| 폴더 | 팔 | 한 줄 |
|---|---|---|
| [`arm-a/`](arm-a/README.md) | Ⓐ 자산+연출 텍스트 | 시트+배경 플레이트로 시작 프레임만 — 끝 프레임 없음 (약점 가설) |
| [`arm-b1/`](arm-b1/README.md) | Ⓑ1 시작+끝 쌍 | 샷마다 시작·끝 2장을 그림으로 못박음 — 유력 승자 후보 |
| [`arm-b2/`](arm-b2/README.md) | Ⓑ2 시트 셀 수확 | 한 생성 안 6컷 시트 → 셀 잘라 시작 프레임 (일관성 공짜 가설) |
| [`arm-c/`](arm-c/README.md) | Ⓒ 클러스터 체이닝 | B1 재사용 + 체인 샷(2·5·6)은 영상 단계에서 실물 연결 |
| [`arm-r/`](arm-r/README.md) | R 상한 대조군 | 원본 프레임 그대로 — 영상 모델 성능의 상한선 |

팔 폴더가 아닌 것:

- **`conti/`** — 원본 영상에서 추출한 정답지 프레임 (샷 6개 × 시작/중간/끝). [`../conti.md`](../conti.md)가
  이걸로 콘티를 정의하고, R 팔이 이걸 그대로 입력으로 쓴다. `thumbs/`는 문서 표시용 축소판.
- **`plates/src_empty_wide.jpg`** — 원본 65.5초의 인물 없는 와이드 프레임(ffmpeg 추출).
  A안 배경 플레이트 4장의 원천. "DAAIKEEM" 워터마크가 있다(파생 플레이트에서는 프롬프트로 제거).
- **`payloads/payloads.json`** — **영상 생성기 러너가 읽는 유일한 계약서.** 팔×샷마다
  `start_image`/`end_image`(이 폴더 기준 경로), `video_prompt`(3층 텍스트 계약 포함), `duration_s`,
  `aspect_ratio`, 팔별 모델 요구사항. 이 파일 하나로 I2V를 태울 수 있게 조립돼 있다.
- **`staging_state.json`** — 생성 도구([`../tools/stage_inputs.mjs`](../tools/stage_inputs.mjs))의 resume
  캐시. 산출물별 fal CDN URL이 들어 있어 재실행 시 완료분을 건너뛰고, I2V 단계에서 재업로드 없이
  URL을 재사용할 수 있다.

공통 재료(폴더 밖): 캐릭터 정본 `../../2026-07-23_character-canon/assets/identity_ref.jpg`
(원본 10.9초 정면 — 신원 전파 검증 완료). 편집 모델은 전부 `openai/gpt-image-2/edit`
(제품 DEFAULT_EDIT_IMAGE_MODEL, `image_size=landscape_16_9`).
