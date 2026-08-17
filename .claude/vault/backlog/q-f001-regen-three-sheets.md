# 실사 그리드 인물 바꿔치기 — 확정 3건 재생성 (오너 행동)

```yaml
id: q-f001-regen-three-sheets
source: fixlog:F-001 (원문: .claude/vault/_archive/_FIXLOG.md)
kind: (해당 없음 — 사람이 실행)
blockers: [human-labor:UI에서 단일 재생성 3회]
status: needs-owner
priority: high
```

- **맥락 (사람 말로)**: 여러 샷을 한 장에 그리는 일괄 생성 경로가 칸마다 어떤 인물을 그릴지
  지정하지 않아, 소수 인물이 다수 인물로 잘못 그려진 그림 3장이 확정됐다. 코드는 고쳐졌지만
  이미 만들어진 그림은 소급되지 않는다 — 사람이 다시 만들어야 한다.
- **할 것**: 아래 3건을 **UI 단일 재생성**으로 다시 만든다 (`/api/director/generate-storyboard` 경로
  — 샷 프롬프트 텍스트가 실려 인물 정체가 보증된다). SQL로 지우지 말 것(기존 URL을 잃는다).
  - `a5cb2cae` `sh_04_18` (왕국의 추적자 단독 샷 — 소녀로 그려짐)
  - `dc531572` `sh_03_13` (kingdom_hunters)
  - `e1a9fd08` `sh_03_17` (kingdom_pursuers)
- **닫히는 조건**: 3건 재생성 후 육안으로 제 인물 확인.
