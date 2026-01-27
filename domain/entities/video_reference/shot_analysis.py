"""ShotAnalysis entity for video reference database."""
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4


@dataclass
class ShotAnalysis:
    """샷 분석 엔티티 - Knowledge DB와 soft reference 연결."""

    video_id: UUID
    start_time: float
    end_time: float
    technique_category: str  # camera_language, rendering_style, shot_grammar
    technique_id: str  # Knowledge DB의 technique id
    id: UUID = field(default_factory=uuid4)
    confidence: Optional[float] = None
    llm_reasoning: Optional[str] = None
    human_verified: bool = False
    human_notes: Optional[str] = None
    verified_by: Optional[str] = None
    verified_at: Optional[datetime] = None
    additional_tags: list[str] = field(default_factory=list)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    def __post_init__(self):
        if self.end_time <= self.start_time:
            raise ValueError("end_time must be greater than start_time")

        if self.confidence is not None and not (0 <= self.confidence <= 1):
            raise ValueError("confidence must be between 0 and 1")

        valid_categories = {"camera_language", "rendering_style", "shot_grammar"}
        if self.technique_category not in valid_categories:
            raise ValueError(f"technique_category must be one of {valid_categories}")

    @property
    def duration(self) -> float:
        """샷 길이 (초)."""
        return self.end_time - self.start_time

    def to_dict(self) -> dict:
        """Convert to dictionary for database insertion."""
        return {
            "id": str(self.id),
            "video_id": str(self.video_id),
            "start_time": self.start_time,
            "end_time": self.end_time,
            "technique_category": self.technique_category,
            "technique_id": self.technique_id,
            "confidence": self.confidence,
            "llm_reasoning": self.llm_reasoning,
            "human_verified": self.human_verified,
            "human_notes": self.human_notes,
            "verified_by": self.verified_by,
            "verified_at": self.verified_at.isoformat() if self.verified_at else None,
            "additional_tags": self.additional_tags,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "ShotAnalysis":
        """Create ShotAnalysis from dictionary."""
        verified_at = data.get("verified_at")
        if isinstance(verified_at, str):
            verified_at = datetime.fromisoformat(verified_at.replace("Z", "+00:00"))

        return cls(
            id=UUID(data["id"]) if isinstance(data.get("id"), str) else data.get("id", uuid4()),
            video_id=UUID(data["video_id"]) if isinstance(data["video_id"], str) else data["video_id"],
            start_time=data["start_time"],
            end_time=data["end_time"],
            technique_category=data["technique_category"],
            technique_id=data["technique_id"],
            confidence=data.get("confidence"),
            llm_reasoning=data.get("llm_reasoning"),
            human_verified=data.get("human_verified", False),
            human_notes=data.get("human_notes"),
            verified_by=data.get("verified_by"),
            verified_at=verified_at,
            additional_tags=data.get("additional_tags", []),
            created_at=data.get("created_at"),
            updated_at=data.get("updated_at"),
        )
