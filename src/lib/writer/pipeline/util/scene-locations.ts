// 씬의 장소 고르기(2026-11-10 B1 이어서): 무대 · 데쿠파주 · 샷 단계가 모델에게 보여 줄 장소 디자인.
//   예전에는 글자 포함(scene.location.includes(id))으로 골라, 대본 그대로 "COUNTRY BUS STOP" 씬 지시에 "BUS"(버스 안) 디자인이
//   같이 실렸다. 대본이 아닌 흐름에서도 이름이 겹치는 장소(bus_stop · bus, 버스 정류장 · 버스)가 같은 꼴이었다.
//   차례로 보고 처음 찾은 단계에서 멈춘다.
//   1) 번호나 표시 이름이 씬 장소와 같다(대소문자 · 앞뒤 빈칸은 보지 않는다).
//   2) 장면 머리 표시(INT. · EXT.) · 시간 꼬리(- NIGHT) · 덧붙인 설명("kitchen (부엌)" · "kitchen: …")을 떼고 같다.
//   3) 씬 장소가 그 이름으로 시작한다(bus_stop_night → bus_stop). 그중 가장 긴 하나만.
//   약속: tests/writer/scene-location-pick.test.ts

const HEADING_TAG_RE = /^(?:\d+[.)]?\s*)?(?:INT\.?\s*\/\s*EXT\.?|I\/E\.?|INT\.?|EXT\.?)\s*[.:]?\s+/i;
// 시간 꼬리 앞 줄표: 붙임표 · en dash(\u2013) · em dash(\u2014).
const TIME_TAIL_RE = /\s+[-\u2013\u2014]+\s+/;
// 덧붙인 설명의 시작: 괄호 · 쌍점(전각 \uff08 · \uff1a 포함).
const NOTE_RE = /\s*[(\uff08:\uff1a]/;

const plain = (text: string) => text.trim().toLowerCase();

/** 비교용 장소 이름: 머리 표시 · 시간 꼬리 · 덧붙인 설명을 떼고, 밑줄 · 붙임표 · 빈칸을 한 칸으로. */
function core(text: string): string {
  const head = text.trim().replace(HEADING_TAG_RE, '').split(TIME_TAIL_RE)[0].split(NOTE_RE)[0];
  return head.toLowerCase().replace(/[\s_-]+/g, ' ').trim();
}

export function sceneLocations<T extends { id: string; name?: string }>(locations: readonly T[], sceneLocation: string | null | undefined): T[] {
  const raw = (sceneLocation ?? '').trim();
  if (!raw) return [];
  const namesOf = (location: T) => [location.id, location.name].filter((name): name is string => typeof name === 'string' && !!name.trim());
  const exact = locations.filter((location) => namesOf(location).some((name) => plain(name) === plain(raw)));
  if (exact.length) return exact;
  const key = core(raw);
  if (!key) return [];
  const same = locations.filter((location) => namesOf(location).some((name) => core(name) === key));
  if (same.length) return same;
  let best: { location: T; length: number } | null = null;
  for (const location of locations) {
    for (const name of namesOf(location)) {
      const head = core(name);
      if (head && key.startsWith(`${head} `) && (!best || head.length > best.length)) best = { location, length: head.length };
    }
  }
  return best ? [best.location] : [];
}
