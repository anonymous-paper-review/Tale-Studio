# Claude Code Harness 사용 패턴 비교 리서치 (2026-04-27 ~ 2026-05-27)

> 출처: Reddit (r/ClaudeAI · r/ClaudeCode · r/LocalLLaMA 어그리게이션), X/Twitter, Hacker News, 개인 블로그 (dev.to, Medium, HackerNoon, Towards Data Science), Anthropic 공식 docs (`code.claude.com`), GitHub OSS 리포 (oh-my-claudecode, spec-kit, ralph-wiggum, SuperClaude 등). 100+ 소스를 4개 병렬 리서치 에이전트로 수집·교차검증.

---

## 0. TL;DR

지난 30일간 커뮤니티가 수렴해 가는 **3개 골격**:

1. **CLAUDE.md = 얇은 라우터(≤200줄)** + 나머지는 `.claude/{rules,skills,agents,commands,hooks}/`로 분산. `@imports`로 묶고, **subdirectory CLAUDE.md는 on-demand 자동 로드**된다는 사실을 활용.
2. **Hooks = 확정(guarantee)**, **CLAUDE.md = 제안(suggestion)**. "반드시 일어나야 하는 것"은 hooks로 옮긴다 (Akshay Pachaar의 명제, 거의 모든 시니어가 인용).
3. **Skills/Subagents = on-demand 로드 가능한 컨텍스트 절약 장치**. CLAUDE.md에 박지 말고 분리하라.

그 위에 선택적으로 얹는 4개 레이어:
- **Karpathy LLM Wiki** (raw → wiki → synthesis) — 사실상 5월의 메가 트렌드
- **Auto-Memory** (`~/.claude/projects/<id>/memory/MEMORY.md`) — Anthropic이 2.1.59에서 정식 도입 (200줄/25KB index)
- **Spec-driven** (GitHub spec-kit: `specs/<feature>/{spec,plan,tasks}.md`)
- **Orchestration frameworks** (oh-my-claudecode, SuperClaude, Ralph Wiggum, `/ultraplan`)

---

## 1. 12가지 사용 패턴 카테고리

### P1. CLAUDE.md as Router (얇은 라우터)
**아이디어**: 루트 `CLAUDE.md`는 50~200줄, "어디서 무엇을 보는가" 표 + `@imports`로 깊이 있는 docs를 가리키게 한다.

**대표 사례**
- diet103: BEST_PRACTICES.md 1,400줄 → 루트 CLAUDE.md 200줄 + 디렉토리별 CLAUDE.md 50~100줄로 분할.
- 본 프로젝트(`tale-studio`)의 CLAUDE.md "라우터" 표(`무엇 하려면 / 어디 보는가`)가 이 패턴의 교과서적 예시.
- Addy Osmani: `/init` 자동생성은 "비용 +20%, 성공률 −2~3%"라며 자동생성보다 라우터 + 유지보수 subagent 권장.

**Anthropic 공식 가이드 (`code.claude.com/docs/en/memory`)**
- "Target under 200 lines per file."
- `@path/to/file` import는 **컨텍스트 절감 효과 없음** (전부 launch 시점에 로드, max depth 4).
- `<!-- ... -->` HTML 코멘트는 inject 전 stripping → 사람용 노트로 사용.

---

### P2. Hierarchical CLAUDE.md (디렉토리별)
**아이디어**: `src/api/CLAUDE.md`, `supabase/CLAUDE.md` 등을 각 디렉토리에 둔다. Claude가 그 디렉토리의 파일을 **읽을 때 자동 로드**된다 (lazy).

**핵심 사실**
- 서브디렉토리 CLAUDE.md는 launch 시점이 아닌 **on-demand**로 자동 로드 (공식 문서 확인).
- `claudeMdExcludes` (settings.local.json)로 글로브 제외 가능.
- `--add-dir`는 기본적으로 추가 디렉토리의 CLAUDE.md를 로드하지 않음 (`CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1` 필요).

**파생 패턴: AGENTS.md 계층 (DeepInit)**
- OMC의 `deepinit` 스킬은 모든 디렉토리에 AGENTS.md를 생성.
- **함정**: Claude Code는 AGENTS.md를 직접 안 읽음 → `@AGENTS.md` import 또는 symlink (`ln -s AGENTS.md CLAUDE.md`) 필요.
- 인용 stat: "median runtime −28.6%, tokens −16.6%."

---

### P3. `.claude/rules/` Path-Scoped Rules
**아이디어**: 토픽별 규칙 파일을 `.claude/rules/*.md`에 두고 frontmatter `paths:` 글로브로 적용 범위 한정.

```yaml
---
paths: ["src/api/**/*.ts"]
---
- 모든 핸들러는 zod 스키마로 입력 검증
- Supabase 클라이언트는 server-side에서만 import
```

**장점**: CLAUDE.md를 비대하게 만들지 않고 영역별 컨벤션 분리. 모노레포·병렬 개발에 강함.

---

### P4. Skills (`.claude/skills/<name>/SKILL.md`)
**아이디어**: 다단계 워크플로/가이드를 "on-demand 로드되는 캡슐"로 만든다. Anthropic 공식 spec.

**핵심 메커니즘**
- 1,536자 frontmatter 합산 cap → 본문은 500줄 이하 권장. 그 이상은 sibling 파일로 분리하고 SKILL.md에서 참조만.
- `!command` (인라인) / ```` ```! ```` (블록) — **Claude가 보기 전에** shell 실행 결과 inject. 동적 컨텍스트 주입의 핵심.
- 한 번 호출되면 그 세션 내내 컨텍스트에 남음. 컴팩션 후엔 최대 25,000 토큰까지 재첨부.
- `.claude/commands/*.md` (legacy 슬래시 커맨드)도 동일 슬래시 네임으로 노출 (2.1.3에서 skill+command 단일화).

---

### P5. Subagents (`.claude/agents/*.md`)
**아이디어**: 컨텍스트 격리된 전문 에이전트. planner/executor/reviewer/verifier 분리.

**대표 분포**
- VoltAgent `awesome-claude-code-subagents` — 100+ 전문 agent (DB, frontend, infra, security 별).
- diet103: 10개로 캡 (`code-architecture-reviewer`, `build-error-resolver`, `strategic-plan-architect` 등).
- HAMY: 9개 reviewer를 `/code-review` 슬래시로 병렬 실행.
- Anthropic 공식 `/ultraplan`: 3 explorer + 1 critic.

**필수 frontmatter 룰**
- `tools:`로 도구 allowlist 명시 (Tembo: "Ship every agent with an explicit tools line").
- `model: haiku|sonnet|opus|inherit` — 비용 라우팅 핵심.
- `Agent` 도구는 subagent에게 비공개 → subagent는 다른 subagent를 못 띄움.
- `isolation: worktree` — 임시 git worktree에서 격리 실행.

**비용 시그널 (CloudZero 2026-05-18)**: 1세션 ~$13/일, 3병렬 ~$30~40/일 (Max 5x 필요), 5~10병렬 ~$50~130/일 (Max 20x).

---

### P6. Slash Commands (`.claude/commands/*.md`)
**아이디어**: 자주 쓰는 워크플로를 `/branch`, `/pr`, `/push`, `/code-review` 등 슬래시 커맨드로 캡슐화. 종종 Haiku로 묶어 비용 절감.

**대표 컬렉션**
- wshobson/commands (production-ready)
- SuperClaude의 `/sc:*` 30개 + 9개 persona
- Avi Chawla "10 power-user commands", m0h "50 slash commands"

**Anthropic 2.1.63 신상**:
- `/simplify` — 변경된 diff를 3 병렬 에이전트(reuse/quality/CLAUDE.md-compliance)로 검토.
- `/batch` — 독립 작업 묶음 병렬 실행.
- `/loop 5m /command` — 인터벌 자동 실행.
- `/schedule` — 크론으로 원격 routine.

---

### P7. Hooks (deterministic guarantees)
**아이디어**: "반드시 일어나야 하는 것은 hook으로." Akshay의 명제.

**대표 패턴**
| 이벤트 | 용도 |
|---|---|
| `SessionStart` | MEMORY.md / wiki index inject |
| `UserPromptSubmit` | 스킬 자동 활성화, 긴 prompt 차단 |
| `PreToolUse(Bash)` | `rm -rf`, `git push --force`, `--no-verify` 차단 |
| `PostToolUse(Write\|Edit)` | prettier/black/ruff 자동 포맷 |
| `Stop` | 빌드/테스트 검증 게이트, Ralph 루프 재진입 |
| `PreCompact` | 작업 상태를 dev-docs에 저장 |

**필수 규칙**
- exit 0 = 성공 / exit 2 = **blocking error** (stderr가 Claude에 전달) / 기타 = 비-차단 경고.
- 핸들러 종류: `command`, `http`, `mcp_tool`, `prompt`, `agent`.
- 플러그인 subagent는 보안상 hooks/mcpServers/permissionMode 무시.

**Anti-pattern (diet103)**: Prettier-as-hook은 system-reminder 피드백이 토큰을 잡아먹어 비효율.

---

### P8. Auto-Memory (`~/.claude/projects/<id>/memory/`)
**아이디어**: Anthropic이 2.1.59부터 공식 탑재. 세션 간 학습이 자동으로 markdown에 적립.

**구조**
```
~/.claude/projects/<project-hash>/memory/
├── MEMORY.md          # 200줄 / 25KB index, 세션 시작 시 자동 로드
├── debugging.md       # 토픽 파일, on-demand
├── api-conventions.md
└── ...
```

**핵심 룰**
- MEMORY.md는 "다이어리가 아닌 디렉토리" — 각 라인은 토픽 파일을 가리키는 ≤150자 포인터.
- `<project>`는 git remote 해시 (없으면 디렉토리 해시) → **모든 worktree가 한 메모리 dir 공유**.
- 토글: `autoMemoryEnabled: false` or `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`.
- `autoMemoryDirectory`로 위치 변경 — **단 user/managed scope만 허용** (악성 클론 repo가 메모리 쓰기 경로를 가로채는 것을 막기 위해).

**관련 미래 기능 (leak)**: `/memory`에 "Auto-dream" — 백그라운드 subagent가 최근 세션을 검토해 MEMORY.md를 정리 (Rohan Paul).

---

### P9. Karpathy LLM Wiki (raw → wiki → synthesis)
**아이디어**: RAG처럼 매 query마다 raw doc를 검색하는 대신, LLM이 **한 번 컴파일**해서 markdown wiki를 만들어 둠. 이후 query는 pre-synthesized wiki만 읽음.

**원본**: Karpathy gist (2026-04-04, 5,000+ stars). 5월 X의 메가 트렌드.

**표준 레이아웃 (llm-wiki-plugin, karpathy-wiki, wiki-skills 공통)**
```
raw/                   # 변경 불가 원본
wiki/
├── SCHEMA.md          # 위키 구조 설명
├── index.md           # 카탈로그, 항상 먼저 읽기
├── log.md             # append-only 변경 이력
├── sources/           # 소스별 페이지
├── entities/          # 사람·조직·제품
├── concepts/          # 정의·아이디어
└── synthesis/         # LLM이 작성한 cross-cut
```

**오퍼레이션**: `wiki-ingest`, `wiki-query`, `wiki-audit` (소스로 fact-check), `wiki-lint`.

**프로덕션 사례**
- Aaron Fulkerson "Exo": 14 MCP server (Gmail, Slack, HubSpot 등 7개 custom) + 26 skill + 8 hook. Daily/Weekly/Permanent 3-tier 학습 루프. 학습이 "graduate"되면 CLAUDE.md 규칙으로 승격.
- Ivan Kuznetsov (HackerNoon, 2026-04-21): 6개 프로젝트에 위키 적용. post-commit hook이 `--max-budget-usd 0.50`으로 wiki 갱신. 월 $10~20.
- Allie K. Miller "Claudeopedia": Karpathy wiki + `/last30days` + custom `/wiki` skill 결합 (오늘 우리가 쓴 그 스킬).

---

### P10. Spec-Driven Dev (GitHub spec-kit)
**아이디어**: 코드 전에 `specs/`에 명세를 먼저 쓴다. Claude·Copilot·Gemini CLI 공통.

**spec-kit 설치 & 플로우**
```bash
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git
specify init . --ai claude
```

```
.specify/{memory/constitution.md, scripts/, templates/}
specs/<feature>/{spec.md, plan.md, tasks.md, data-model.md, contracts/, quickstart.md, research.md}
```

5단계 슬래시 (모두 `/speckit.*`로 네임스페이스):
1. `/speckit.constitution` — 가이딩 원칙
2. `/speckit.specify` — WHAT (스택 무관)
3. `/speckit.plan` — HOW (코드베이스 읽고 기술 전략)
4. `/speckit.tasks` — 순서화된 작업 분해
5. `/speckit.implement` — 실행

**커뮤니티 변형**
- reymondyncierto: `specs/TASK-YYYY-MM-DD-###.spec.md` — ≤30분 단위 atomic task. `goal/scope_in/scope_out/constraints/validation/status` 6-pillar.
- Park JaeHo의 Claude Code PM, sermakarevich의 `sddw` (요구사항·분석·디자인·구현 사이 컨텍스트 클리어링).

**반론** (Rod Johnson): 폭포수가 되기 쉽다. iterative chat이 더 낫다고 주장.

---

### P11. Orchestration Frameworks (OMC, SuperClaude, Ralph 등)
**카테고리 매핑**

| 프레임워크 | 핵심 가치 | 캐시/state 위치 |
|---|---|---|
| **oh-my-claudecode (OMC)** | 32 agent + 36 skill, 5-stage team pipeline (plan→prd→exec→verify→fix), 모델 라우팅 (haiku/sonnet/opus) | `.omc/{specs,plans,state,notepad.md,project-memory.json,artifacts,sessions,logs}/` |
| **SuperClaude** | 30개 `/sc:*` 커맨드 + 9개 persona (`--persona-architect`, `--persona-security`) | `.claude/` 표준 |
| **Ralph Wiggum (공식 플러그인)** | Stop hook이 종료를 가로채고 동일 prompt 재투입; `--max-iterations` + `--completion-promise` | session 내부 (외부 bash 루프 없음) |
| **Anthropic `/ultraplan`** | 3 explorer + 1 critic이 브라우저에서 plan 작성, 로컬/원격 실행 | cloud (Anthropic 인프라) |
| **claude-squad / workmux** | tmux + git worktree로 2~3 병렬 세션 | per-worktree |

**OMC 트레이드오프 (ice-ice-bear, andrew.ooo 리뷰)**
- ✅ 30~50% 토큰 절감 주장 (모델 라우팅), 5-stage 파이프라인이 실제 엔지니어링 워크플로 모사.
- ❌ 비-trivial 작업에서 토큰 더 많이 씀, 27/32개 agent 차별화 정당화 부족, tmux 의존, 코드베이스 무게(6.9MB TS) 비판.

**Ralph Wiggum 경제학**
- ✅ YC 해커톤 팀이 하룻밤에 6 repo 출하 (~$297). FP 컴파일러 3개월간 단일 prompt.
- ❌ 50-iter 루프가 $50~100+. 모호한·아키텍처·보안 작업엔 부적합. Alex Finn "이제 native task-management 있어서 Ralph는 죽었다." Ian Nuttall "Anthropic plugin 쓰지 말고 외부 포팅하라."

---

### P12. MCP Servers (외부 컨텍스트 허브)
**아이디어**: Notion·Gmail·Slack·Linear 등 외부 시스템을 MCP 서버로 노출. Claude가 라이브 데이터를 읽음.

**핵심 사실**
- `.mcp.json` (project, committed) / `~/.claude.json` (user/local) — **settings.json이 아니다.**
- 서버 타입: `stdio`, `http` (= `streamable-http`), `sse` (deprecated), `ws`.
- env 확장: `${VAR}`, `${VAR:-default}`.
- 도구명: `mcp__<server>__<tool>` (예: `mcp__memory__create_entities`) — hook matcher와 정확히 맞춰야 함.
- **Tool Search** (default-on, 2.1.7): 47% MCP context 절감 (51K → 8.5K). `alwaysLoad: true`로 force-load 가능하지만 권장 안 함.

**대표 사례**
- Geoffrey Litt: Notion MCP + 커스텀 슬래시. `/implement #7` → 칸반에서 작업 찾고, 빌드하고, Notion에 보고.
- Andrew Ng의 Context Hub (`chub`) — `~/.claude/skills/get-api-docs/SKILL.md`로 인스톨해 최신 API 문서 on-demand.
- Aaron Fulkerson "Exo" — 14 server, 7 custom.

**불만점**: 4개 MCP server가 67K 토큰 잡아먹음. Anthropic 공식 connector(`notion-mcp-server`) deprecated. McPick 같은 토글 CLI로 세션별 enable.

---

## 2. 비교표 — 12개 패턴 한눈에

> 컨텍스트 비용 / 결정성(determinism) / 셋업 난이도 / 유지보수 / 협업 친화도 / 토큰 효율 6축 비교 (●=강함, ○=보통, ·=약함).

| # | 패턴 | 컨텍스트 비용 | 결정성 | 셋업 | 유지보수 | 협업 | 토큰효율 | 대표 사례 |
|---|------|:---:|:---:|:---:|:---:|:---:|:---:|---|
| P1 | CLAUDE.md 라우터 | ○ | · | ● | ○ | ● | ● | tale-studio 현재 / Akshay Pachaar |
| P2 | Hierarchical CLAUDE.md | ● (lazy) | · | ○ | · | ○ | ● | diet103, deepinit |
| P3 | `.claude/rules/` paths | ● | ○ | ● | ○ | ● | ● | 공식 docs |
| P4 | Skills | ● (lazy) | ○ | ○ | ○ | ● | ● | OMC, SuperClaude |
| P5 | Subagents | ○ | ○ | ○ | · | ● | · (4× tokens) | VoltAgent, HAMY |
| P6 | Slash commands | ● | ● | ● | ● | ● | ● | wshobson, alexop |
| P7 | Hooks | ● | ● (guarantee) | ○ | ○ | ● | ● | Blakecrosley, Dotzlaw |
| P8 | Auto-Memory | ● (200줄 cap) | · | ● (default-on) | ● (auto) | · (per-machine) | ● | 공식 2.1.59+ |
| P9 | Karpathy LLM Wiki | ○ (synthesis only) | · | · | ○ (자동 갱신) | ● (markdown) | ● | Fulkerson Exo, Kuznetsov |
| P10 | Spec-Driven | · (specs 자체 무게) | ● (audit trail) | ○ | · (drift) | ● | ○ | spec-kit, reymondyncierto |
| P11 | Orchestration FW | · (heavy) | ○ | · | · | ● (zero-config) | ○ (claim) | OMC, SuperClaude, Ralph |
| P12 | MCP Servers | · (67K bloat) | · | ○ | ○ | ● (live data) | ○ (Tool Search 후) | Notion, Context Hub |

---

## 3. 장단점 상세

| 패턴 | 장점 | 단점 / 함정 |
|------|------|------|
| **P1 라우터 CLAUDE.md** | 모든 세션에 작은 컨텍스트만; 어디 봐야 할지 한눈에; 팀 공유 자연스러움 | `@imports`가 lazy 아님(이슈 #11759); 200줄 넘으면 instruction adherence 측정 가능하게 떨어짐 |
| **P2 Hierarchical CLAUDE.md** | 자동 lazy 로드; 영역별 컨텍스트 정밀; AGENTS.md stat: runtime −28%, tokens −16% | drift; AGENTS.md는 Claude가 안 읽음(symlink/`@import` 필요); 디렉토리별 작성·관리 부담 |
| **P3 paths-scoped rules** | CLAUDE.md 슬림 유지; 모노레포 영역별 다른 컨벤션 가능 | discoverability 비용 (Osmani 지적); 글로브 충돌 시 우선순위 모호 |
| **P4 Skills** | on-demand 로드로 토큰 절약; `!cmd` 동적 컨텍스트 inject 강력; 컴팩션 후 25K 재첨부 | auto-invoke 신뢰성 낮음(hooks로 강제 필요 — Carl Vellotti 패턴); 500줄 넘으면 context rot |
| **P5 Subagents** | 컨텍스트 격리, 병렬 리뷰(75%+ 유용성), 비용 라우팅 가능 | 토큰 최대 4× (single 대비); nested subagent 불가; cold-start latency; bg subagent는 미승인 도구 auto-deny |
| **P6 Slash commands** | 워크플로 캡슐화; Haiku 백킹으로 ~20s 응답; 팀 git 공유 자연스러움 | 컨벤션 drift; argument parsing edge case; 너무 많으면 어떤 커맨드 있는지 잊음 |
| **P7 Hooks** | **deterministic** — 100% 강제 (vs prompt compliance 70~90%); 안전·포맷·검증 자동화 | mid-plan blocking이 reasoning 깸; <500ms 안 지키면 latency 누적; 너무 많으면 system-reminder 토큰 폭증 (openaitoolshub: "3개만 운영") |
| **P8 Auto-Memory** | Anthropic 공식 (2.1.59+); CLAUDE.md 안 쓰고도 cross-session 학습; 모든 worktree 공유 | 200줄/25KB index cap; **머신별** (sync 안 됨); index rot 가능 — 명시적 계층 필요(Conneely) |
| **P9 Karpathy LLM Wiki** | 매번 raw 읽는 대신 pre-synthesized → query 응답 빠르고 일관됨; 시간 갈수록 compound; AI-maintained wiki가 사람 wiki보다 정확 (Fulkerson 주장) | qmd/ripgrep 인덱스 직접 셋업; hook + skill 배선 필요; CLAUDE.md에 "wiki를 봐라" 명시 안 하면 안 봄 |
| **P10 Spec-Driven** | 컨텍스트 drift 제거; spec 자체가 audit trail; 다양한 모델·세션 간에 일관됨; blast radius 감소 | up-front 시간; 간단 작업엔 과잉 (HN: "벤치마크 의문"); 잘못 쓰면 폭포수 (Rod Johnson) |
| **P11 Orchestration FW (OMC 등)** | zero-config, magic keyword 라우팅, 모델 라우팅으로 30~50% 절감 주장; 5-stage 파이프라인이 실제 엔지니어링 모사 | **non-trivial 작업에서 토큰 더 씀**; 다수 에이전트 차별화 정당화 부족; tmux 의존; 코드베이스 무거움; 디버깅 어려움 |
| **P12 MCP servers** | live data, 외부 시스템 동기; Notion/Gmail/Slack 생산성 unlock; Tool Search로 컨텍스트 47% 절감 | 기본 67K 토큰 컨텍스트 세금; deprecated connector 다수; OAuth 셋업; attack surface 증가 |

---

## 4. 충돌 의견 & 합의된 룰

### 합의된 룰 (cross-source consensus)

1. **CLAUDE.md ≤ 200줄**, 가능하면 50~100줄. 200줄 넘으면 instruction adherence 측정 가능하게 떨어진다.
2. **Hooks > CLAUDE.md** for anything that MUST happen. CLAUDE.md는 advisory.
3. **Subagents는 `tools:` allowlist 명시 필수**. `code-reviewer`는 read-only.
4. **Skills는 500줄 이하**, 그 이상은 sibling 파일로 분리하고 SKILL.md에서 참조.
5. **MCP는 4개 이하 권장** + Tool Search default-on 유지.
6. **AGENTS.md는 Claude Code가 안 읽는다** → `@AGENTS.md` 또는 symlink.
7. **`/init` 자동생성보다 수동 라우터 + 유지보수 subagent** (Osmani: 자동생성은 비용 +20%, 성공률 −2~3%).

### 의견 충돌

| 쟁점 | A 진영 | B 진영 |
|------|--------|--------|
| 커스터마이즈 깊이 | "vanilla로 충분" (Boris Cherny 본인) | "CLAUDE.md만 쓰는 건 실수" (Akshay, OMC, SuperClaude 진영) |
| Ralph 루프 | YC 해커톤 결과로 강력 옹호 | "이젠 죽었다" (Alex Finn), "Anthropic plugin 쓰지 마라" (Ian Nuttall) |
| Spec-kit | Cedric Chee, Park JaeHo: 다중 기능 셋업 필수 | Rod Johnson: "iterative chat이 낫다, 폭포수 아님" |
| Skills vs Subagents | Daniel San: "Skill은 Subagent 안에서 호출 가능, 역으로도. 명확한 경계 없음" (2.1.3에서 일부 통합) | 여전히 혼란 — "언제 어느 것" 가이드 거의 없음 |
| YOLO 모드 | Melvyn: "항상 YOLO" | Simon Willison: 공개 설문, 답 분열 |
| `/ultraplan` 클라우드 vs 로컬 | Thariq, Nick Spisak: 4× 병렬 Opus 빠름 | Ralph/autopilot 진영: 로컬 컨트롤 선호; 인프라 비용 불투명 |

---

## 5. 워크플로 아키타입 (대표 5개)

### A. "Slim Router + Skills + Hooks" — 미니멀 시니어 패턴
```
CLAUDE.md (≤100줄)
.claude/
├── settings.json       # 3개 hook (SessionStart, PreToolUse, UserPromptSubmit)
├── rules/{*.md}        # paths-scoped
├── skills/{*/SKILL.md} # on-demand 워크플로
└── commands/{*.md}     # /branch /pr /push
```
**누가**: Boris Cherny, Anthropic 공식 권장. 90%의 케이스에 충분.

### B. "Hierarchical AGENTS.md" — 모노레포 패턴
```
CLAUDE.md → @AGENTS.md
AGENTS.md (root)
src/api/AGENTS.md (symlink ← CLAUDE.md)
src/web/AGENTS.md (symlink ← CLAUDE.md)
...
```
**누가**: OMC deepinit, 모노레포 사용자. drift 관리 위한 maintenance subagent 필요.

### C. "Spec-First" — 엔터프라이즈/팀 패턴
```
.specify/{memory/constitution.md, templates/}
specs/2026-05-27-feature-x/{spec,plan,tasks}.md
.claude/commands/speckit.* (또는 spec-kit 플러그인)
```
**누가**: GitHub spec-kit, Park JaeHo, Mansurova. 다인 협업·audit trail 중요할 때.

### D. "LLM Wiki + Auto-Memory" — 지식 누적 패턴
```
raw/
wiki/{SCHEMA.md, index.md, log.md, sources/, entities/, concepts/, synthesis/}
~/.claude/projects/<hash>/memory/MEMORY.md
.claude/hooks: SessionStart inject index.md, post-commit update wiki
```
**누가**: Karpathy 원본, Fulkerson Exo, Kuznetsov. 장기 프로젝트·KB 자산화.

### E. "Orchestration Layer" — heavyweight 자동화 패턴
```
.omc/{specs,plans,state,notepad.md,project-memory.json,sessions/}
~/.claude/agents/* (32+ agents)
~/.claude/skills/* (autopilot, ralph, ultrawork, team, ralplan)
magic keywords: "autopilot", "ralph", "ulw", "ccg"
```
**누가**: OMC, SuperClaude, claude-squad. 비-trivial 작업엔 토큰 비용 큼.

---

## 6. tale-studio에 적용 가능한 권장사항

현재 `tale-studio/CLAUDE.md`는 이미 P1(라우터, ~95줄)과 P10(spec-driven)을 채택 중. 다음 단계 후보:

| 우선순위 | 추가 패턴 | 어떻게 |
|---|---|---|
| 높음 | **P2 Hierarchical CLAUDE.md** | `src/features/director/CLAUDE.md`, `src/features/artist/CLAUDE.md` 추가 — Dev A/B 영역별 룰. **자동 lazy 로드**라 부담 없음. |
| 높음 | **P3 paths-scoped rules** | `.claude/rules/director.md (paths: src/features/director/**)`, `artist.md` 등 |
| 중간 | **P7 Hook 3개** | (1) SessionStart: PROGRESS.md 검증 보드 자동 inject (현재 사람이 수동으로 보는 것), (2) PreToolUse(Bash): `--no-verify` 차단, (3) Stop: TypeScript 컴파일 검증 |
| 중간 | **P4 Skills** | 자주 반복되는 워크플로 (예: "L0 canvas 노드 추가", "shot 시퀀스 mock 추가")를 SKILL.md로 |
| 낮음 | **P8 Auto-Memory 확인** | `/memory`로 현재 적립된 내용 확인. 이미 동작 중. |
| 낮음 | **P11 OMC** | 현재 user-level `~/.claude/CLAUDE.md`에서 OMC 활성. 프로젝트 레벨에 굳이 더 얹을 필요 없음. |

---

## 7. 주요 출처 (TOP 20)

### 공식
- [Anthropic — Memory & CLAUDE.md](https://code.claude.com/docs/en/memory)
- [Anthropic — Sub-agents](https://code.claude.com/docs/en/sub-agents)
- [Anthropic — Hooks](https://code.claude.com/docs/en/hooks)
- [Anthropic — Skills](https://code.claude.com/docs/en/skills)
- [Anthropic — Settings](https://code.claude.com/docs/en/settings)
- [Anthropic — MCP](https://code.claude.com/docs/en/mcp)
- [Anthropic — Best practices](https://code.claude.com/docs/en/best-practices)
- [Ralph Wiggum 공식 플러그인](https://github.com/anthropics/claude-code/tree/main/plugins/ralph-wiggum)

### 블로그 / 분석
- [codewithmukesh — Anatomy of the .claude Folder (2026-04-07)](https://codewithmukesh.com/blog/anatomy-of-the-claude-folder/)
- [Aaron Fulkerson — Karpathy LLM Wiki in Production (2026-04-12)](https://aaronfulkerson.com/2026/04/12/karpathys-pattern-for-an-llm-wiki-in-production/)
- [Ivan Kuznetsov — Self-Maintaining KB for 6 Projects (2026-04-21)](https://hackernoon.com/how-i-built-a-self-maintaining-knowledge-base-for-6-projects-using-claude-code-and-karpathys-llm-wiki)
- [Mariya Mansurova — Spec-Driven Development (2026-05-12)](https://towardsdatascience.com/from-vibe-coding-to-spec-driven-development/)
- [CloudZero — Claude Code Agents in 2026 (2026-05-18)](https://www.cloudzero.com/blog/claude-code-agents/)
- [John Conneely — Memory hierarchy (2026-03-18)](https://www.youngleaders.tech/p/how-i-finally-sorted-my-claude-code-memory)
- [Blake Crosley — 5 Production Hooks (2026-03-10)](https://blakecrosley.com/blog/claude-code-hooks-tutorial)
- [Addy Osmani — Stop Using /init for AGENTS.md (2026-02-23)](https://addyosmani.com/blog/agents-md/)
- [morphllm — Claude Code Reddit (2026-03-12)](https://www.morphllm.com/claude-code-reddit)
- [diet103 — Claude Code is a Beast](https://github.com/diet103/claude-code-infrastructure-showcase)

### X 스레드 (최근 30일)
- [Karpathy — LLM Wiki 원본](https://x.com/karpathy/status/2015883857489522876)
- [Boris Cherny — Hooks lifecycle](https://x.com/bcherny/status/2038454343519932844)
- [Akshay Pachaar — .claude folder + CLAUDE.md split](https://x.com/akshay_pachaar/status/2035706568142893229)
- [Daniel San — Skills vs Subagents](https://x.com/dani_avila7/status/2041188104841642156)
- [Allie K. Miller — Claudeopedia (Karpathy wiki + /last30days + /wiki)](https://x.com/alliekmiller/status/2040884878229565816)
- [Thariq — /ultraplan launch](https://x.com/trq212/status/2042671370186973589)

### OSS 프레임워크
- [github/spec-kit](https://github.com/github/spec-kit)
- [Yeachan-Heo/oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode)
- [SuperClaude-Org/SuperClaude_Framework](https://github.com/SuperClaude-Org/SuperClaude_Framework)
- [VoltAgent/awesome-claude-code-subagents](https://github.com/VoltAgent/awesome-claude-code-subagents)
- [disler/claude-code-hooks-mastery](https://github.com/disler/claude-code-hooks-mastery)
- [hesreallyhim/awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code) (44.9k★)
- [andrewyng/context-hub](https://github.com/andrewyng/context-hub)
- [kfchou/wiki-skills](https://github.com/kfchou/wiki-skills) · [toolboxmd/karpathy-wiki](https://github.com/toolboxmd/karpathy-wiki) · [praneybehl/llm-wiki-plugin](https://github.com/praneybehl/llm-wiki-plugin)

---

*문서 작성: 2026-05-27. 4개 병렬 리서치 에이전트 (Reddit/X/HN-blog/공식) → 100+ 소스 교차검증.*
