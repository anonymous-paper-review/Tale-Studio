# Shot Types Reference

> 영상 촬영에서 사용하는 샷 타입 약어 정의

## Shot Type 약어표

| 약어 | 영문 | 한글 | 프레이밍 | 용도 |
|------|------|------|----------|------|
| **ECU** | Extreme Close-Up | 익스트림 클로즈업 | 눈, 입술, 손 등 신체 일부 | 감정 강조, 디테일, 긴장감 |
| **CU** | Close-Up | 클로즈업 | 얼굴 전체 (어깨 위) | 감정 표현, 대화, 리액션 |
| **MCU** | Medium Close-Up | 미디엄 클로즈업 | 가슴~머리 | 인터뷰, 대화 |
| **MS** | Medium Shot | 미디엄 샷 | 허리~머리 | 대화, 액션, 일반 장면 |
| **MFS** | Medium Full Shot | 미디엄 풀샷 | 무릎~머리 | 제스처 포함 대화 |
| **FS** | Full Shot | 풀샷 | 전신 (머리~발) | 캐릭터 소개, 의상, 동작 |
| **WS** | Wide Shot | 와이드 샷 | 인물 + 주변 환경 | 장소 설정, 관계 표현 |
| **EWS** | Extreme Wide Shot | 익스트림 와이드 | 전경, 풍경 위주 | 스케일, 고립감, 에픽 |
| **OTS** | Over-the-Shoulder | 오버더숄더 | 어깨 너머로 상대방 | 대화, 시점 공유 |
| **POV** | Point of View | 1인칭 시점 | 캐릭터가 보는 것 | 몰입, 서스펜스 |
| **TRACK** | Tracking Shot | 트래킹 샷 | 피사체 따라 이동 | 동적 장면, 추격 |
| **2S** | Two Shot | 투샷 | 두 인물 함께 | 관계, 대화 |

## Knowledge DB에서 사용

`knowledge_techniques.shot_type_affinity` 컬럼에 배열로 저장:

```yaml
# 예: handheld 기법
shot_type_affinity: [MS, CU, OTS]
# → 미디엄샷, 클로즈업, 오버더숄더와 어울림
```

## 쿼리 예시

```python
# MS 샷에 어울리는 카메라 기법 조회
knowledge_db.query(
    category="camera_language",
    shot_type="MS",
)
```

## 참고

- 약어는 업계 표준을 따름 (헐리우드/영화학 교재 기준)
- 프로젝트 내 일관성을 위해 이 문서를 source of truth로 사용
- 추가 샷 타입 필요시 이 문서 먼저 업데이트 후 코드 반영
