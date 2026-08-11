# 가설 — 피사체 움직임과 카메라 반응의 분리 실험 (2026-08-11)

- **가설**: 같은 손동작·시선·감정이라도 대상이 프레임 안에 있는지, 카메라가 대상을 드러내거나 따라가야 하는지에 따라 데쿠파주가 서로 다른 카메라 반응을 선택하고, 그 선택이 블록아웃과 실제 영상까지 전달된다.
- **전제**: 카메라 계약 v3는 정적 오발을 줄이고 모션 적중을 높였지만 텍스트의 `camera_intent`만 측정했다. 현재 스펙은 `camera_motion`, `character_motion`, `gaze_arc`를 분리하지만 이들 사이의 프레이밍 목적은 자유서술에 남아 있다.
- **예측**: 참이면 프레임 안/밖 쌍의 카메라 반응이 text 단계에서 구분되고, 결정론 블록아웃의 카메라 트랙이 기대한 static/pan/dolly를 재현하며, 실제 영상에서도 피사체 추종·시선 리빌·배율 변화가 정적 쌍과 분리된다.
- **측정**: 손동작·시선·감정의 3쌍(총 6개 마이크로 샷)을 같은 제품 `runDecoupage`→`runShotDesign` 경로에 통과시킨다. 각 케이스의 기대 카메라 반응과 산출 `camera_intent`/`dynamic_spec.camera_motion`을 비교하고, 같은 spec을 Blender 블록아웃과 제품 `buildVideoPrompt`→Happy Horse 영상 생성에 넣어 previz·viz 결과를 함께 보존한다.
- **기각 조건**: text 단계에서 프레임 안/밖 쌍의 카메라 반응을 하나라도 구분하지 못하거나, 블록아웃이 기대 카메라 트랙으로 컴파일되지 않거나, 실제 영상에서 정적 쌍과 이동 쌍의 프레이밍 변화가 분리되지 않으면 “자유 문구만으로는 부족”으로 판정한다. 합격 여부와 별개로 각 층의 고장 위치를 분리 기록한다.

## 실행 좌표

- text: `gemini-3.6-flash`, `WRITER_CAMERA_CONTRACT=relaxed-v3`, 제품 `runDecoupage`·`runShotDesign`
- previz: Blender 5.2 headless, 단순 도형·색상·카메라 트랙, 생성 AI 미사용
- viz: `alibaba/happy-horse/reference-to-video`, 720p, 5초, START 이미지 1장
- 케이스: `hand_in_frame`, `hand_off_frame`, `gaze_in_frame`, `gaze_off_frame`, `reaction_hold`, `reaction_push_in`
- 산출물: text JSON, 케이스별 previz MP4·프레임 타일, viz MP4·프레임 타일, 입력 프롬프트 전문, HTML 리포트
