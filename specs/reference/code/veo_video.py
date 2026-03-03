"""
Veo Video Generator adapter.

Implements VideoGenerator interface using Google Veo API (Gemini API).
"""
import asyncio
import base64
from pathlib import Path
from typing import Optional

import httpx

from usecases.interfaces import VideoGenerator, VideoRequest, VideoJob, VideoStatus


class VeoVideoGenerator(VideoGenerator):
    """
    Google Veo adapter for video generation via Gemini API.

    Supports both T2V (text-to-video) and I2V (image-to-video).
    No project_id required - uses API key only.
    """

    GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta"

    def __init__(
        self,
        api_key: str,
        model: str = "veo-2.0-generate-001",
        poll_interval: float = 5.0,
        timeout: float = 300.0,
    ):
        """
        Initialize Veo generator.

        Args:
            api_key: Google AI Studio API key.
            model: Veo model to use. Options:
                - veo-2.0-generate-001
                - veo-3.0-generate-001
                - veo-3.0-fast-generate-001
                - veo-3.1-generate-preview
                - veo-3.1-fast-generate-preview
            poll_interval: Seconds between status checks.
            timeout: HTTP request timeout.
        """
        self._api_key = api_key
        self._model = model
        self._poll_interval = poll_interval
        self._client = httpx.AsyncClient(
            timeout=timeout,
            headers={
                "Content-Type": "application/json",
            },
        )

    def _url(self, path: str) -> str:
        """Build URL with API key."""
        return f"{self.GEMINI_API_BASE}{path}?key={self._api_key}"

    async def generate(self, request: VideoRequest) -> VideoJob:
        """Start video generation job."""
        # Build request payload for Gemini API
        payload = {
            "instances": [
                {
                    "prompt": request.prompt,
                }
            ],
            "parameters": {
                "aspectRatio": request.aspect_ratio or "16:9",
                "durationSeconds": request.duration_seconds or 8,
            },
        }

        # Add reference image for I2V
        if request.reference_image_path:
            image_data, mime_type = self._encode_image_with_mime(request.reference_image_path)
            payload["instances"][0]["image"] = {
                "bytesBase64Encoded": image_data,
                "mimeType": mime_type,
            }

        endpoint = self._url(f"/models/{self._model}:predictLongRunning")

        response = await self._client.post(endpoint, json=payload)
        if response.status_code >= 400:
            print(f"API Error Response: {response.text}")
        response.raise_for_status()

        data = response.json()

        # Extract operation name from response
        operation_name = data.get("name", "")

        return VideoJob(
            job_id=operation_name,
            status=VideoStatus.PROCESSING,
            progress=0.0,
        )

    async def get_status(self, job_id: str) -> VideoJob:
        """Get status of video generation job."""
        # job_id is the full operation name
        endpoint = f"{self.GEMINI_API_BASE}/{job_id}?key={self._api_key}"

        response = await self._client.get(endpoint)
        response.raise_for_status()

        data = response.json()
        return self._parse_job_status(job_id, data)

    async def wait_for_completion(
        self, job_id: str, timeout_seconds: float = 300
    ) -> VideoJob:
        """Wait for job to complete with polling."""
        start_time = asyncio.get_event_loop().time()

        while True:
            job = await self.get_status(job_id)

            if job.status in (VideoStatus.COMPLETED, VideoStatus.FAILED):
                return job

            elapsed = asyncio.get_event_loop().time() - start_time
            if elapsed >= timeout_seconds:
                raise TimeoutError(
                    f"Video generation timed out after {timeout_seconds}s"
                )

            await asyncio.sleep(self._poll_interval)

    async def download(self, video_url: str, save_path: str) -> str:
        """Download video from URL to local path."""
        # Handle base64 data URI
        if video_url.startswith("data:"):
            path = Path(save_path)
            path.parent.mkdir(parents=True, exist_ok=True)
            _, encoded = video_url.split(",", 1)
            video_bytes = base64.b64decode(encoded)
            path.write_bytes(video_bytes)
            return str(path)

        # Handle Gemini API file URLs (need API key)
        download_url = video_url
        if "generativelanguage.googleapis.com" in video_url:
            separator = "&" if "?" in video_url else "?"
            download_url = f"{video_url}{separator}key={self._api_key}"

        # Download video (follow redirects)
        async with httpx.AsyncClient(timeout=120.0, follow_redirects=True) as client:
            response = await client.get(download_url)
            response.raise_for_status()

            path = Path(save_path)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(response.content)

            return str(path)

    def _encode_image(self, image_path: str) -> str:
        """Encode image file to base64."""
        with open(image_path, "rb") as f:
            return base64.b64encode(f.read()).decode("utf-8")

    def _encode_image_with_mime(self, image_path: str) -> tuple[str, str]:
        """Encode image file to base64 with MIME type detection."""
        path = Path(image_path)
        ext = path.suffix.lower()

        mime_map = {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".webp": "image/webp",
            ".gif": "image/gif",
        }
        mime_type = mime_map.get(ext, "image/png")

        with open(image_path, "rb") as f:
            data = base64.b64encode(f.read()).decode("utf-8")

        return data, mime_type

    def _parse_job_status(self, job_id: str, data: dict) -> VideoJob:
        """Parse job status from API response."""
        is_done = data.get("done", False)

        # Check for error
        if "error" in data:
            return VideoJob(
                job_id=job_id,
                status=VideoStatus.FAILED,
                error_message=data["error"].get("message", "Unknown error"),
            )

        # Check for completion
        if is_done and "response" in data:
            video_url = None
            response_data = data.get("response", {})

            # Format 1: generateVideoResponse.generatedSamples (Gemini API)
            gen_video_resp = response_data.get("generateVideoResponse", {})
            samples = gen_video_resp.get("generatedSamples", [])
            if samples:
                video_data = samples[0].get("video", {})
                if "uri" in video_data:
                    video_url = video_data["uri"]
                elif "bytesBase64Encoded" in video_data:
                    video_base64 = video_data["bytesBase64Encoded"]
                    video_url = f"data:video/mp4;base64,{video_base64}"

            # Format 2: generatedSamples (direct)
            if not video_url:
                samples = response_data.get("generatedSamples", [])
                if samples:
                    video_data = samples[0].get("video", {})
                    if "uri" in video_data:
                        video_url = video_data["uri"]
                    elif "bytesBase64Encoded" in video_data:
                        video_base64 = video_data["bytesBase64Encoded"]
                        video_url = f"data:video/mp4;base64,{video_base64}"

            # Format 3: videos array
            if not video_url:
                videos = response_data.get("videos", [])
                if videos:
                    video_data = videos[0]
                    if "uri" in video_data:
                        video_url = video_data["uri"]
                    elif "bytesBase64Encoded" in video_data:
                        video_base64 = video_data["bytesBase64Encoded"]
                        video_url = f"data:video/mp4;base64,{video_base64}"

            return VideoJob(
                job_id=job_id,
                status=VideoStatus.COMPLETED,
                progress=100.0,
                video_url=video_url,
            )

        # Still processing
        metadata = data.get("metadata", {})
        progress = metadata.get("progress", 0)

        return VideoJob(
            job_id=job_id,
            status=VideoStatus.PROCESSING,
            progress=float(progress),
        )

    async def close(self):
        """Close the HTTP client."""
        await self._client.aclose()
