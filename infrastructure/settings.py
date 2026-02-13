"""
Application settings using pydantic-settings.

Loads configuration from environment variables and .env file.
"""
from pathlib import Path
from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from infrastructure.api_key_pool import APIKeyInfo


class VeoSettings(BaseSettings):
    """Veo-specific settings for video generation."""

    model_config = SettingsConfigDict(env_prefix="VEO_")

    rotation_strategy: str = Field(
        default="round_robin",
        alias="VEO_KEY_ROTATION_STRATEGY",
        description="Key rotation strategy: round_robin, least_used, random",
    )
    daily_limit_per_key: int = Field(
        default=10,
        alias="VEO_DAILY_LIMIT_PER_KEY",
        description="Daily video generation limit per API key",
    )
    max_concurrent_per_key: int = Field(
        default=2,
        alias="VEO_MAX_CONCURRENT_PER_KEY",
        description="Maximum concurrent generations per key",
    )


class Settings(BaseSettings):
    """
    Application settings.

    Loads from environment variables with optional .env file support.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # OpenAI
    openai_api_key: str = Field(
        ...,
        alias="OPENAI_API_KEY",
        description="OpenAI API key for GPT and DALL-E",
    )

    # Google Cloud / Vertex AI
    google_api_keys: str = Field(
        ...,
        alias="GOOGLE_API_KEYS",
        description=(
            "Comma-separated Google API keys. "
            "Format: 'key:alias:project_id' or 'key:alias' or 'key'. "
            "Example: 'abc123:prod:my-project-1,def456:backup:my-project-2'"
        ),
    )
    google_project_id: Optional[str] = Field(
        default=None,
        alias="GOOGLE_PROJECT_ID",
        description="Default Google Cloud project ID (used if not specified per-key)",
    )
    google_location: str = Field(
        default="us-central1",
        alias="GOOGLE_LOCATION",
        description="Google Cloud region",
    )

    # Kling AI
    kling_access_key: Optional[str] = Field(
        default=None,
        alias="KLING_ACCESS_KEY",
        description="Kling AI access key for JWT auth",
    )
    kling_secret_key: Optional[str] = Field(
        default=None,
        alias="KLING_SECRET_KEY",
        description="Kling AI secret key for JWT signing",
    )

    # Output settings
    output_dir: Path = Field(
        default=Path("./generated_videos"),
        alias="OUTPUT_DIR",
        description="Directory for generated videos",
    )
    assets_dir: Path = Field(
        default=Path("./assets"),
        alias="ASSETS_DIR",
        description="Directory for asset storage",
    )

    # Veo settings (nested)
    veo: VeoSettings = Field(default_factory=VeoSettings)

    @property
    def google_api_keys_list(self) -> list[str]:
        """Parse comma-separated API keys into list (keys only, no aliases)."""
        keys = []
        for i, k in enumerate(self.google_api_keys.split(",")):
            k = k.strip()
            if k:
                info = APIKeyInfo.parse(k, i, self.google_project_id)
                keys.append(info.key)
        return keys

    @property
    def google_api_key_infos(self) -> list[APIKeyInfo]:
        """
        Parse comma-separated API keys with aliases and project IDs.

        Format: 'key:alias:project_id' or 'key:alias' or 'key'
        Falls back to GOOGLE_PROJECT_ID if project not specified per-key.

        Examples:
            'abc123:prod:my-project-1,def456:backup:my-project-2'
            -> [APIKeyInfo(key='abc123', alias='prod', project_id='my-project-1'), ...]

            'abc123:prod,def456:backup' (with GOOGLE_PROJECT_ID=default-project)
            -> [APIKeyInfo(key='abc123', alias='prod', project_id='default-project'), ...]
        """
        infos = []
        for i, k in enumerate(self.google_api_keys.split(",")):
            k = k.strip()
            if k:
                infos.append(APIKeyInfo.parse(k, i, self.google_project_id))
        return infos

    def ensure_directories(self) -> None:
        """Create output directories if they don't exist."""
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.assets_dir.mkdir(parents=True, exist_ok=True)
        (self.assets_dir / "characters").mkdir(exist_ok=True)
        (self.assets_dir / "scenes").mkdir(exist_ok=True)
        (self.assets_dir / "shots").mkdir(exist_ok=True)
        (self.assets_dir / "prompts").mkdir(exist_ok=True)


def get_settings() -> Settings:
    """
    Get application settings (cached singleton pattern).

    Returns:
        Settings instance loaded from environment.
    """
    return Settings()
