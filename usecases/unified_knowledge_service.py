"""Unified Knowledge Service - Knowledge DB와 Video Reference DB 통합."""
from dataclasses import dataclass
from typing import Optional

from domain.entities.video_reference import ShotAnalysis
from usecases.interfaces.knowledge_db import CinematographyKnowledgeDB, TechniqueEntry
from usecases.interfaces.video_reference_db import VideoReferenceDB


@dataclass
class TechniqueWithReferences:
    """기법 + 레퍼런스 영상 통합 결과."""

    technique: TechniqueEntry
    references: list[ShotAnalysis]


class UnifiedKnowledgeService:
    """Knowledge DB + Video Reference DB 통합 서비스.

    Knowledge DB(YAML)에서 추상 기법을 쿼리하고,
    Video Reference DB(Supabase)에서 구체적인 예시 영상을 조회.

    Usage:
        ```python
        knowledge_db = YAMLKnowledgeDB.from_yaml_dir(Path("databases/knowledge"))
        video_db = SupabaseVideoReferenceDB.from_env()
        service = UnifiedKnowledgeService(knowledge_db, video_db)

        results = service.query_with_references(
            category="camera_language",
            moods=["tense", "intimate"],
        )

        for r in results:
            print(f"Technique: {r.technique.name}")
            print(f"  Prompt: {r.technique.prompt_fragment}")
            for ref in r.references:
                print(f"  Example: {ref.start_time}s - {ref.end_time}s")
        ```
    """

    def __init__(
        self,
        knowledge_db: CinematographyKnowledgeDB,
        video_db: Optional[VideoReferenceDB] = None,
    ):
        """Initialize unified service.

        Args:
            knowledge_db: YAML 기반 Knowledge DB
            video_db: Supabase 기반 Video Reference DB (없으면 레퍼런스 없이 동작)
        """
        self._knowledge_db = knowledge_db
        self._video_db = video_db

    def query_with_references(
        self,
        category: str,
        moods: Optional[list[str]] = None,
        shot_type: Optional[str] = None,
        include_references: bool = True,
        verified_only: bool = False,
        min_confidence: Optional[float] = None,
        references_per_technique: int = 3,
        limit: int = 5,
    ) -> list[TechniqueWithReferences]:
        """기법 쿼리 + 레퍼런스 영상 통합 조회.

        Args:
            category: "camera_language", "rendering_style", "shot_grammar"
            moods: 감정 태그 필터 (optional)
            shot_type: 샷 타입 필터 (optional)
            include_references: 레퍼런스 영상 포함 여부
            verified_only: human verified 레퍼런스만 포함
            min_confidence: 최소 confidence 필터
            references_per_technique: 기법당 최대 레퍼런스 수
            limit: 기법 최대 개수

        Returns:
            TechniqueWithReferences 리스트
        """
        # 1. Knowledge DB에서 기법 조회
        techniques = self._knowledge_db.query(
            category=category,
            moods=moods,
            shot_type=shot_type,
            limit=limit,
        )

        # 2. 각 기법에 대해 레퍼런스 조회
        results = []
        for technique in techniques:
            references: list[ShotAnalysis] = []

            if include_references and self._video_db:
                references = self._video_db.find_references_by_technique(
                    category=category,
                    technique_id=technique.id,
                    verified_only=verified_only,
                    min_confidence=min_confidence,
                    limit=references_per_technique,
                )

            results.append(TechniqueWithReferences(
                technique=technique,
                references=references,
            ))

        return results

    def get_technique_with_references(
        self,
        category: str,
        technique_id: str,
        verified_only: bool = False,
        limit: int = 10,
    ) -> Optional[TechniqueWithReferences]:
        """특정 기법과 레퍼런스 조회.

        Args:
            category: 카테고리
            technique_id: Knowledge DB의 technique id
            verified_only: human verified만
            limit: 레퍼런스 최대 개수

        Returns:
            TechniqueWithReferences 또는 None (기법 없으면)
        """
        technique = self._knowledge_db.get_by_id(category, technique_id)
        if not technique:
            return None

        references: list[ShotAnalysis] = []
        if self._video_db:
            references = self._video_db.find_references_by_technique(
                category=category,
                technique_id=technique_id,
                verified_only=verified_only,
                limit=limit,
            )

        return TechniqueWithReferences(
            technique=technique,
            references=references,
        )

    def validate_technique_exists(self, category: str, technique_id: str) -> bool:
        """technique_id가 Knowledge DB에 존재하는지 검증.

        ShotAnalysis 저장 전 유효성 검사에 사용.
        """
        return self._knowledge_db.get_by_id(category, technique_id) is not None

    def list_all_techniques(self, category: str, limit: int = 100) -> list[TechniqueEntry]:
        """카테고리의 모든 기법 조회.

        UI에서 드롭다운 등에 사용.
        """
        return self._knowledge_db.query(category=category, limit=limit)
