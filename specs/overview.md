# Tale Studio - Product Spec

> **DEPRECATED** (2026-03-03): 이 문서는 V1 기준. 현재 SoT:
> - MVP 범위/기술 스택: `specs/mvp_scope.md`
> - UX 상세: `specs/ux_pages.md`
> - 의사결정: `specs/decisions.md`
>
> 아래 내용은 제품 철학, 용어 정의, 파이프라인 개념 참조용으로만 유효.
>
> version 0.2 | 2026-02-25

## 1. 제품 개요

B2B AI 영상 제작 도구. 타겟: 영화감독, 시나리오 작가 등 시네마 종사자.

**핵심 가치**: 텍스트 입력 → 전문 촬영 기법이 적용된 고품질 AI 비디오 자동 생성

**차별화**: Knowledge DB 기반 cinematography RAG (카메라워크, 조명, 연출 패턴)

---

## 2. 용어

| 용어 | 정의 |
|------|------|
| **Story** | 전체 스토리 = 1개 영상 프로젝트 |
| **Scene** | 시간/장소가 동일한 연속 장면 (여러 Shot으로 구성) |
| **Shot** | 최소 생성 단위 = API 호출 1회 = ~5초 영상 |

**MVP 목표**: ~8분 영상 = 4개 Scene (기승전결) = 24~48 Shot

---

## 3. UX 플로우 (4 Page)

> 상세 와이어프레임: `specs/reference/UX.pdf`
> 경쟁사 참고: oiioii.ai (`specs/reference/oii_*.png`)

### 상단 탭: 역할 기반 네비게이션

```
[ Producer ] [ Writer ] [ Pre-viz ] [ Director ] [ Editor ]
     P1           P2         P3          P4
```

### Page 1: Ground (Producer)

**목적**: 프로젝트 초기 설정

- 스토리 텍스트 입력 (프롬프트 창)
- 캐릭터 이미지 첨부 (Max 3장)
- Genre / Style 선택 (143 Style)
- My Assets 연결
- AI 대화로 프로젝트 설정 수집:
  - 제작 길이, 화면 비율, 장르 (뮤직비디오/숏츠/장편), 대사 언어, 소요 코인

### Page 2: Story Writer (Writer)

**목적**: 스토리 → 씬 구성 (L1 동작)

- AI 작가를 채팅방에 초대 → 씬 구성 논의/수정
- 좌: 대본 작가 패널 (스토리 요약 + 출연진 목록/설명)
- 우: 씬별 샷 텍스트 목록
- 씬마다 프롬프트 글 수정 가능
- 하단: 프로젝트 설정 표시 (제작 길이, 비율, 장르, 언어, 코인)

### Page 3: Storyboard (Pre-viz)

**목적**: 시각 자산 제작 + 스토리보드 생성 (L2 동작)

3개 서브탭:

| 탭 | 기능 |
|----|------|
| **Char** | 캐릭터 아트 (첨부 or AI 생성). 멀티앵글 시트 |
| **Stage** | 무대/배경 아트 (첨부 or AI 생성) |
| **Storyboard** | 씬→샷 분해, 샷별 이미지 생성/재생성. 씬별 스크롤 |

- 좌: 채팅 패널 (캐릭터/무대/스토리보드 아티스트 3명 초대)
- 우: 메인 작업 영역

### Page 4: Cinema Directing (Director)

**목적**: 촬영 기법 적용 + 영상 생성 (L2-3 + L3 동작)

3개 서브탭:

| 탭 | 기능 |
|----|------|
| **Cinematographic** | 샷별 카메라/조명 설정 (6축 슬라이더 + 프리셋). Camera Explorer 통합 |
| **Shot Frames** | End Frame 추가/편집. 씬 간 연결 |
| **Music** | 배경음악 생성 |

- 좌: 샷 목록 (스토리보드 뷰)
- 우: 카메라/조명 에디터 + 3D 프리뷰

### (미구현) Page 5: Editor

- AI 평가
- 앞뒤 Crop 도구
- 비디오 순서/삽입/삭제 Merge 도구

---

## 4. 시스템 아키텍처

### 3-Level Pipeline

```
[사용자 입력] → [Pumpup] → [L1] → [L2] → [L3] → [Video API]
                  ↑           ↑       ↑       ↑
              시각정보확장  씬분할  샷시퀀스  프롬프트생성
```

| Level | 이름 | 역할 | UX 매핑 | 상세 스펙 |
|-------|------|------|---------|----------|
| Pre | Pumpup | 스토리에 시각화 정보 추가 | P2 진입 시 | `layers/L1_scene_architect.md` |
| L1 | Scene Architect | 스토리 → 씬 분할 + 캐릭터/로케이션 | P2 Writer | `layers/L1_scene_architect.md` |
| L2 | Shot Composer | 씬 → 샷 시퀀스 + 대화 + 이미지 생성 | P3 Pre-viz | `layers/L2_shot_composer.md` |
| L3 | Prompt Builder | 샷 → 최종 프롬프트 + Knowledge DB | P4 Director | `layers/L3_prompt_builder.md` |

### AVA Framework (확장 입력 처리)

다양한 입력(음악/스토리/게임)을 영상으로 변환하는 공통 프레임워크.

```
Input → [Anchor] → [Bridge] → [Expression] → L1 입력
         핵심DNA     번역전략     시각요소
```

> 상세: `specs/ava_framework.md`

### 일관성 전략

- 캐릭터당 멀티앵글 3장 (정면/측면/3quarter)
- L1에서 Fixed Prompt 정의 → 모든 샷에 주입
- 캐릭터 포함 샷: I2V, 배경/분위기 샷: T2V

---

## 5. 기술 스택

### 영상 생성 API

| 용도 | API | 비고 |
|------|-----|------|
| T2V (카메라 제어) | **Kling** | 6축 수치 파라미터 (유일). std 5s ~290초 |
| T2V (품질 우선) | **VEO** (Google) | 프롬프트 기반, 해석 우수 |
| T2I | **DALL-E 3** / Imagen | 캐릭터 레퍼런스 이미지 |

### Knowledge DB

- **Supabase**: `knowledge_techniques` 테이블 (camera_language / rendering_style / shot_grammar)
- **로컬 백업**: `databases/knowledge/*.yaml`
- **Video Reference DB**: `videos` + `shot_analysis` 테이블

### 웹 스택

- Backend: FastAPI + Uvicorn
- Frontend: HTML + Vanilla JS + Three.js (3D 프리뷰)
- Network: Tailscale (`100.92.201.103:8000`)

---

## 6. 핵심 원칙

1. **모델은 API로** — 외부 API 사용, 로컬 모델 X
2. **3-Level 구조** — 점진적 구체화 (Scene → Shot → Prompt)
3. **T2I2V 방식** — 이미지 우선, 캐릭터/스타일 일관성 확보
4. **LLM 우선 + 패턴 축적** — 템플릿 없이 시작, 실험하며 패턴화
5. **Knowledge DB 차별화** — 전문 촬영 기법 RAG로 프롬프트 품질 향상

---

## 7. 관련 문서

| 문서 | 용도 |
|------|------|
| `specs/layers/L1_scene_architect.md` | L1 (+ Pumpup) 상세 스펙 |
| `specs/layers/L2_shot_composer.md` | L2 상세 스펙 |
| `specs/layers/L3_prompt_builder.md` | L3 상세 스펙 |
| `specs/ava_framework.md` | AVA Framework 상세 |
| `specs/decisions.md` | 의사결정 로그 |
| `specs/reference/UX.pdf` | 와이어프레임 원본 |
| `PROGRESS.md` | 진행 상황 |
| `BUGS.md` | 버그 추적 |
