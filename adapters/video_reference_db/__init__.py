"""Video Reference DB adapters."""


def __getattr__(name: str):
    """Lazy import to avoid supabase dependency at import time."""
    if name == "SupabaseVideoReferenceDB":
        from adapters.video_reference_db.supabase_video_db import SupabaseVideoReferenceDB
        return SupabaseVideoReferenceDB
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


__all__ = ["SupabaseVideoReferenceDB"]
