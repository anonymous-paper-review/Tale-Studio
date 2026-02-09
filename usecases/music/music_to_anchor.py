"""Music to Anchor conversion usecase."""
from typing import Optional

from domain.entities.ava import (
    Anchor,
    NarrativeCore,
    EmotionalCore,
    StructuralCore,
)
from domain.entities.music import MusicMetadata
from domain.value_objects.ava import Mood, EmotionalArc


class MusicToAnchor:
    """
    Converts MusicMetadata into an AVA Anchor.

    Extracts the core DNA (narrative, emotion, structure) from music metadata.
    """

    # Mapping from mood strings to Mood enum
    MOOD_MAPPING = {
        "melancholic": Mood.MELANCHOLIC,
        "melancholy": Mood.MELANCHOLIC,
        "sad": Mood.MELANCHOLIC,
        "hopeful": Mood.HOPEFUL,
        "uplifting": Mood.HOPEFUL,
        "happy": Mood.HOPEFUL,
        "tense": Mood.TENSE,
        "anxious": Mood.TENSE,
        "suspenseful": Mood.TENSE,
        "nostalgic": Mood.NOSTALGIC,
        "wistful": Mood.NOSTALGIC,
        "bittersweet": Mood.NOSTALGIC,
        "epic": Mood.EPIC,
        "grand": Mood.EPIC,
        "heroic": Mood.EPIC,
        "intimate": Mood.INTIMATE,
        "personal": Mood.INTIMATE,
        "quiet": Mood.INTIMATE,
        "chaotic": Mood.CHAOTIC,
        "frantic": Mood.CHAOTIC,
        "intense": Mood.CHAOTIC,
        "serene": Mood.SERENE,
        "peaceful": Mood.SERENE,
        "calm": Mood.SERENE,
        "ethereal": Mood.SERENE,
        "mysterious": Mood.SERENE,
        "eerie": Mood.SERENE,
        "dreamy": Mood.SERENE,
        "reflective": Mood.NOSTALGIC,
    }

    def execute(self, music: MusicMetadata) -> Anchor:
        """
        Convert music metadata to an Anchor.

        Args:
            music: The music metadata to convert

        Returns:
            An Anchor representing the music's core DNA
        """
        return Anchor(
            narrative=self._extract_narrative(music),
            emotion=self._extract_emotion(music),
            structure=self._extract_structure(music),
        )

    def _extract_narrative(self, music: MusicMetadata) -> NarrativeCore:
        """Extract narrative core from music."""
        # Use lyrics for beats if available
        if music.has_lyrics:
            # Take first 5 non-empty lines as beats
            lines = [
                line.strip()
                for line in music.lyrics.split('\n')
                if line.strip()
            ]
            beats = lines[:5]
        else:
            # Use metadata as fallback
            beats = [f"{music.title}"]
            if music.artist:
                beats.append(f"by {music.artist}")
            if music.mood_tags:
                beats.append(f"mood: {', '.join(music.mood_tags[:2])}")

        # Determine theme from mood tags
        theme = music.mood_tags[0] if music.mood_tags else "unknown"

        # Default arc based on typical song structure
        arc = "rise-fall-rise"

        return NarrativeCore(
            theme=theme,
            arc=arc,
            beats=beats,
        )

    def _extract_emotion(self, music: MusicMetadata) -> EmotionalCore:
        """Extract emotional core from music."""
        # Map primary mood to enum
        mood = self._map_mood(music.primary_mood)

        # Build tension curve from sections or use default
        if music.sections:
            tension_curve = tuple(s.energy_level for s in music.sections)
            # Find peaks (local maxima)
            peaks = self._find_peaks(tension_curve)
        else:
            # Default curve: build-up pattern
            tension_curve = (0.3, 0.5, 0.8, 0.6, 0.4)
            peaks = (0.5,)  # Middle peak

        # Tension points (normalized timeline positions)
        tension_points = [0.5]  # Default mid-point tension
        if music.sections:
            # Calculate tension points from high-energy sections
            total_duration = music.sections[-1].end_time if music.sections else 1.0
            for section in music.sections:
                if section.energy_level >= 0.7:
                    midpoint = (section.start_time + section.end_time) / 2
                    tension_points.append(midpoint / total_duration)

        return EmotionalCore(
            primary_mood=mood,
            emotional_arc=EmotionalArc(
                tension_curve=tension_curve,
                peaks=peaks,
            ),
            tension_points=tension_points[:3],  # Limit to 3 tension points
        )

    def _extract_structure(self, music: MusicMetadata) -> StructuralCore:
        """Extract structural core from music."""
        # Determine tempo category
        tempo = music.get_tempo_category()

        # Default rhythm pattern
        rhythm_pattern = "4/4"

        # Get section labels
        if music.sections:
            sections = [s.label for s in music.sections]
        else:
            # Default song structure
            sections = ["intro", "verse", "chorus", "verse", "chorus", "outro"]

        return StructuralCore(
            tempo=tempo,
            rhythm_pattern=rhythm_pattern,
            sections=sections,
        )

    def _map_mood(self, mood_str: Optional[str]) -> Mood:
        """Map a mood string to Mood enum."""
        if not mood_str:
            return Mood.MELANCHOLIC  # Default

        mood_lower = mood_str.lower()
        return self.MOOD_MAPPING.get(mood_lower, Mood.MELANCHOLIC)

    def _find_peaks(self, curve: tuple[float, ...]) -> tuple[float, ...]:
        """Find peak positions in tension curve."""
        if len(curve) < 3:
            return (0.5,)

        peaks = []
        for i in range(1, len(curve) - 1):
            if curve[i] > curve[i-1] and curve[i] > curve[i+1]:
                # Normalize position to 0.0-1.0
                peaks.append(i / (len(curve) - 1))

        return tuple(peaks) if peaks else (0.5,)
