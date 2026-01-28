"""Supabase implementation of CinematographyKnowledgeDB."""
from typing import Optional

from supabase import create_client, Client

from usecases.interfaces import CinematographyKnowledgeDB, TechniqueEntry


class SupabaseKnowledgeDB(CinematographyKnowledgeDB):
    """Supabase 기반 Knowledge DB 구현.

    knowledge_techniques 테이블에서 촬영 기법 정보를 조회.
    """

    VALID_CATEGORIES = {"camera_language", "rendering_style", "shot_grammar"}

    def __init__(self, supabase_url: str, supabase_key: str):
        """Initialize with Supabase credentials.

        Args:
            supabase_url: Supabase project URL
            supabase_key: Supabase anon/service key
        """
        self._client: Client = create_client(supabase_url, supabase_key)

    @classmethod
    def from_env(cls) -> "SupabaseKnowledgeDB":
        """Create from environment variables.

        Expects:
            SUPABASE_URL
            SUPABASE_SERVICE_KEY (or SUPABASE_ANON_KEY)

        Raises:
            ValueError: If required environment variables are not set.
        """
        import os

        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_ANON_KEY")
        if not url or not key:
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")
        return cls(url, key)

    def query(
        self,
        category: str,
        moods: Optional[list[str]] = None,
        shot_type: Optional[str] = None,
        limit: int = 3,
    ) -> list[TechniqueEntry]:
        """Query techniques by category and optional filters.

        Args:
            category: "camera_language", "rendering_style", or "shot_grammar"
            moods: Filter by emotional tags (any match)
            shot_type: Filter by shot type affinity
            limit: Maximum number of results

        Returns:
            List of matching technique entries
        """
        if category not in self.VALID_CATEGORIES:
            raise ValueError(f"Invalid category: {category}. Must be one of {self.VALID_CATEGORIES}")

        query = (
            self._client.table("knowledge_techniques")
            .select("*")
            .eq("category", category)
        )

        # Filter by moods (overlaps = any match)
        if moods:
            query = query.overlaps("emotional_tags", moods)

        # Filter by shot type (contains)
        if shot_type:
            query = query.contains("shot_type_affinity", [shot_type])

        query = query.limit(limit)
        result = query.execute()

        return [self._to_entry(row) for row in result.data]

    def get_by_id(
        self, category: str, technique_id: str
    ) -> Optional[TechniqueEntry]:
        """Get a specific technique by ID.

        Args:
            category: The category to search in
            technique_id: The technique ID

        Returns:
            The technique entry if found, None otherwise
        """
        if category not in self.VALID_CATEGORIES:
            raise ValueError(f"Invalid category: {category}. Must be one of {self.VALID_CATEGORIES}")

        result = (
            self._client.table("knowledge_techniques")
            .select("*")
            .eq("category", category)
            .eq("technique_id", technique_id)
            .execute()
        )

        if not result.data:
            return None
        return self._to_entry(result.data[0])

    def _to_entry(self, row: dict) -> TechniqueEntry:
        """Convert DB row to TechniqueEntry."""
        return TechniqueEntry(
            id=row["technique_id"],
            name=row["name"],
            prompt_fragment=row["prompt_fragment"],
            emotional_tags=row.get("emotional_tags") or [],
            shot_type_affinity=row.get("shot_type_affinity") or [],
            description=row.get("description") or "",
        )

    # === 추가 메서드 (시딩/관리용) ===

    def insert_technique(self, category: str, entry: TechniqueEntry) -> TechniqueEntry:
        """Insert a new technique.

        Args:
            category: The category
            entry: TechniqueEntry to insert

        Returns:
            Inserted TechniqueEntry
        """
        if category not in self.VALID_CATEGORIES:
            raise ValueError(f"Invalid category: {category}. Must be one of {self.VALID_CATEGORIES}")

        data = {
            "technique_id": entry.id,
            "name": entry.name,
            "category": category,
            "prompt_fragment": entry.prompt_fragment,
            "emotional_tags": entry.emotional_tags,
            "shot_type_affinity": entry.shot_type_affinity,
            "description": entry.description,
        }

        result = self._client.table("knowledge_techniques").insert(data).execute()
        if not result.data:
            raise ValueError(f"Failed to insert technique: {entry.id}")
        return self._to_entry(result.data[0])

    def insert_techniques_batch(
        self, category: str, entries: list[TechniqueEntry]
    ) -> list[TechniqueEntry]:
        """Insert multiple techniques in batch.

        Args:
            category: The category
            entries: List of TechniqueEntry to insert

        Returns:
            List of inserted TechniqueEntry
        """
        if not entries:
            return []

        if category not in self.VALID_CATEGORIES:
            raise ValueError(f"Invalid category: {category}. Must be one of {self.VALID_CATEGORIES}")

        data = [
            {
                "technique_id": e.id,
                "name": e.name,
                "category": category,
                "prompt_fragment": e.prompt_fragment,
                "emotional_tags": e.emotional_tags,
                "shot_type_affinity": e.shot_type_affinity,
                "description": e.description,
            }
            for e in entries
        ]

        result = self._client.table("knowledge_techniques").insert(data).execute()
        return [self._to_entry(row) for row in result.data]

    def count_by_category(self, category: str) -> int:
        """Count techniques in a category."""
        result = (
            self._client.table("knowledge_techniques")
            .select("id", count="exact")
            .eq("category", category)
            .execute()
        )
        return result.count or 0
