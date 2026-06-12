// 실행 결과 → out/report.md
import type { DbProject, DbScene, DbShot, RunResult, Violation } from './types.ts';

export interface ConsistencyRow {
  shot_id: string;
  unitCounts: number[];
  unitCountStable: boolean;
  verbJaccard: number;          // run0 vs run1 동사 집합 자카드 (E2-mini)
}

export function computeConsistency(a: RunResult, b: RunResult): ConsistencyRow[] {
  const rows: ConsistencyRow[] = [];
  const byId = new Map(b.plan.shots.map((s) => [s.shot_id, s]));
  for (const sa of a.plan.shots) {
    const sb = byId.get(sa.shot_id);
    if (!sb) continue;
    const verbs = (units: typeof sa.units) =>
      new Set(units.flatMap((u) => (u.actors ?? []).map((x) => x.verb.toLowerCase().trim())));
    const va = verbs(sa.units);
    const vb = verbs(sb.units);
    const inter = [...va].filter((x) => vb.has(x)).length;
    const uni = new Set([...va, ...vb]).size;
    rows.push({
      shot_id: sa.shot_id,
      unitCounts: [sa.units.length, sb.units.length],
      unitCountStable: sa.units.length === sb.units.length,
      verbJaccard: uni === 0 ? 1 : inter / uni,
    });
  }
  return rows;
}

function violationTable(violations: Violation[]): string {
  if (!violations.length) return '(없음)\n';
  return violations
    .map((v) => `- [${v.severity}] **${v.rule}** ${v.shot_id}${v.group_id ? ` / ${v.group_id}` : ''} — ${v.detail}`)
    .join('\n') + '\n';
}

export function renderReport(
  project: DbProject,
  scenes: DbScene[],
  shotsByScene: Map<string, DbShot[]>,
  results: RunResult[],
  consistency: ConsistencyRow[],
  failures: Array<{ runIndex: number; sceneId: string; error: string }>,
): string {
  const lines: string[] = [];
  const runs = [...new Set(results.map((r) => r.runIndex))].sort();
  const totalShots = [...shotsByScene.values()].reduce((n, s) => n + s.length, 0);
  const allViol = results.flatMap((r) => r.scores.flatMap((s) => s.violations));
  const byRule = new Map<string, number>();
  for (const v of allViol) byRule.set(v.rule, (byRule.get(v.rule) ?? 0) + 1);

  lines.push(`# B안 (motion_units 1급) 테스트 리포트`);
  lines.push('');
  lines.push(`- 프로젝트: **${project.title ?? project.id}** (\`${project.id}\`)`);
  lines.push(`- 데이터: 씬 ${scenes.length} / 샷 ${totalShots} — 실데이터(Supabase), Tale-Studio 비침습`);
  lines.push(`- 실행: run ${runs.length}회 × 씬별 1 LLM콜, 백엔드 ${results[0]?.llm.backend ?? '?'}`);
  lines.push(`- 근거 문서: Tale-Studio/dev/Visual_Improvement/action-unit-camera-alignment.md §4.3(B안)·§5(validator)·§7(E2)`);
  lines.push('');

  lines.push(`## 요약`);
  lines.push('');
  const totalUnits = results.reduce((n, r) => n + r.plan.shots.reduce((m, s) => m + s.units.length, 0), 0);
  const meanScore = results.length
    ? (results.flatMap((r) => r.scores).reduce((n, s) => n + s.alignmentScore, 0) / Math.max(1, results.flatMap((r) => r.scores).length)).toFixed(2)
    : 'n/a';
  lines.push(`| 항목 | 값 |`);
  lines.push(`|---|---|`);
  lines.push(`| 총 행동소 그룹 수 (전 run) | ${totalUnits} |`);
  lines.push(`| **R1 (그룹 내 카메라 상태 변화)** | **구조상 0 — B안 타입이 표현 자체를 차단 (검증 불필요가 B안의 주장)** |`);
  for (const [rule, n] of [...byRule.entries()].sort()) lines.push(`| ${rule} | ${n} |`);
  lines.push(`| 평균 alignment score (2·V2+V3, 낮을수록 좋음) | ${meanScore} |`);
  lines.push(`| LLM 호출 실패/재시도 | 실패 ${failures.length} / 재시도 ${results.filter((r) => r.llm.retried).length} |`);
  lines.push('');

  if (failures.length) {
    lines.push(`### 실패한 호출`);
    for (const f of failures) lines.push(`- run${f.runIndex} ${f.sceneId}: ${f.error}`);
    lines.push('');
  }

  for (const r of results) {
    lines.push(`## run${r.runIndex} — ${r.sceneId} (${r.llm.backend}${r.llm.ms > 0 ? `, ${(r.llm.ms / 1000).toFixed(0)}s` : ''}${r.llm.retried ? ', 파싱 재시도' : ''})`);
    lines.push('');
    lines.push(`| shot | dur | units | 그룹 구성 (share · actors → camera) | score |`);
    lines.push(`|---|---|---|---|---|`);
    const dbShots = shotsByScene.get(r.sceneId) ?? [];
    const durOf = new Map(dbShots.map((s) => [s.shot_id, s.duration_seconds ?? 5]));
    for (const shot of r.plan.shots) {
      const score = r.scores.find((s) => s.shot_id === shot.shot_id);
      const unitsDesc = shot.units
        .map((u) => {
          const actors = (u.actors ?? []).map((a) => `${a.verb}(${a.magnitude})`).join('+') || 'env';
          const cam = u.camera_state ?? ({} as never);
          return `\`${u.group_id}\` ${(u.duration_share ?? 0).toFixed(2)} · ${actors} → ${String((cam as { type?: string }).type)}/${String((cam as { coupling?: string }).coupling)}`;
        })
        .join('<br>');
      lines.push(`| ${shot.shot_id} | ${durOf.get(shot.shot_id) ?? '?'}s | ${shot.units.length} | ${unitsDesc} | ${score?.alignmentScore ?? '?'} |`);
    }
    lines.push('');
    lines.push(`위반:`);
    lines.push(violationTable(r.scores.flatMap((s) => s.violations)));
  }

  if (consistency.length) {
    const stable = consistency.filter((c) => c.unitCountStable).length;
    const meanJ = consistency.reduce((n, c) => n + c.verbJaccard, 0) / consistency.length;
    lines.push(`## E2-mini: 분절 일관성 (run0 vs run1)`);
    lines.push('');
    lines.push(`- 그룹 수 일치: **${stable}/${consistency.length} 샷** (${((stable / consistency.length) * 100).toFixed(0)}%)`);
    lines.push(`- 동사 집합 자카드 평균: **${meanJ.toFixed(2)}** (1.0 = 완전 동일)`);
    lines.push('');
    lines.push(`| shot | unit 수 (run0/run1) | verb Jaccard |`);
    lines.push(`|---|---|---|`);
    for (const c of consistency) {
      lines.push(`| ${c.shot_id} | ${c.unitCounts.join(' / ')}${c.unitCountStable ? '' : ' ⚠️'} | ${c.verbJaccard.toFixed(2)} |`);
    }
    lines.push('');
    lines.push(`> 해석: 그룹 수 일치율이 높을수록 "LLM이 행동소 분절을 안정적으로 수행"(deep-dive §7 E2의 전제). 낮으면 few-shot 분절 예시 고정 또는 비트 단위로 후퇴 검토.`);
    lines.push('');
  }

  lines.push(`## 해석 가이드`);
  lines.push('');
  lines.push(`- **SCHEMA = B안 구조 준수력.** 0이면 LLM이 "카메라가 단위에 종속" 구조를 그대로 따른 것 — B안 채택의 1차 근거.`);
  lines.push(`- **V2(무태그 counter) = 거짓 신호 차단.** fail이 나오면 프롬프트 규칙만으로 부족하고 validator가 실제로 필요하다는 증거.`);
  lines.push(`- **V3/VB/VS = 산수·매핑 내면화 한계.** warn 빈도가 높으면 "시간 산수는 validator가 한다" 원칙(deep-dive §5.1)이 맞다는 증거.`);
  lines.push(`- **E2-mini = B안 전제 검증.** deep-dive §7은 E2 통과 후 B안 진행을 권고 — 본 리포트가 그 1차 데이터.`);
  return lines.join('\n') + '\n';
}
