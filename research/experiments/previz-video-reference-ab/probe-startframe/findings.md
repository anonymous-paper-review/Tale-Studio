# 판정 — Seedance 2.0은 참조 이미지를 "시간 앵커"로 읽는가, "구도 참조 세트"로 읽는가

> 2026-08-11. 정성평가 1차(`../qualitative/`)에서 암 (a)[START 1장]는 시작 그림 구도로 열리고
> 암 (b)[START, END 2장]는 시작 프레임부터 END 구도로 열린 발산의 원인 판별.
> 발주 좌표·payload 전문: `manifest.json`. 예산 하드캡 $5 중 $4.23 지출(프로브 2클립).

## 결론 1문장

Seedance 2.0의 `image_urls`는 공식적으로 시간 역할이 없는 "자유 참조 세트"지만, 실측에서는
**리스트의 마지막 이미지가 여는 프레임을 앵커하는 순서 효과**가 있었다 — (b)의 발산은 END를
마지막에 넣고 "어느 참조가 첫 프레임인지"를 텍스트로 지정하지 않은 조합이 원인이다.

## 근거 1 — 공식 문서: 시간 앵커 계약이 없다

fal OpenAPI(`/api/openapi/queue/openapi.json?endpoint_id=bytedance/seedance-2.0/reference-to-video`, 2026-08-11 실측) 원문:

> "Reference images to guide video generation. Refer to them in the prompt as @Image1, @Image2, etc.
> Supported formats: JPEG, PNG, WebP. Max 30 MB per image. Up to 9 images."

- 입력 스키마 전체에 `first_frame`/`start_image`/`end_image` 류 파라미터 **없음**
  (전 필드: prompt, image_urls, video_urls, audio_urls, resolution, duration, aspect_ratio, generate_audio, bitrate_mode, end_user_id).
- 모델 페이지·API 문서 모두 참조의 시간 배치(첫 프레임 고정 여부)에 대한 문구 없음.
  즉 "이미지 N장 = 시작·끝 프레임"이라는 계약은 어디에도 없고, 시간 역할은 프롬프트(@Image1 표기)로 지정하는 설계다.
- 대조: 같은 레지스트리의 Kling O3는 `start_image_url`/`end_image_url` 전용 파라미터가 있다
  (`src/lib/fal/model-schemas.ts` — 시간 앵커를 API 계약으로 받는 모델과의 차이).

## 근거 2 — 동결 프롬프트에 시간 역할 지정 절이 없었다

정성평가의 동결 T1 프롬프트(ti2v-camera-cap-recheck 유래, **START 1장 발주용**으로 동결된 문장)에는
참조 이미지를 언급하는 절이 아예 없다 — "first reference image" 류 문구 0건, @Image 표기 0건.
제품 경로는 참조 2장 이상이면 `buildVideoPrompt`가 수렴 절("The first reference image is the shot's
START frame and the last reference image is its END frame — begin exactly at the START composition…")을
덧붙이지만(`src/app/api/director/generate-video/route.ts:494` → `src/lib/director/video-prompt.ts:52-57`),
암 (b)는 이 절 없이 이미지 2장만 추가했다. 모델 입장에서 두 그림은 시간 역할이 미지정된 동급 참조였다.

## 근거 3 — 프로브 1: 순서만 뒤집자 여는 구도가 뒤집혔다

| 발주 | image_urls 순서 | 여는 프레임(frame 0) 육안 판독 |
|---|---|---|
| 암 (b) | [START, END] | **END 구도** — 스파이크 그레이트 전경 지배, 소녀는 복도 원경 |
| 프로브 1 | [END, START] | **START 구도** — 도어웨이 정면 질주 클로즈, 소녀가 화면 대부분 |

- 프로브 1은 (b)와 프롬프트·해상도·duration 전부 동일, `image_urls` 배열 순서만 반전(payload 전문: manifest.json#p1).
- 프로브 1의 1fps 프레임열: START 구도로 열림 → 그레이트가 무너져 바닥에 깔림 → 정면 질주가 끝까지 유지.
  END 구도(그레이트 너머 원경)는 클립 전체에서 등장하지 않음.
- 판정: 여는 구도가 START로 바뀌었으므로 **"순서가 앵커"** — 내용(프롬프트의 환풍구 묘사와 END 그림의 친화)이
  지배했다면 순서 반전에도 END로 열렸어야 한다. 극성에 주의: 두 관측 모두 **마지막 이미지**가 여는 프레임을
  가져갔다("첫 이미지 = 첫 프레임"의 정반대). n=2·동일 샷 1종이라 극성의 일반화는 잠정.

## 근거 4 — 프로브 2: 텍스트 절로 고정되는가

프로브 2 = (b)와 동일 구성([START, END] 유지) + 프롬프트 끝에 1문장 추가:

> "The video must open exactly on the composition of the first reference image (@Image1)."

**결과: 텍스트 절이 순서 효과를 이겼다.** 여는 프레임(frame 0) 육안 판독 = **START 구도**
— 도어웨이를 등지고 카메라 쪽으로 달려오는 소녀 근경, 하단 양측에 그레이트 전경. 배열은 (b)와
동일한 [START, END]인데도 여는 구도가 END에서 START로 뒤집혔다.

| 발주 | image_urls 순서 | 명시 절 | 여는 프레임 |
|---|---|---|---|
| 암 (b) | [START, END] | 없음 | END 구도 |
| 프로브 1 | [END, START] | 없음 | START 구도 (마지막 이미지) |
| 프로브 2 | [START, END] | **있음(@Image1)** | **START 구도 (명시된 이미지)** |

부수 관측 — 프로브 2는 1fps 프레임열에서 START 구도로 열려 다리·질주 디테일 근접을 거쳐
**마지막 2~3초에 복도 원경(END 구도 근사)으로 수렴**했다. 즉 명시 절이 붙자 시간 순서가
START→END로 정렬됐다(우리가 원래 의도한 배치). 해상도는 1112×834(4:3)로 여전히 참조 비율 추종.

## 제품 배선 함의

1. **제품 경로는 이미 옳게 배선돼 있다** — `buildVideoPrompt`가 참조 2장 이상일 때 START/END
   수렴 절을 붙이므로(video-prompt.ts:52-57, 라우트가 `startEndReference: refs.length>=2`로 유도),
   프로덕션은 이 발산에 노출되지 않는다. **발산은 실험 전용 조건**(START 1장용으로 동결된
   프롬프트에 이미지만 2장 추가)이 만든 것 — 정성평가 (b)암의 관찰은 "END 참조가 구도를 흘린다"의
   증거로 쓰면 안 된다(교란). 지난 A2 실험도 같은 검토가 필요: 그쪽은 제품 경유라 절이 붙었는지
   manifest로 확인할 것.
2. **실험 계약 규칙** — 앞으로 참조 장수를 바꾸는 암을 만들 때는 프롬프트도 그 장수의 제품 문장으로
   맞춰 동결해야 한다. "텍스트 동일 + 참조만 변경"은 공정해 보이지만, 참조의 시간 역할을 말해주는
   문장이 빠지면 암마다 다른 계약을 발주하는 셈이 된다.
3. **모델 이식 시 주의** — `image_urls`에 시간 계약이 없는 모델(Seedance)과 전용 파라미터가 있는
   모델(Kling `start_image_url`/`end_image_url`)이 공존한다. 모델 교체 시 START/END 의미는
   프롬프트 절로만 유지되므로, 절 없이 참조만 넘기는 경로가 생기면 조용히 순서 효과에 노출된다.

## 남는 불확실성

- n=2(+프로브 2), 샷 1종(sh_04_16), 모델 1종 — "마지막 이미지가 앵커"라는 극성이 샷·이미지 내용을
  바꿔도 유지되는지는 미검증. 내용 친화가 순서와 겹칠 때(예: 프롬프트가 START 그림 내용을 강하게 묘사)의
  상호작용도 미측정.
- happy-horse·veo 등 같은 `image_urls` 배선을 쓰는 다른 R2V 모델이 같은 순서 효과를 갖는지는 별도 실측 필요
  (공식 계약이 없는 건 동일).
- 출력 기하가 발주 720p(16:9) 대신 참조 비율(1112×834, 4:3)을 따라가는 현상은 이 프로브에서도 재현
  (p1 1112×834) — 원인 판별 범위 밖, 별도 논제.
