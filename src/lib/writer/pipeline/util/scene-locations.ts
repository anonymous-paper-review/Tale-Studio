// 씬의 장소 고르기(2026-11-10 B1 이어서): 무대 · 데쿠파주 · 샷 단계가 모델에게 보여 줄 장소 디자인.
//   예전에는 글자 포함(scene.location.includes(id))으로 골라, 대본 그대로 "COUNTRY BUS STOP" 씬 지시에 "BUS"(버스 안) 디자인이
//   같이 실렸다. 대본이 아닌 흐름에서도 이름이 겹치는 장소(bus_stop · bus, 버스 정류장 · 버스)가 같은 꼴이었다.
//   차례로 보고 처음 찾은 단계에서 멈춘다. 어느 단계든 여럿이 남으면 모르는 것이라 싣지 않는다.
//   1 · 2단계는 장소 번호가 같은 것을 먼저 보고, 없을 때만 표시 이름으로 본다.
//   1) 번호나 표시 이름이 씬 장소와 같다(대소문자 · 앞뒤 빈칸은 보지 않는다).
//   2) 장면 머리 표시(INT. · EXT.) · 시간 꼬리(- NIGHT)를 떼고 같다. 여럿이면 덧붙인 설명("Cafe (Old Town)")까지 견주고,
//      하나도 없으면 덧붙인 설명("kitchen (부엌)" · "kitchen: …")도 떼고 견준다(검토 c 낮음 B).
//   3) 씬 장소가 그 이름으로 끝난다(old_warehouse → warehouse). 이름의 중심은 끝말이다. 그 이름으로 시작하는 장소는 뒤에 붙은 말이
//      시간 · 자리 말일 때만 그 장소의 한때로 본다(bus_stop_night → bus_stop, BUS TERMINAL → BUS 는 아님). 가장 긴 하나만(검토 c 낮음 A).
//   약속: tests/writer/scene-location-pick.test.ts

const HEADING_TAG_RE = /^(?:\d+[.)]?\s*)?(?:INT\.?\s*\/\s*EXT\.?|I\/E\.?|INT\.?|EXT\.?)\s*[.:]?\s+/i;
// 시간 꼬리 앞 줄표: 붙임표 · en dash(\u2013) · em dash(\u2014).
const TIME_TAIL_RE = /\s+[-\u2013\u2014]+\s+/;
// 덧붙인 설명의 시작: 괄호 · 쌍점(전각 \uff08 · \uff1a 포함).
const NOTE_RE = /\s*[(\uff08:\uff1a]/;
// 장소 이름 뒤에 붙어도 같은 장소인 말: 때 · 이어짐 · 자리(bus_stop_night · 편의점 앞).
const PLACE_QUALIFIERS = new Set(['night', 'day', 'dawn', 'dusk', 'morning', 'afternoon', 'evening', 'noon', 'midnight', 'sunrise', 'sunset', 'later', 'moments', 'continuous', 'same', 'present', 'past', 'flashback', '밤', '낮', '새벽', '아침', '오전', '오후', '저녁', '해질녘', '황혼', '한밤', '자정', '정오', '회상', '과거', '현재', '앞', '뒤', '옆', '안', '밖']);

const plain = (text: string) => text.trim().toLowerCase();
const spaced = (text: string) => text.toLowerCase().replace(/[\s_-]+/g, ' ').trim();

/** 비교용 장소 이름: 머리 표시 · 시간 꼬리를 떼고, 밑줄 · 붙임표 · 빈칸을 한 칸으로(덧붙인 설명은 남긴다). */
function mid(text: string): string {
  return spaced(text.trim().replace(HEADING_TAG_RE, '').split(TIME_TAIL_RE)[0]);
}

/** mid 에서 덧붙인 설명까지 뗀 이름. */
function core(text: string): string {
  return spaced(text.trim().replace(HEADING_TAG_RE, '').split(TIME_TAIL_RE)[0].split(NOTE_RE)[0]);
}

export function sceneLocations<T extends { id: string; name?: string }>(locations: readonly T[], sceneLocation: string | null | undefined): T[] {
  const raw = (sceneLocation ?? '').trim();
  if (!raw) return [];
  const namesOf = (location: T) => [location.id, location.name].filter((name): name is string => typeof name === 'string' && !!name.trim());
  const only = (found: T[]): T[] => (found.length === 1 ? found : []);
  // 1 · 2단계는 장소 번호가 같은 것을 먼저 보고, 없을 때만 표시 이름으로 본다(검토 c 9d8b5f34 재검토). 번호가 씬 장소의 원래 짝이다.
  //   찾았는데 여럿이면 모르는 것이라 싣지 않는다(다음 단계로 가지 않는다).
  const pick = (key: string, by: (text: string) => string): T[] | null => {
    if (!key) return null;
    const byId = locations.filter((location) => by(location.id) === key);
    if (byId.length) return only(byId);
    const byName = locations.filter((location) => !!location.name?.trim() && by(location.name) === key);
    return byName.length ? only(byName) : null;
  };
  const found = pick(plain(raw), plain) ?? pick(mid(raw), mid) ?? pick(core(raw), core);
  if (found) return found;
  const key = core(raw);
  if (!key) return [];
  const words = key.split(' ');
  let best: { found: T[]; size: number } = { found: [], size: 0 };
  for (const location of locations) {
    let size = 0;
    for (const name of namesOf(location)) {
      const head = core(name).split(' ');
      if (!head[0] || head.length >= words.length) continue;
      const ends = words.slice(-head.length).join(' ') === head.join(' ');
      const starts = words.slice(0, head.length).join(' ') === head.join(' ') && words.slice(head.length).every((word) => PLACE_QUALIFIERS.has(word));
      if ((ends || starts) && head.length > size) size = head.length;
    }
    if (!size) continue;
    if (size > best.size) best = { found: [location], size };
    else if (size === best.size) best.found.push(location);
  }
  return only(best.found);
}
