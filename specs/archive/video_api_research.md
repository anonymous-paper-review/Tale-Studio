# 영상 생성 AI API 기술 검증 리서치

> 조사일: 2026-02-12

## 1. 서비스별 카메라/라이팅 제어 현황

### Kling (Kuaishou)

- **카메라**: 6축 수치 파라미터 (horizontal, vertical, pan, tilt, roll, zoom) -10~+10
- **라이팅**: 프롬프트 텍스트만 (dedicated 파라미터 없음)
- **모델**: kling-v2-master, kling-v1-6 등
- **기타**: duration 5/10s, aspect_ratio 16:9/9:16/1:1, mode std/pro, negative_prompt
- **인증**: JWT (HS256) — access_key + secret_key
- **API**: `https://api.klingai.com/v1/videos/text2video`

### Google VEO (Gemini API / Vertex AI)

- **카메라**: 프롬프트 텍스트만 (시네마토그래피 용어 해석 정밀)
- **라이팅**: 프롬프트 텍스트만 (해석 품질 우수)
- **특이**: Reference Images 최대 3장, First/Last Frame 제어, 네이티브 오디오 (Veo 3+)
- **비용**: $0.15~0.40/초 (가장 비쌈)

### xAI Grok Imagine (Aurora Engine)

- **카메라**: 프리셋 (zoom, timelapse, pan, pull-back) + 프롬프트
- **라이팅**: Scene Control 기능 + 프롬프트
- **특이**: 네이티브 오디오, 생성 속도 ~17초 (업계 최단), Style Transfer
- **API**: 2026.01 출시 (안정성 미검증)

## 2. 비교 요약

| 항목 | Kling | VEO | Grok Imagine |
|------|-------|-----|-------------|
| 카메라 제어 (API) | ⭐⭐⭐⭐⭐ 수치 | ⭐⭐⭐⭐ 프롬프트 | ⭐⭐⭐⭐ 프리셋+프롬프트 |
| 라이팅 제어 | ⭐⭐⭐ 프롬프트 | ⭐⭐⭐⭐ 프롬프트 | ⭐⭐⭐⭐ Scene Control |
| 가격 (8초 1회) | ~$0.40~0.80 | $1.20~3.20 | ~$0.30~0.50 |
| 생성 시간 | 30초~5분 | 1~3분 | ~17초 |
| API 접근성 | 안정적 | 안정적 | 최근 출시 |
| B2B 품질 차이 | 없음 | 없음 | 없음 |

## 3. LLM 레이어 필요 여부

| 시나리오 | LLM 필요 | 이유 |
|---------|---------|------|
| 기술적 프롬프트 직접 입력 | ❌ | API가 직접 해석 |
| 비전문가 자연어 입력 | ✅ | 구체적 프롬프트 변환 필요 |
| Kling 카메라 파라미터 설정 | ✅ | 자연어 → 수치 매핑 |
| 멀티샷 스토리보드 | ✅ | 일관성 관리, 프롬프트 체이닝 |

## 4. PoC 결정

- **대상 API**: Kling (6축 카메라 수치 제어 유일)
- **변환 방식**: 룰 기반 매핑 (camera_presets.yaml)
- **UI**: Three.js 3D 프리뷰 + 슬라이더 + FastAPI 백엔드
