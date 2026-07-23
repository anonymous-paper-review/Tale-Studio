import { fal } from '@fal-ai/client';
import { writeFile, mkdir } from 'node:fs/promises';

if (!process.env.FAL_KEY) { console.error('FAL_KEY missing'); process.exit(1); }
fal.config({ credentials: process.env.FAL_KEY });

const OUT = '/Users/xcape/projects/tale-studio/research/experiments/continuity-copy/2026-07-23_character-canon/assets';
await mkdir(OUT, { recursive: true });

const PROMPT = `Character design reference portrait, front view from chest up, centered. A very slender young woman in her early twenties with porcelain pale skin, a glossy jet-black chin-length bob haircut with thin wispy see-through bangs above the eyebrows, dark brown eyes, delicate facial features, long slender neck, calm melancholic expression with soft red lips. She wears a layered silver charm choker necklace made of small beads and charms, and a pale powder-blue satin slip dress with thin straps trimmed with tiny white daisy lace. Soft warm fluorescent lighting, mint-green tiled wall softly blurred in the background, cinematic photorealism, fashion film still, symmetrical composition.`;

const SEEDS = [70723, 11207, 33851, 90412];

for (let i = 0; i < SEEDS.length; i++) {
  const seed = SEEDS[i];
  process.stdout.write(`candidate ${i + 1} (seed ${seed})... `);
  try {
    const res = await fal.subscribe('fal-ai/flux-2/klein/9b', {
      input: { prompt: PROMPT, image_size: 'portrait_4_3', seed },
    });
    const url = res.data?.images?.[0]?.url;
    if (!url) throw new Error('no image url');
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    await writeFile(`${OUT}/candidate_${i + 1}.jpg`, buf);
    console.log('ok');
  } catch (e) {
    console.log('FAIL: ' + (e?.message || e));
  }
}
console.log('done → ' + OUT);
