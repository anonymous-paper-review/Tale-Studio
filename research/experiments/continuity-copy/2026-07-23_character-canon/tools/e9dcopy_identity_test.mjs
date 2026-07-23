// E9d-copy 신원 전파 테스트: 정본 1장(identity_ref.jpg) → 다른 앵글/포즈 2컷 생성
// 제품 실배선 편집 모델(openai/gpt-image-2/edit, src/lib/writer/llm/fal.ts DEFAULT_EDIT_IMAGE_MODEL) 사용
import { fal } from '@fal-ai/client';
import { readFile, writeFile } from 'node:fs/promises';

if (!process.env.FAL_KEY) { console.error('FAL_KEY missing'); process.exit(1); }
fal.config({ credentials: process.env.FAL_KEY });

const DIR = '/Users/xcape/projects/tale-studio/research/experiments/continuity-copy/2026-07-23_character-canon/assets';
const refBuf = await readFile(`${DIR}/identity_ref.jpg`);
const refUrl = await fal.storage.upload(new Blob([refBuf], { type: 'image/jpeg' }));
console.log('ref uploaded');

const TESTS = [
  {
    name: 'test_34_fullbody',
    prompt: 'Using the reference image: the exact same young woman (identical face, identical black lip-length bob with wispy bangs, identical layered silver charm choker, identical pale blue satin slip dress with white daisy lace trim) now standing full body next to a row of orange round sinks on a mint-green counter, seen from a three-quarter front angle, arms relaxed at her sides, calm vacant expression. Retro pastel public restroom, mint-green tiles, warm fluorescent light, round mirrors, cinematic fashion-film still, photorealistic.',
  },
  {
    name: 'test_profile_sit',
    prompt: 'Using the reference image: the exact same young woman (identical face, identical black lip-length bob with wispy bangs, identical layered silver charm choker, identical pale blue satin slip dress with white daisy lace trim) now seen in side profile, sitting on a bench in the same retro pastel restroom, hands folded on her lap, white crew socks and black mary-jane heels visible, calm vacant expression. Mint-green tiles, orange-red accents, warm fluorescent light, cinematic fashion-film still, photorealistic.',
  },
];

for (const t of TESTS) {
  process.stdout.write(`${t.name}... `);
  try {
    const res = await fal.subscribe('openai/gpt-image-2/edit', {
      input: { prompt: t.prompt, image_urls: [refUrl] },
    });
    const url = res.data?.images?.[0]?.url;
    if (!url) throw new Error('no image url');
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    await writeFile(`${DIR}/${t.name}.jpg`, buf);
    console.log('ok');
  } catch (e) {
    console.log('FAIL: ' + (e?.message || e));
  }
}
console.log('done');
