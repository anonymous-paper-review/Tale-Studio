# Design References

> 수집일: 2026-03-09

---

## P1: The Meeting Room (Producer)

### 경쟁 도구 분석

| 도구 | 핵심 패턴 | 우리와의 관계 |
|------|----------|-------------|
| **ChatGPT Canvas / Claude Artifacts** | 좌 채팅 + 우 아티팩트 패널 (40:60). 라이브 구조화 출력 | 듀얼 패널 레이아웃 직접 적용 |
| **Jasper AI** | Grid (파이프라인 UI) + Brand Voice 일관성 | "define once, apply everywhere" 설정 패턴 |
| **Copy.ai** | Blog Post Wizard (4단계 점진 입력). 템플릿 + 채팅 하이브리드 | 단계별 점진 노출 + 각 단계에서 편집 가능 |
| **Notion AI** | Custom Autofill (비정형 텍스트 → 구조화 필드 자동 추출) | 대화 → settings 자동 추출 패턴 |
| **Typeform / Tally** | 한 번에 한 질문, 조건 분기, 완료율 표시 (전환율 3.5x) | Producer 질문 순서 설계 + 진행 표시 |
| **Vercel v0** | 좌 대화 + 우 라이브 프리뷰 (대화 중 실시간 갱신) | Dashboard 위젯 실시간 업데이트 |
| **Zep AI** | 매 턴마다 slot-filling 추출. "수집 완료/미완료" 추적 | settings 추출 백엔드 패턴 |

### 핵심 패턴 요약

| 패턴 | 출처 | P1 적용 |
|------|------|--------|
| 듀얼 패널 (채팅 + 출력) | ChatGPT Canvas, v0 | ~40% 채팅 : 60% 대시보드 |
| 매 턴 slot-filling 추출 | Zep AI, Notion Autofill | 매 메시지 후 settings 재추출 |
| 한 번에 한 주제 질문 | Typeform, Tally | Producer가 순차 질문 |
| 위젯 3단계 상태 | Wizard UI 패턴 | Pending → AI 추출 → 사용자 확인 |
| 진행 표시 | Typeform, Wizard | "3/5 설정 확인" 완료율 바 |
| Handoff CTA 게이팅 | PatternFly Wizard | 필수 필드 채워져야 활성화 |

---

## P2: The Script Room (Writer)

### 경쟁 도구 분석

| 도구 | URL | 핵심 패턴 | 우리와의 관계 |
|------|-----|----------|-------------|
| **Boords** | boords.com | 샷 카드 가로 그리드 + 프레임/설명/대사/카메라노트. 프레임 비율 조절 가능 | Shot Grid의 가장 가까운 레퍼 |
| **StudioBinder** | studiobinder.com/shot-list-storyboard | 샷 리스트 테이블 ↔ 스토리보드 그리드 토글. 샷 타입별 컬러코딩 | 샷 카드 컬러코딩 + 밀도 조절 |
| **Arc Studio Pro** | arcstudiopro.com | 칸반식 비트보드 + 미니멀 스크립트 에디터. 실시간 협업 | Scene Cards 패턴 검증 |
| **Descript** | descript.com | 3패널 + AI 사이드바 드래그 리사이즈 | 채팅 패널 리사이즈 근거 |
| **Runway ML** | runwayml.com | 워크플로우 기반 단일 생성 UI | 다른 접근 (참고만) |
| **Kling AI** | klingai.com | 좌 사이드바 + 메인 캔버스. Motion Brush | 카메라 모션 컨트롤 참고 |

### 채팅 패널 크기 리서치

- **현재**: w-80 (320px) — 업계 기준 "너무 좁음"
- **권장**: 360~420px (sweet spot 384px = w-96)
- **근거**: Cursor IDE, GitHub Copilot, Descript 모두 좁은 사이드바 불만 → 리사이즈 추가
- **편집:채팅 비율**: 70:30이 업계 표준

### 개선 아이디어 (우선순위순)

1. **채팅 w-80 → w-96** (384px) — 즉시 적용 가능
2. **샷 카드 썸네일 placeholder** — P3 이미지 연결 준비 (Boords 패턴)
3. **샷 타입별 컬러코딩** — 시각 스캔 개선 (StudioBinder 패턴)
4. **채팅 패널 드래그 리사이즈** — 추후 (Descript 패턴)

---

## P3: The Visual Studio (Artist)

### 경쟁 도구 분석

| 도구 | 핵심 패턴 | 우리와의 관계 |
|------|----------|-------------|
| **Scenario.gg** | Turnaround Studio: 단일 이미지 → 멀티뷰 (front/side/back). I2I influence 슬라이더. ControlNet Pose | **가장 직접적 레퍼**. Character Sheet = Turnaround Studio |
| **Leonardo AI** | Character Reference 3단계 강도(Low/Mid/High). Real-Time Canvas. Element Training (커스텀 LoRA) | Lock 기능 = 3-level strength 토글 |
| **Midjourney** | 2x2 생성 그리드 → 선택 → Upscale/Variation. Smart Folders. Vary Region (인페인팅) | 이미지 생성 그리드 + 에셋 정리 |
| **Artbreeder** | Gene Sliders (시각 속성 슬라이더). Breed/Crossfade. 반복 진화 트리 | 캐릭터 속성 미세 조정 |
| **Canva Magic Media** | 스타일 카테고리 칩 (썸네일 프리뷰). 인-에디터 생성. 테마 일괄 적용 | Cinematic Boost 칩 디자인 |
| **Kaiber Superstudio** | Canvas + Flows (모듈 AI 블록). Collections. Subject + Aesthetic 분리 | 모듈형 생성 파이프라인 |
| **Replicate** | Before/After 슬라이더 (드래그 비교). 모델별 자동 생성 파라미터 폼 | Cinematic Boost 전후 비교 |

### 핵심 패턴 → P3 매핑

| P3 기능 | 최적 레퍼런스 | 패턴 |
|---------|-------------|------|
| Character 3-View Sheet | Scenario.gg Turnaround | 단일 이미지 입력 → 멀티뷰 출력. I2I influence 슬라이더 |
| Lock Toggle | Leonardo AI Character Ref | 3단계 강도 (Low/Mid/High) + ControlNet Pose |
| Generate Sheet 버튼 | Scenario.gg Character Sheet | 원클릭 생성. 후처리 인페인팅 |
| Cinematic Boost 칩 | Canva + Shape of AI | 스타일 칩 + 썸네일 프리뷰. 강도 슬라이더. 최대 4~6개 |
| Before/After 비교 | Replicate Playground | 드래그 슬라이더로 원본 vs 부스트 비교 |
| 에셋 정리 | Kaiber Collections + Midjourney Folders | 캐릭터별/월드별 컬렉션 |

---

## P4: The Set (Director)

### 경쟁 도구 분석

| 도구 | 핵심 패턴 | 우리와의 관계 |
|------|----------|-------------|
| **Unreal Engine** | Details Panel: 카테고리별 접이식. Transform (X/Y/Z 컬러코딩). Sequencer 키프레임 | Inspector 패널 구조 직접 참고 |
| **Blender** | N-Panel: Transform + Camera Data 분리. 축별 Lock 토글. 정밀 입력/드래그 스크럽 | 6축 컨트롤 그룹핑 패턴 |
| **DaVinci Resolve** | Color Wheel (2D 포지션 + 밝기 슬라이더). Fusion Camera 6-tab Inspector | Key Light sphere UI 직접 근거 |
| **After Effects** | Camera: Orientation + X/Y/Z Rotation 분리. Light: Type + Color + Intensity | 카메라/라이팅 속성 구조 |
| **Kling AI** | 6축 카메라 (H/V/Pan/Tilt/Roll/Zoom). Motion Intensity 1-10. 20+ 프리셋 | **우리 6축과 정확히 동일** |
| **Higgsfield** | 50+ 시네마 프리셋 카드 (비디오 프리뷰). Speed 슬라이더 + Interactive 3D 회전 | 프리셋 카드 → 슬라이더 자동 채움 |
| **Wonder Studio (Flow Studio)** | AI 분해 (카메라/조명/캐릭터 독립 편집). 비블랙박스 접근 | Inspector 철학 검증 |
| **Cine Tracer** | 실제 촬영 장비 이름 카테고리 (Dolly, Crane, Hi-hat). 뷰포트 실시간 프리뷰 | 기법 명칭 → 6축 값 매핑 |
| **Luma AI Ray2** | 15개 카메라 모션 Concept. 자연어 조합 ("orbit left + crane up") | Knowledge DB 기법 조합 |

### 핵심 패턴 → P4 매핑

| P4 기능 | 권장 패턴 | 출처 |
|---------|----------|------|
| 6축 슬라이더 | 2그룹 분리: Movement (H,V,Zoom) + Rotation (Pan,Tilt,Roll) | UE, Blender |
| 3D Cube | 현재 CSS 3D 유지. 향후 드래그 인터랙션 추가 | Higgsfield |
| Key Light | 원형 포지션 + 밝기 슬라이더 + 색온도 그라데이션 (현재 구현 적합) | DaVinci |
| Knowledge DB 프리셋 | 프리셋 카드 (비디오 프리뷰) → 클릭 시 6축 값 자동 채움 | Higgsfield, Kling |
| Inspector 레이아웃 | 3컬럼 고정: Scene Nav + Shot Grid + Inspector (업계 표준) | UE, Blender, AE |

### 현재 구현 대비 갭

1. Lens Combo 섹션 미구현 (24mm/35mm/50mm)
2. Motion Intensity 다이얼 미구현
3. Knowledge DB → 프리셋 카드 UI 미구현
4. 3D Cube 드래그 인터랙션 미구현
5. 축 그룹핑 (Movement vs Rotation) 미적용

---

## P5: Post-Production (Editor)

### 경쟁 도구 분석

| 도구 | 핵심 패턴 | 우리와의 관계 |
|------|----------|-------------|
| **CapCut** | 4패널 (미디어/프리뷰/속성/타임라인). Compound Clips. 커서 모드 (선택/분할) | P5 레이아웃의 가장 가까운 모델 |
| **Descript** | 3가지 뷰 모드 (Storyboard/Script/Timeline). Global Progress Bar (항상 표시) | 씬 기반 네비게이션 + 글로벌 스크러빙 |
| **Veed.io** | 단순함 최우선. 단일 트랙. 키프레임 없음 (의도적) | MVP 단순화 전략 검증 |
| **Clipchamp** | 호버 시 타임코드 표시. Trim 핸들에 시작/길이 동적 표시. 에셋 그룹핑 | Trim UX + 샷 그룹핑 |
| **Kapwing** | **Scenes 기능 제거** (타임라인과 혼동). 타임스탬프 코멘트. Ripple Delete | 씬탭 주의점 — 우리는 "필터"로 사용 |
| **InVideo** | AI 모드 + Studio 모드 듀얼. 씬 드래그 리오더 (파란 하이라이트) | AI 생성 → 수동 편집 전환 = P4→P5 |
| **Canva Video** | 페이지 = 씬. Thumbnail View + Grid View 토글 | SC_01~SC_04 탭 패턴 |
| **Final Cut Pro** | Magnetic Timeline (자동 갭 제거). Connected Clips | 샷 리오더 시 자동 밀착 |
| **Premiere Pro** | 2025 리디자인: 둥근 모서리, Properties 패널, Fit/Fill 옵션 | UI 모던화 참고 |

### 핵심 패턴 → P5 매핑

| P5 기능 | 권장 패턴 | 출처 |
|---------|----------|------|
| 레이아웃 | Preview (상단 60%) + Scene Tabs + Timeline (하단 30%) + Toolbar (10%) | CapCut |
| 씬 탭 (SC_01~04) | 페이지-as-씬 + 탭 필터 (씬 제거한 Kapwing과 다름: 우리는 구조적 필터) | Canva, InVideo |
| 샷 타임라인 | Magnetic (자동 갭 제거) + 단일 트랙 + 썸네일 필름스트립 | FCP, Veed |
| 드래그 리오더 | 파란 하이라이트 드롭 위치 + 자동 밀착 | InVideo, FCP |
| Trim 핸들 | 컬러 엣지 + 동적 시간 레이블 + 2배 히트 영역 | Clipchamp |
| 프리뷰 플레이어 | 중앙 상단. Play/Pause + 스크러버 + 시간 + 풀스크린 | 공통 |
| 글로벌 프로그레스 | 전체 프로젝트 스크러빙 바 (씬 탭 위) | Descript |
| Draft Render | Render Queue + 진행 바 + MP4 다운로드 | 공통 |

### 주의사항

- **Kapwing의 교훈**: Scenes + Timeline 동시 사용은 혼동 유발 → 우리 씬 탭은 "필터" 역할임을 명확히
- **Veed의 교훈**: 단일 요소만 보여주는 UI 테스트 → 실패. 전체 타임라인 컨텍스트 필요
- **Web 기반 한계**: 브라우저 메모리 제한, 마우스 전용, 제한된 코덱 지원

---

## 크로스 페이지 공통 패턴

| 패턴 | 적용 페이지 | 설명 |
|------|-----------|------|
| **AI 채팅 사이드바 384~420px** | P1, P2, P4 | 320px은 너무 좁음. 업계 sweet spot |
| **프리셋/스타일 칩** | P3 (Cinematic Boost), P4 (Camera Preset) | 썸네일 프리뷰 + 강도 슬라이더 |
| **3단계 상태 위젯** | P1 (Settings), P3 (Lock) | Pending → AI 추출 → 사용자 확인 |
| **드래그 리사이즈 패널** | 전체 | Descript, VS Code 패턴. Post-MVP |
| **Magnetic 자동 밀착** | P5 (Timeline) | FCP 패턴. 갭 자동 제거 |
