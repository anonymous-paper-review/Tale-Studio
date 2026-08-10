// writer 파이프라인 id → main app id 변환.
//   원래는 파이프라인 산출물 전체를 main 모델(Character/Scene/Shot/VideoClip)로 옮기는
//   어댑터 계층이었으나, 그 변환은 lossy 해서 persist_manifest(단일 생산자)로 대체됐다
//   (#writer-overhaul 2026-08-10: 호출자 0 이던 adapt* 일괄 제거). id 변환만 남는다 —
//   persist 와 러프/영상 조인이 같은 규칙을 써야 하므로 여기가 그 진실원.
// writer scene_id (scene_1) → main sc_01
export function writerSceneIdToMain(rawId: string): string {
  const m = /scene[_-]?(\d+)/i.exec(rawId);
  if (m) {
    return `sc_${m[1].padStart(2, '0')}`;
  }
  return rawId;
}

// writer shot_id (shot_scene_1_001 or shot_s01_001) → main sh_01_01
export function writerShotIdToMain(rawShotId: string, sceneId: string): string {
  const sceneMain = writerSceneIdToMain(sceneId);
  const sceneNum = sceneMain.replace('sc_', '');
  // #id-unify(2026-08-05): 1자리도 변환 — 구 정규식(\d{2,3})이 shot_1~9 를 통과시켜 한
  //   프로젝트에 shot_N/sh_XX_NN 두 체계가 공존했다. 구 프로젝트 행은 러프 조인이 raw 키를
  //   병행 색인하므로 무영향, 새 persist 부터 전 샷이 sh_XX_NN 으로 통일된다.
  const m = /[_-](\d{1,3})$/.exec(rawShotId);
  if (m) {
    const n = parseInt(m[1], 10);
    return `sh_${sceneNum}_${String(n).padStart(2, '0')}`;
  }
  return rawShotId;
}
