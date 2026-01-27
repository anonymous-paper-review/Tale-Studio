"""Supabase implementation of VideoReferenceDB."""
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from supabase import create_client, Client

from domain.entities.video_reference import Video, ShotAnalysis
from usecases.interfaces.video_reference_db import VideoReferenceDB


class SupabaseVideoReferenceDB(VideoReferenceDB):
    """Supabase 기반 영상 레퍼런스 DB 구현."""

    def __init__(self, supabase_url: str, supabase_key: str):
        """Initialize with Supabase credentials.

        Args:
            supabase_url: Supabase project URL
            supabase_key: Supabase service role key
        """
        self._client: Client = create_client(supabase_url, supabase_key)

    @classmethod
    def from_env(cls) -> "SupabaseVideoReferenceDB":
        """Create from environment variables.

        Expects:
            SUPABASE_URL
            SUPABASE_SERVICE_KEY

        Raises:
            ValueError: If required environment variables are not set.
        """
        import os
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_KEY")
        if not url or not key:
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")
        return cls(url, key)

    # === Video CRUD ===

    def add_video(self, video: Video) -> Video:
        data = video.to_dict()
        result = self._client.table("videos").insert(data).execute()
        if not result.data:
            raise ValueError(f"Failed to insert video: {video.title}")
        return Video.from_dict(result.data[0])

    def get_video(self, video_id: UUID) -> Optional[Video]:
        result = self._client.table("videos").select("*").eq("id", str(video_id)).execute()
        if not result.data:
            return None
        return Video.from_dict(result.data[0])

    VALID_STATUSES = {"pending", "analyzed", "reviewed", "archived"}
    VALID_CATEGORIES = {"camera_language", "rendering_style", "shot_grammar"}
    MAX_LIMIT = 1000

    def update_video_status(self, video_id: UUID, status: str) -> None:
        if status not in self.VALID_STATUSES:
            raise ValueError(f"status must be one of {self.VALID_STATUSES}")
        self._client.table("videos").update({"status": status}).eq("id", str(video_id)).execute()

    def list_videos(
        self,
        status: Optional[str] = None,
        genre: Optional[str] = None,
        tags: Optional[list[str]] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Video]:
        query = self._client.table("videos").select("*")

        if status:
            query = query.eq("status", status)
        if genre:
            query = query.eq("genre", genre)
        if tags:
            # PostgreSQL array contains
            query = query.contains("tags", tags)

        # Bounds check
        limit = min(max(1, limit), self.MAX_LIMIT)
        offset = max(0, offset)

        query = query.order("created_at", desc=True).range(offset, offset + limit - 1)
        result = query.execute()

        return [Video.from_dict(row) for row in result.data]

    def delete_video(self, video_id: UUID) -> bool:
        result = self._client.table("videos").delete().eq("id", str(video_id)).execute()
        return len(result.data) > 0

    # === ShotAnalysis CRUD ===

    def add_shot_analysis(self, analysis: ShotAnalysis) -> ShotAnalysis:
        data = analysis.to_dict()
        result = self._client.table("shot_analysis").insert(data).execute()
        if not result.data:
            raise ValueError(f"Failed to insert shot analysis for video: {analysis.video_id}")
        return ShotAnalysis.from_dict(result.data[0])

    def add_shot_analyses_batch(self, analyses: list[ShotAnalysis]) -> list[ShotAnalysis]:
        if not analyses:
            return []
        data = [a.to_dict() for a in analyses]
        result = self._client.table("shot_analysis").insert(data).execute()
        return [ShotAnalysis.from_dict(row) for row in result.data]

    def get_shots_by_video(self, video_id: UUID) -> list[ShotAnalysis]:
        result = (
            self._client.table("shot_analysis")
            .select("*")
            .eq("video_id", str(video_id))
            .order("start_time")
            .execute()
        )
        return [ShotAnalysis.from_dict(row) for row in result.data]

    def verify_shot(
        self,
        shot_id: UUID,
        verified_by: str,
        notes: Optional[str] = None,
    ) -> ShotAnalysis:
        update_data = {
            "human_verified": True,
            "verified_by": verified_by,
            "verified_at": datetime.now(timezone.utc).isoformat(),
        }
        if notes:
            update_data["human_notes"] = notes

        result = (
            self._client.table("shot_analysis")
            .update(update_data)
            .eq("id", str(shot_id))
            .execute()
        )
        if not result.data:
            raise ValueError(f"Shot not found: {shot_id}")
        return ShotAnalysis.from_dict(result.data[0])

    # === 검색 (Knowledge DB 연결) ===

    def find_references_by_technique(
        self,
        category: str,
        technique_id: str,
        verified_only: bool = False,
        min_confidence: Optional[float] = None,
        limit: int = 10,
    ) -> list[ShotAnalysis]:
        if category not in self.VALID_CATEGORIES:
            raise ValueError(f"category must be one of {self.VALID_CATEGORIES}")

        # Bounds check
        limit = min(max(1, limit), self.MAX_LIMIT)

        query = (
            self._client.table("shot_analysis")
            .select("*")
            .eq("technique_category", category)
            .eq("technique_id", technique_id)
        )

        if verified_only:
            query = query.eq("human_verified", True)
        if min_confidence is not None:
            query = query.gte("confidence", min_confidence)

        query = query.order("confidence", desc=True).limit(limit)
        result = query.execute()

        return [ShotAnalysis.from_dict(row) for row in result.data]
