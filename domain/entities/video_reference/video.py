"""Video entity for video reference database."""
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4


@dataclass
class Video:
    """영상 레퍼런스 엔티티."""

    title: str
    source_url: str
    platform: str  # youtube, vimeo, local
    id: UUID = field(default_factory=uuid4)
    duration_seconds: Optional[float] = None
    genre: Optional[str] = None
    director: Optional[str] = None
    year: Optional[int] = None
    tags: list[str] = field(default_factory=list)
    thumbnail_url: Optional[str] = None
    notes: Optional[str] = None
    status: str = "pending"  # pending, analyzed, reviewed, archived
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    def __post_init__(self):
        valid_platforms = {"youtube", "vimeo", "local"}
        if self.platform not in valid_platforms:
            raise ValueError(f"platform must be one of {valid_platforms}")

        valid_statuses = {"pending", "analyzed", "reviewed", "archived"}
        if self.status not in valid_statuses:
            raise ValueError(f"status must be one of {valid_statuses}")

    def to_dict(self) -> dict:
        """Convert to dictionary for database insertion."""
        return {
            "id": str(self.id),
            "title": self.title,
            "source_url": self.source_url,
            "platform": self.platform,
            "duration_seconds": self.duration_seconds,
            "genre": self.genre,
            "director": self.director,
            "year": self.year,
            "tags": self.tags,
            "thumbnail_url": self.thumbnail_url,
            "notes": self.notes,
            "status": self.status,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Video":
        """Create Video from dictionary."""
        return cls(
            id=UUID(data["id"]) if isinstance(data.get("id"), str) else data.get("id", uuid4()),
            title=data["title"],
            source_url=data["source_url"],
            platform=data["platform"],
            duration_seconds=data.get("duration_seconds"),
            genre=data.get("genre"),
            director=data.get("director"),
            year=data.get("year"),
            tags=data.get("tags", []),
            thumbnail_url=data.get("thumbnail_url"),
            notes=data.get("notes"),
            status=data.get("status", "pending"),
            created_at=data.get("created_at"),
            updated_at=data.get("updated_at"),
        )
