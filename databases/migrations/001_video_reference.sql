-- Video Reference DB Migration
-- Tale Project - 영상 레퍼런스 DB
-- Created: 2026-01-27 22:37

-- 1. videos 테이블
CREATE TABLE videos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    source_url TEXT NOT NULL,
    platform TEXT NOT NULL,
    duration_seconds FLOAT,
    genre TEXT,
    director TEXT,
    year INTEGER,
    tags TEXT[],
    thumbnail_url TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_videos_status ON videos(status);
CREATE INDEX idx_videos_genre ON videos(genre);
CREATE INDEX idx_videos_tags ON videos USING GIN(tags);

-- 2. shot_analysis 테이블
CREATE TABLE shot_analysis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    start_time FLOAT NOT NULL,
    end_time FLOAT NOT NULL,
    technique_category TEXT NOT NULL,
    technique_id TEXT NOT NULL,
    confidence FLOAT,
    llm_reasoning TEXT,
    human_verified BOOLEAN NOT NULL DEFAULT FALSE,
    human_notes TEXT,
    verified_by TEXT,
    verified_at TIMESTAMPTZ,
    additional_tags TEXT[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_time_range CHECK (end_time > start_time),
    CONSTRAINT valid_confidence CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))
);

CREATE INDEX idx_shot_analysis_video_id ON shot_analysis(video_id);
CREATE INDEX idx_shot_analysis_technique ON shot_analysis(technique_category, technique_id);
CREATE INDEX idx_shot_analysis_verified ON shot_analysis(human_verified);

-- 3. analysis_jobs 테이블
CREATE TABLE analysis_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'queued',
    error_message TEXT,
    llm_model TEXT,
    prompt_version TEXT,
    shots_found INTEGER,
    techniques_found INTEGER,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_analysis_jobs_video_id ON analysis_jobs(video_id);
CREATE INDEX idx_analysis_jobs_status ON analysis_jobs(status);

-- 4. updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_videos_updated_at
    BEFORE UPDATE ON videos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shot_analysis_updated_at
    BEFORE UPDATE ON shot_analysis
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
