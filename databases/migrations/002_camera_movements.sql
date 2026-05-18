-- Camera Movement Presets DB Migration
-- Plan 04 — Director: Camera Movement Preset Library
-- Created: 2026-04-19 KST

-- 1. camera_movements preset catalog (Knowledge DB mirror of camera_movements.yaml)
CREATE TABLE IF NOT EXISTS camera_movements (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    description TEXT,
    axis JSONB NOT NULL,
    prompt_fragment TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO camera_movements (id, label, description, axis, prompt_fragment) VALUES
  ('static',         'Static',       'Locked down camera, no movement',         '{"horizontal":0,"vertical":0,"pan":0,"tilt":0,"roll":0,"zoom":0}'::jsonb,    'locked down camera, no movement'),
  ('dolly-in',       'Dolly In',     'Slow forward push toward subject',         '{"horizontal":0,"vertical":0,"pan":0,"tilt":0,"roll":0,"zoom":5}'::jsonb,    'dolly in, slow forward push'),
  ('dolly-out',      'Dolly Out',    'Slow pull back away from subject',         '{"horizontal":0,"vertical":0,"pan":0,"tilt":0,"roll":0,"zoom":-5}'::jsonb,   'dolly out, slow pull back'),
  ('push-in',        'Push In',      'Rapid push toward subject',                '{"horizontal":0,"vertical":0,"pan":0,"tilt":0,"roll":0,"zoom":8}'::jsonb,    'rapid push-in, emphatic forward zoom'),
  ('pull-out',       'Pull Out',     'Rapid pull away to reveal context',        '{"horizontal":0,"vertical":0,"pan":0,"tilt":0,"roll":0,"zoom":-8}'::jsonb,   'rapid pull-out, revealing wider context'),
  ('orbit-left',     'Orbit Left',   'Arc around subject to the left',           '{"horizontal":6,"vertical":0,"pan":0,"tilt":-3,"roll":0,"zoom":0}'::jsonb,   'orbital camera arcing left around subject'),
  ('orbit-right',    'Orbit Right',  'Arc around subject to the right',          '{"horizontal":-6,"vertical":0,"pan":0,"tilt":3,"roll":0,"zoom":0}'::jsonb,   'orbital camera arcing right around subject'),
  ('pan-left',       'Pan Left',     'Smooth horizontal pan to the left',        '{"horizontal":0,"vertical":0,"pan":0,"tilt":-7,"roll":0,"zoom":0}'::jsonb,   'smooth pan left across the scene'),
  ('pan-right',      'Pan Right',    'Smooth horizontal pan to the right',       '{"horizontal":0,"vertical":0,"pan":0,"tilt":7,"roll":0,"zoom":0}'::jsonb,    'smooth pan right across the scene'),
  ('whip-pan-left',  'Whip Pan L',   'Fast whip pan to the left',                '{"horizontal":0,"vertical":0,"pan":0,"tilt":-10,"roll":0,"zoom":0}'::jsonb,  'whip pan left, fast motion blur'),
  ('whip-pan-right', 'Whip Pan R',   'Fast whip pan to the right',               '{"horizontal":0,"vertical":0,"pan":0,"tilt":10,"roll":0,"zoom":0}'::jsonb,   'whip pan right, fast motion blur'),
  ('crane-up',       'Crane Up',     'Rising vertical movement',                 '{"horizontal":0,"vertical":8,"pan":-2,"tilt":0,"roll":0,"zoom":0}'::jsonb,   'crane up, rising vertical reveal'),
  ('crane-down',     'Crane Down',   'Descending vertical movement',             '{"horizontal":0,"vertical":-8,"pan":2,"tilt":0,"roll":0,"zoom":0}'::jsonb,   'crane down, descending vertical movement'),
  ('handheld',       'Handheld',     'Documentary-style shaky cam',              '{"horizontal":2,"vertical":1,"pan":2,"tilt":2,"roll":1,"zoom":0}'::jsonb,    'handheld shaky-cam, documentary feel')
ON CONFLICT (id) DO UPDATE SET
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    axis = EXCLUDED.axis,
    prompt_fragment = EXCLUDED.prompt_fragment,
    updated_at = NOW();

-- 2. shots: persist selected movement preset per shot
ALTER TABLE shots
  ADD COLUMN IF NOT EXISTS movement_preset TEXT,
  ADD COLUMN IF NOT EXISTS movement_intensity INT DEFAULT 5;
