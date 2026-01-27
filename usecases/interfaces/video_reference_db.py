"""Video Reference DB interface."""
from abc import ABC, abstractmethod
from typing import Optional
from uuid import UUID

from domain.entities.video_reference.video import Video
from domain.entities.video_reference.shot_analysis import ShotAnalysis


class VideoReferenceDB(ABC):
    """영상 레퍼런스 데이터베이스 인터페이스.

    Knowledge DB(YAML)의 technique과 soft reference로 연결.
    """

    # === Video CRUD ===

    @abstractmethod
    def add_video(self, video: Video) -> Video:
        """영상 추가."""
        pass

    @abstractmethod
    def get_video(self, video_id: UUID) -> Optional[Video]:
        """영상 조회."""
        pass

    @abstractmethod
    def update_video_status(self, video_id: UUID, status: str) -> None:
        """영상 상태 업데이트."""
        pass

    @abstractmethod
    def list_videos(
        self,
        status: Optional[str] = None,
        genre: Optional[str] = None,
        tags: Optional[list[str]] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Video]:
        """영상 목록 조회."""
        pass

    @abstractmethod
    def delete_video(self, video_id: UUID) -> bool:
        """영상 삭제 (cascade로 shot_analysis도 삭제)."""
        pass

    # === ShotAnalysis CRUD ===

    @abstractmethod
    def add_shot_analysis(self, analysis: ShotAnalysis) -> ShotAnalysis:
        """샷 분석 추가."""
        pass

    @abstractmethod
    def add_shot_analyses_batch(self, analyses: list[ShotAnalysis]) -> list[ShotAnalysis]:
        """샷 분석 일괄 추가."""
        pass

    @abstractmethod
    def get_shots_by_video(self, video_id: UUID) -> list[ShotAnalysis]:
        """영상의 모든 샷 분석 조회."""
        pass

    @abstractmethod
    def verify_shot(
        self,
        shot_id: UUID,
        verified_by: str,
        notes: Optional[str] = None,
    ) -> ShotAnalysis:
        """샷 분석 검수 완료 처리."""
        pass

    # === 검색 (Knowledge DB 연결) ===

    @abstractmethod
    def find_references_by_technique(
        self,
        category: str,
        technique_id: str,
        verified_only: bool = False,
        min_confidence: Optional[float] = None,
        limit: int = 10,
    ) -> list[ShotAnalysis]:
        """기법으로 레퍼런스 검색.

        Args:
            category: "camera_language", "rendering_style", "shot_grammar"
            technique_id: Knowledge DB의 technique id (e.g., "handheld")
            verified_only: human_verified=True인 것만
            min_confidence: 최소 confidence 필터
            limit: 최대 결과 수
        """
        pass
