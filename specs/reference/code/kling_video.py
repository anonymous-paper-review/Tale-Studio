"""
Kling AI Video Generator adapter.

Supports 6-axis camera control parameters for the Camera Explorer PoC.
API docs: https://app.klingai.com/global/dev/document-api/
"""
import asyncio
import logging
import time
from dataclasses import dataclass
from typing import Optional

import httpx
import jwt

logger = logging.getLogger(__name__)


@dataclass
class CameraParams:
    """Kling 6-axis camera control parameters (-10 ~ +10)."""

    horizontal: float = 0.0  # slide left(-)/right(+)
    vertical: float = 0.0  # slide down(-)/up(+)
    pan: float = 0.0  # pitch down(-)/up(+)
    tilt: float = 0.0  # yaw left(-)/right(+)
    roll: float = 0.0  # roll CCW(-)/CW(+)
    zoom: float = 0.0  # focal narrow(-)/wide(+)

    def has_movement(self) -> bool:
        """At least one non-zero param required by Kling API."""
        return any(
            v != 0.0
            for v in [self.horizontal, self.vertical, self.pan, self.tilt, self.roll, self.zoom]
        )

    def to_dict(self) -> dict:
        return {
            "horizontal": self.horizontal,
            "vertical": self.vertical,
            "pan": self.pan,
            "tilt": self.tilt,
            "roll": self.roll,
            "zoom": self.zoom,
        }

    def to_prompt_text(self) -> str:
        """Convert 6-axis values to natural language camera direction for v2+ models."""
        if not self.has_movement():
            return ""

        def _intensity(val: float) -> str:
            a = abs(val)
            if a <= 3:
                return "slowly"
            if a <= 6:
                return "steadily"
            return "dramatically"

        parts: list[str] = []

        if self.horizontal != 0:
            d = "right" if self.horizontal > 0 else "left"
            parts.append(f"Camera tracks {_intensity(self.horizontal)} to the {d}")

        if self.vertical != 0:
            d = "upward" if self.vertical > 0 else "downward"
            parts.append(f"Camera cranes {_intensity(self.vertical)} {d}")

        if self.pan != 0:
            d = "upward" if self.pan > 0 else "downward"
            parts.append(f"Camera tilts {_intensity(self.pan)} {d}")

        if self.tilt != 0:
            d = "right" if self.tilt > 0 else "left"
            parts.append(f"Camera pans {_intensity(self.tilt)} to the {d}")

        if self.roll != 0:
            d = "clockwise" if self.roll > 0 else "counter-clockwise"
            parts.append(f"Camera rolls {_intensity(self.roll)} {d}")

        if self.zoom != 0:
            if self.zoom > 0:
                parts.append(f"Camera {_intensity(self.zoom)} pushes in toward the subject")
            else:
                parts.append(f"Camera {_intensity(self.zoom)} pulls back from the subject")

        return ". ".join(parts)


@dataclass
class KlingTask:
    """Kling video generation task."""

    task_id: str
    status: str  # submitted, processing, succeed, failed
    video_url: Optional[str] = None
    error: Optional[str] = None


class KlingVideoClient:
    """
    Kling AI API client for text-to-video with camera control.

    Auth: JWT (HS256) from access_key + secret_key.
    """

    BASE_URL = "https://api.klingai.com"

    def __init__(
        self,
        access_key: str,
        secret_key: str,
        model: str = "kling-v2-master",
        poll_interval: float = 5.0,
    ):
        self._access_key = access_key
        self._secret_key = secret_key
        self._model = model
        self._poll_interval = poll_interval
        self._client = httpx.AsyncClient(timeout=60.0)

    def _generate_jwt(self) -> str:
        """Generate JWT token for Kling API auth."""
        now = int(time.time())
        headers = {"alg": "HS256", "typ": "JWT"}
        payload = {
            "iss": self._access_key,
            "exp": now + 1800,  # 30 min
            "nbf": now - 5,
        }
        return jwt.encode(payload, self._secret_key, algorithm="HS256", headers=headers)

    def _headers(self) -> dict:
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self._generate_jwt()}",
        }

    async def generate(
        self,
        prompt: str,
        camera: Optional[CameraParams] = None,
        negative_prompt: str = "",
        duration: str = "5",
        aspect_ratio: str = "16:9",
        mode: str = "std",
        precise_camera: bool = False,
    ) -> KlingTask:
        """
        Create text-to-video generation task.

        Args:
            prompt: Scene description.
            camera: 6-axis camera control (None = no camera control).
            negative_prompt: What to avoid.
            duration: "5" or "10" seconds.
            aspect_ratio: "16:9", "9:16", "1:1".
            mode: "std" or "pro".
            precise_camera: True = v1 + numeric 6-axis (exact but lower quality).
                            False = v2+ with camera text injected into prompt.
        """
        has_cam = camera and camera.has_movement()
        use_numeric = has_cam and precise_camera

        final_prompt = prompt
        if has_cam and not precise_camera:
            cam_text = camera.to_prompt_text()
            final_prompt = f"{prompt}. {cam_text}"
            logger.info("[Kling] Camera text injected: %s", cam_text)

        logger.info("[Kling] model=%s, precise=%s, has_cam=%s, prompt_len=%d",
                     "kling-v1" if use_numeric else self._model, precise_camera, has_cam, len(final_prompt))

        body: dict = {
            "model_name": "kling-v1" if use_numeric else self._model,
            "prompt": final_prompt,
            "negative_prompt": negative_prompt,
            "duration": "5" if use_numeric else duration,
            "aspect_ratio": aspect_ratio,
            "mode": "std" if use_numeric else mode,
        }

        if use_numeric:
            body["camera_control"] = {
                "type": "simple",
                "config": camera.to_dict(),
            }

        resp = await self._client.post(
            f"{self.BASE_URL}/v1/videos/text2video",
            headers=self._headers(),
            json=body,
        )
        if resp.status_code >= 400:
            error_body = resp.text
            return KlingTask(
                task_id="",
                status="failed",
                error=f"HTTP {resp.status_code}: {error_body}",
            )
        data = resp.json()

        if data.get("code") != 0:
            return KlingTask(
                task_id="",
                status="failed",
                error=data.get("message", "Unknown error"),
            )

        task_data = data.get("data", {})
        return KlingTask(
            task_id=task_data.get("task_id", ""),
            status=task_data.get("task_status", "submitted"),
        )

    async def get_status(self, task_id: str) -> KlingTask:
        """Poll task status."""
        resp = await self._client.get(
            f"{self.BASE_URL}/v1/videos/text2video/{task_id}",
            headers=self._headers(),
        )
        resp.raise_for_status()
        data = resp.json()

        if data.get("code") != 0:
            return KlingTask(
                task_id=task_id,
                status="failed",
                error=data.get("message", "Unknown error"),
            )

        task_data = data.get("data", {})
        status = task_data.get("task_status", "processing")
        video_url = None

        if status == "succeed":
            result = task_data.get("task_result", {})
            videos = result.get("videos", [])
            if videos:
                video_url = videos[0].get("url")

        return KlingTask(
            task_id=task_id,
            status=status,
            video_url=video_url,
        )

    async def wait_for_completion(self, task_id: str, timeout: float = 300) -> KlingTask:
        """Poll until task completes or times out."""
        start = time.time()
        while True:
            task = await self.get_status(task_id)
            if task.status in ("succeed", "failed"):
                return task
            if time.time() - start > timeout:
                return KlingTask(task_id=task_id, status="failed", error="Timeout")
            await asyncio.sleep(self._poll_interval)

    async def close(self):
        await self._client.aclose()
