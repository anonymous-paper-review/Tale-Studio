import type { Shot } from '@/types'

export const mockShots: Shot[] = [
  // === Scene 1: The Encounter (intro) ===
  {
    shotId: 'sh_01_01', sceneId: 'sc_01', shotType: 'EWS',
    actionDescription: 'Camera descends through rain into neon-lit street, establishing the cyberpunk cityscape.',
    characters: [], durationSeconds: 8, generationMethod: 'T2V', dialogueLines: [],
    camera: { horizontal: 0, vertical: -3, pan: -2, tilt: 0, roll: 0, zoom: 2 },
    lighting: { position: 'top', brightness: 40, colorTemp: 4500 },
  },
  {
    shotId: 'sh_01_02', sceneId: 'sc_01', shotType: 'MS',
    actionDescription: 'Kai walks through the rain, hood up, scanning the crowd with his glowing blue eye.',
    characters: ['char_kai'], durationSeconds: 6, generationMethod: 'I2V', dialogueLines: [],
    camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 1, roll: 0, zoom: 0 },
    lighting: { position: 'front', brightness: 50, colorTemp: 5000 },
  },
  {
    shotId: 'sh_01_03', sceneId: 'sc_01', shotType: 'CU',
    actionDescription: 'Kai\'s cybernetic eye pulses blue as it locks onto a figure in the crowd.',
    characters: ['char_kai'], durationSeconds: 5, generationMethod: 'I2V', dialogueLines: [],
    camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 3 },
    lighting: { position: 'left', brightness: 60, colorTemp: 6500 },
  },
  {
    shotId: 'sh_01_04', sceneId: 'sc_01', shotType: 'OTS',
    actionDescription: 'Over Kai\'s shoulder, Viper ducks into a dark alley, her silver hair catching the neon light.',
    characters: ['char_kai', 'char_viper'], durationSeconds: 6, generationMethod: 'I2V', dialogueLines: [],
    camera: { horizontal: 2, vertical: 1, pan: 0, tilt: -2, roll: 0, zoom: 1 },
    lighting: { position: 'right', brightness: 35, colorTemp: 4000 },
  },
  {
    shotId: 'sh_01_05', sceneId: 'sc_01', shotType: 'WS',
    actionDescription: 'Viper disappears into the alley. Rain pours down, neon signs reflect in puddles.',
    characters: ['char_viper'], durationSeconds: 7, generationMethod: 'T2V', dialogueLines: [],
    camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: -1 },
    lighting: { position: 'top', brightness: 30, colorTemp: 5500 },
  },
  {
    shotId: 'sh_01_06', sceneId: 'sc_01', shotType: 'CU',
    actionDescription: 'Kai narrows his eyes, determination crossing his face. He steps forward into the alley.',
    characters: ['char_kai'], durationSeconds: 5, generationMethod: 'I2V',
    dialogueLines: [
      { characterId: 'char_kai', text: 'Got you.', emotion: 'determined', delivery: 'whisper', durationHint: 1 },
    ],
    camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 2 },
    lighting: { position: 'front', brightness: 45, colorTemp: 5000 },
  },

  // === Scene 2: The Chase (dev) ===
  {
    shotId: 'sh_02_01', sceneId: 'sc_02', shotType: 'TRACK',
    actionDescription: 'Camera tracks Viper sprinting through the crowded night market, weaving between stalls.',
    characters: ['char_viper'], durationSeconds: 8, generationMethod: 'I2V', dialogueLines: [],
    camera: { horizontal: 3, vertical: 0, pan: 1, tilt: 2, roll: 1, zoom: 0 },
    lighting: { position: 'top', brightness: 55, colorTemp: 3500 },
  },
  {
    shotId: 'sh_02_02', sceneId: 'sc_02', shotType: 'MS',
    actionDescription: 'Kai pushes through the crowd in pursuit, knocking over a food cart.',
    characters: ['char_kai'], durationSeconds: 6, generationMethod: 'I2V', dialogueLines: [],
    camera: { horizontal: 1, vertical: 0, pan: 1, tilt: 2, roll: 1, zoom: 0 },
    lighting: { position: 'front', brightness: 50, colorTemp: 4000 },
  },
  {
    shotId: 'sh_02_03', sceneId: 'sc_02', shotType: 'POV',
    actionDescription: 'Kai\'s POV: cybernetic eye HUD overlays tracking data on Viper\'s heat signature ahead.',
    characters: ['char_kai'], durationSeconds: 5, generationMethod: 'I2V', dialogueLines: [],
    camera: { horizontal: 0, vertical: 0, pan: 2, tilt: 3, roll: 0, zoom: 4 },
    lighting: { position: 'front', brightness: 60, colorTemp: 6000 },
  },
  {
    shotId: 'sh_02_04', sceneId: 'sc_02', shotType: 'WS',
    actionDescription: 'Both figures race through a narrow lantern-lit corridor, market-goers diving out of the way.',
    characters: ['char_kai', 'char_viper'], durationSeconds: 7, generationMethod: 'T2V', dialogueLines: [],
    camera: { horizontal: 0, vertical: 2, pan: 0, tilt: 0, roll: 0, zoom: -2 },
    lighting: { position: 'top', brightness: 45, colorTemp: 3500 },
  },
  {
    shotId: 'sh_02_05', sceneId: 'sc_02', shotType: 'CU',
    actionDescription: 'Viper glances back mid-sprint, a grin crossing her face — she\'s enjoying this.',
    characters: ['char_viper'], durationSeconds: 5, generationMethod: 'I2V',
    dialogueLines: [
      { characterId: 'char_viper', text: 'You\'re fast, kid. But not fast enough.', emotion: 'amused', delivery: 'shout', durationHint: 2 },
    ],
    camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 3 },
    lighting: { position: 'right', brightness: 50, colorTemp: 4000 },
  },
  {
    shotId: 'sh_02_06', sceneId: 'sc_02', shotType: 'EWS',
    actionDescription: 'Aerial view of the market: two figures running through a sea of colored lanterns.',
    characters: [], durationSeconds: 8, generationMethod: 'T2V', dialogueLines: [],
    camera: { horizontal: 0, vertical: -5, pan: -3, tilt: 0, roll: 0, zoom: -3 },
    lighting: { position: 'top', brightness: 40, colorTemp: 3800 },
  },

  // === Scene 3: The Hideout (turn) ===
  {
    shotId: 'sh_03_01', sceneId: 'sc_03', shotType: 'WS',
    actionDescription: 'Dim underground bunker filled with mechanical parts. Mira works at her bench.',
    characters: ['char_mira'], durationSeconds: 7, generationMethod: 'T2V', dialogueLines: [],
    camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: -1 },
    lighting: { position: 'top', brightness: 30, colorTemp: 4000 },
  },
  {
    shotId: 'sh_03_02', sceneId: 'sc_03', shotType: '2S',
    actionDescription: 'Kai sits across from Mira, catching his breath. She doesn\'t look up from her work.',
    characters: ['char_kai', 'char_mira'], durationSeconds: 7, generationMethod: 'I2V',
    dialogueLines: [
      { characterId: 'char_kai', text: 'I need to find the data broker. Viper — she has something I need.', emotion: 'urgent', delivery: 'calm', durationHint: 3 },
    ],
    camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 },
    lighting: { position: 'top', brightness: 35, colorTemp: 4200 },
  },
  {
    shotId: 'sh_03_03', sceneId: 'sc_03', shotType: 'CU',
    actionDescription: 'Mira\'s prosthetic hand tightens a bolt with mechanical precision. Her expression is grave.',
    characters: ['char_mira'], durationSeconds: 5, generationMethod: 'I2V',
    dialogueLines: [
      { characterId: 'char_mira', text: 'She\'s not your enemy, kid.', emotion: 'serious', delivery: 'calm', durationHint: 2 },
    ],
    camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 3 },
    lighting: { position: 'left', brightness: 40, colorTemp: 4000 },
  },
  {
    shotId: 'sh_03_04', sceneId: 'sc_03', shotType: 'MS',
    actionDescription: 'Kai stands abruptly, knocking his chair back. Disbelief on his face.',
    characters: ['char_kai'], durationSeconds: 6, generationMethod: 'I2V',
    dialogueLines: [
      { characterId: 'char_kai', text: 'What are you talking about?', emotion: 'shocked', delivery: 'urgent', durationHint: 1.5 },
    ],
    camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 1 },
    lighting: { position: 'front', brightness: 35, colorTemp: 4200 },
  },
  {
    shotId: 'sh_03_05', sceneId: 'sc_03', shotType: 'ECU',
    actionDescription: 'Extreme close-up of Mira\'s eyes, reflecting fluorescent light. She finally looks at Kai.',
    characters: ['char_mira'], durationSeconds: 5, generationMethod: 'I2V', dialogueLines: [],
    camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 5 },
    lighting: { position: 'top', brightness: 45, colorTemp: 5500 },
  },
  {
    shotId: 'sh_03_06', sceneId: 'sc_03', shotType: 'MS',
    actionDescription: 'Mira pulls out a data chip from her prosthetic arm compartment, slides it across the table.',
    characters: ['char_mira'], durationSeconds: 6, generationMethod: 'I2V',
    dialogueLines: [
      { characterId: 'char_mira', text: 'Take this to her. She\'ll understand.', emotion: 'resigned', delivery: 'calm', durationHint: 2 },
    ],
    camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 1 },
    lighting: { position: 'front', brightness: 35, colorTemp: 4000 },
  },

  // === Scene 4: The Revelation (conclusion) ===
  {
    shotId: 'sh_04_01', sceneId: 'sc_04', shotType: 'EWS',
    actionDescription: 'Golden sunrise paints the city skyline. Camera slowly rises to reveal the rooftop.',
    characters: [], durationSeconds: 8, generationMethod: 'T2V', dialogueLines: [],
    camera: { horizontal: 0, vertical: -4, pan: -2, tilt: 0, roll: 0, zoom: 2 },
    lighting: { position: 'right', brightness: 70, colorTemp: 3200 },
  },
  {
    shotId: 'sh_04_02', sceneId: 'sc_04', shotType: 'FS',
    actionDescription: 'Kai walks across the rooftop toward Viper, who stands at the edge looking at the sunrise.',
    characters: ['char_kai', 'char_viper'], durationSeconds: 7, generationMethod: 'I2V', dialogueLines: [],
    camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 },
    lighting: { position: 'right', brightness: 65, colorTemp: 3200 },
  },
  {
    shotId: 'sh_04_03', sceneId: 'sc_04', shotType: 'CU',
    actionDescription: 'Viper turns to face Kai. The red glow of her neural interface softens in the warm light.',
    characters: ['char_viper'], durationSeconds: 5, generationMethod: 'I2V',
    dialogueLines: [
      { characterId: 'char_viper', text: 'You came.', emotion: 'surprised', delivery: 'calm', durationHint: 1 },
    ],
    camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 3 },
    lighting: { position: 'right', brightness: 60, colorTemp: 3200 },
  },
  {
    shotId: 'sh_04_04', sceneId: 'sc_04', shotType: 'MS',
    actionDescription: 'Kai holds out the data chip. Viper stares at it, recognition dawning on her face.',
    characters: ['char_kai', 'char_viper'], durationSeconds: 6, generationMethod: 'I2V',
    dialogueLines: [
      { characterId: 'char_kai', text: 'Mira sent me. She said you\'d understand.', emotion: 'neutral', delivery: 'calm', durationHint: 2.5 },
    ],
    camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 1 },
    lighting: { position: 'right', brightness: 65, colorTemp: 3400 },
  },
  {
    shotId: 'sh_04_05', sceneId: 'sc_04', shotType: 'WS',
    actionDescription: 'Kai extends his hand to Viper. After a beat, she takes it. The sunrise blazes behind them.',
    characters: ['char_kai', 'char_viper'], durationSeconds: 8, generationMethod: 'T2V', dialogueLines: [],
    camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: -1 },
    lighting: { position: 'right', brightness: 75, colorTemp: 3000 },
  },
  {
    shotId: 'sh_04_06', sceneId: 'sc_04', shotType: 'EWS',
    actionDescription: 'Pull back to reveal two silhouettes on the rooftop against the golden sunrise cityscape.',
    characters: [], durationSeconds: 8, generationMethod: 'T2V', dialogueLines: [],
    camera: { horizontal: 0, vertical: -3, pan: -2, tilt: 0, roll: 0, zoom: -4 },
    lighting: { position: 'right', brightness: 80, colorTemp: 3000 },
  },
]
