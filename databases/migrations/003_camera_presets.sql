-- Camera Gear Presets DB Migration
-- Plan 05 — Director: Camera Brand + Aperture/Focal/WB Presets
-- Created: 2026-04-19 KST
--
-- Redefines camera_presets.yaml semantics: previously 6-axis seeds (now covered by
-- camera_movements from Plan 04); now brand / focal / aperture / WB gear presets.

-- 1. camera_brands catalog (mirror of camera_presets.yaml brands section)
CREATE TABLE IF NOT EXISTS camera_brands (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    full_name TEXT NOT NULL,
    characteristics TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO camera_brands (id, label, full_name, characteristics) VALUES
  ('arri',       'Arri',       'Arri Alexa',                  'warm filmic tones, smooth highlight roll-off'),
  ('panavision', 'Panavision', 'Panavision Millennium DXL2',  'anamorphic flares, wide latitude'),
  ('red',        'RED',        'RED V-Raptor',                'sharp digital, high resolution'),
  ('cooke',      'Cooke',      'Cooke S7/i',                  'warm Cooke look, vintage color rendition'),
  ('zeiss',      'Zeiss',      'Zeiss Supreme Prime',         'clean, neutral, high contrast')
ON CONFLICT (id) DO UPDATE SET
    label = EXCLUDED.label,
    full_name = EXCLUDED.full_name,
    characteristics = EXCLUDED.characteristics,
    updated_at = NOW();

-- 2. shots: persist camera preset selection per shot
ALTER TABLE shots
  ADD COLUMN IF NOT EXISTS camera_brand TEXT DEFAULT 'arri',
  ADD COLUMN IF NOT EXISTS focal_length INT DEFAULT 35,
  ADD COLUMN IF NOT EXISTS aperture NUMERIC(3,1) DEFAULT 2.8,
  ADD COLUMN IF NOT EXISTS white_balance INT DEFAULT 5600;
