#!/usr/bin/env python3
"""
기존 L1 결과로부터 L2→L3→Veo 파이프라인을 이어서 실행.

Usage:
    # L2만 실행
    python scripts/resume_pipeline.py --output-dir output/20260128_112302 --step l2

    # L3만 실행 (L2 완료 후)
    python scripts/resume_pipeline.py --output-dir output/20260128_112302 --step l3

    # Veo만 실행 (L3 완료 후)
    python scripts/resume_pipeline.py --output-dir output/20260128_112302 --step veo --shots 1

    # L2→L3→Veo 전체 (3분 간격)
    python scripts/resume_pipeline.py --output-dir output/20260128_112302 --step all --delay 180
"""
import asyncio
import argparse
import json
import time
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from domain.entities.scene import Scene, Act
from domain.entities.character import Character
from domain.value_objects import Duration, SceneType
from usecases.shot_composer import LLMDirectComposer, ShotComposerInput
from usecases.prompt_builder import PromptBuilder, PromptBuilderInput
from usecases.interfaces import VideoRequest
from infrastructure.settings import Settings
from infrastructure.api_key_pool import APIKeyPool, RotationStrategy
from adapters.gateways.gemini_llm import GeminiLLMGateway
from adapters.gateways.veo_video import VeoVideoGenerator
from adapters.repositories.file_repository import FileAssetRepository


def load_scenes(output_dir: Path) -> list[Scene]:
    """기존 scene JSON들을 로드해서 Scene 객체로 변환."""
    scenes_dir = output_dir / "scenes"
    scenes = []

    for scene_file in sorted(scenes_dir.glob("scene_*.json")):
        with open(scene_file) as f:
            data = json.load(f)

        scene = Scene(
            id=data["id"],
            scene_type=SceneType(data["scene_type"]),
            duration=Duration(data["duration_seconds"]),
            act=Act(data["act"]),
            narrative_summary=data["narrative_summary"],
            character_ids=data.get("character_ids", []),
            location_id=data.get("location_id"),
        )
        scenes.append(scene)

    return scenes


def load_characters(output_dir: Path) -> list[Character]:
    """기존 character JSON들을 로드해서 Character 객체로 변환."""
    chars_dir = output_dir / "characters"
    characters = []

    for char_file in chars_dir.glob("*.json"):
        with open(char_file) as f:
            data = json.load(f)

        char = Character(
            id=data["id"],
            name=data["name"],
            age=data["age"],
            gender=data["gender"],
            physical_description=data["physical_description"],
            outfit=data.get("outfit"),
            face_details=data.get("face_details"),
        )
        characters.append(char)

    return characters


def load_shots(output_dir: Path):
    """기존 shot JSON들을 로드."""
    from domain.entities.shot import Shot
    from domain.value_objects import ShotType

    shots_dir = output_dir / "shots"
    all_shots = []

    for scene_dir in sorted(shots_dir.glob("scene_*")):
        for shot_file in sorted(scene_dir.glob("*.json")):
            with open(shot_file) as f:
                data = json.load(f)

            shot = Shot(
                id=data["id"],
                scene_id=data["scene_id"],
                shot_type=ShotType(data["shot_type"]),
                duration=Duration(data["duration_seconds"]),
                purpose=data["purpose"],
                character_ids=data.get("character_ids", []),
                action_description=data.get("action_description"),
            )
            all_shots.append(shot)

    return all_shots


def load_prompts(output_dir: Path):
    """기존 prompt JSON들을 로드."""
    from domain.entities.prompt import Prompt, CinematographySpec
    from domain.value_objects import ShotType

    prompts_dir = output_dir / "prompts"
    prompts = []

    for prompt_file in sorted(prompts_dir.glob("*.json")):
        with open(prompt_file) as f:
            data = json.load(f)

        # CinematographySpec 복원
        cinematography = None
        cine_data = data.get("cinematography")
        if cine_data:
            if isinstance(cine_data, dict):
                cinematography = CinematographySpec(
                    shot_framing=cine_data.get("shot_framing", ""),
                    camera_angle=cine_data.get("camera_angle"),
                    camera_movement=cine_data.get("camera_movement"),
                    lighting_type=cine_data.get("lighting_type"),
                )
            else:
                # 문자열인 경우
                cinematography = CinematographySpec(shot_framing=str(cine_data))

        prompt = Prompt(
            shot_id=data["shot_id"],
            shot_type=ShotType(data["shot_type"]),
            purpose=data["purpose"],
            character_prompts=data.get("character_prompts", []),
            scene_context=data.get("scene_context"),
            cinematography=cinematography,
            style_keywords=data.get("style_keywords", []),
            negative_prompts=data.get("negative_prompts", []),
        )
        prompts.append(prompt)

    return prompts


async def run_l2(output_dir: Path, llm: GeminiLLMGateway, repo: FileAssetRepository, scenes: list[Scene]):
    """L2 (ShotComposer) 실행."""
    print("\n" + "=" * 70)
    print("[L2] ShotComposer")
    print("=" * 70)

    shot_composer = LLMDirectComposer(llm_gateway=llm, asset_repository=repo)
    l2_input = ShotComposerInput(scenes=scenes)
    l2_output = await shot_composer.execute(l2_input)

    all_shots = []
    for scene_id, shots in l2_output.shot_sequences.items():
        for shot in shots:
            all_shots.append(shot)

    print(f"\n✓ 총 {len(all_shots)}개 샷 생성")
    for shot in all_shots[:5]:
        print(f"  [{shot.id}] {shot.shot_type.value} | {shot.duration.seconds}초 | {shot.purpose[:30]}...")
    if len(all_shots) > 5:
        print(f"  ... 외 {len(all_shots) - 5}개")

    return all_shots


async def run_l3(output_dir: Path, repo: FileAssetRepository, shots, characters: list[Character], scenes: list[Scene]):
    """L3 (PromptBuilder) 실행."""
    print("\n" + "=" * 70)
    print("[L3] PromptBuilder")
    print("=" * 70)

    prompt_builder = PromptBuilder(asset_repository=repo)
    scene_contexts = {scene.id: scene.narrative_summary for scene in scenes}

    # 기본 스타일 키워드
    style_keywords = ["Cinematic", "24fps film look", "natural lighting"]

    l3_input = PromptBuilderInput(
        shots=shots,
        characters=characters,
        scene_contexts=scene_contexts,
        style_keywords=style_keywords,
        negative_prompts=["CGI", "cartoon", "anime", "deformed", "text", "subtitles", "watermark"],
    )

    l3_output = await prompt_builder.execute(l3_input)
    print(f"\n✓ 총 {len(l3_output.prompts)}개 프롬프트 생성")

    return l3_output.prompts


async def run_veo(output_dir: Path, prompts, num_shots: int, api_key: str):
    """Veo 영상 생성."""
    print("\n" + "=" * 70)
    print("[Veo] Video Generation")
    print("=" * 70)

    prompts_to_generate = prompts[:num_shots]
    print(f"\n생성할 샷: {len(prompts_to_generate)}개")

    veo = VeoVideoGenerator(api_key=api_key, model="veo-3.0-generate-001")
    videos_dir = output_dir / "videos"
    videos_dir.mkdir(exist_ok=True)

    generated_videos = []

    try:
        for i, prompt in enumerate(prompts_to_generate):
            prompt_text = prompt.build()
            print(f"\n[{i+1}/{len(prompts_to_generate)}] {prompt.shot_id}")
            print(f"  Prompt: {prompt_text[:100]}...")

            request = VideoRequest(
                prompt=prompt_text,
                duration_seconds=8,
                aspect_ratio="16:9",
            )

            print("  생성 중...")
            job = await veo.generate(request)
            print(f"  Job ID: {job.job_id[:50]}...")

            completed_job = await veo.wait_for_completion(job.job_id, timeout_seconds=300)

            if completed_job.video_url:
                save_path = videos_dir / f"{prompt.shot_id}.mp4"
                downloaded_path = await veo.download(completed_job.video_url, str(save_path))
                print(f"  ✓ 저장: {downloaded_path}")
                generated_videos.append({
                    "shot_id": prompt.shot_id,
                    "path": downloaded_path,
                    "prompt": prompt_text[:200],
                })
            else:
                print(f"  ✗ 실패: {completed_job.error_message}")

    finally:
        await veo.close()

    return generated_videos


async def main():
    parser = argparse.ArgumentParser(description="Resume AVA Pipeline from L1")
    parser.add_argument("--output-dir", type=Path, required=True, help="기존 output 디렉토리")
    parser.add_argument("--step", choices=["l2", "l3", "veo", "all"], default="all", help="실행할 단계")
    parser.add_argument("--delay", type=int, default=0, help="단계 간 대기 시간 (초)")
    parser.add_argument("--shots", type=int, default=1, help="생성할 영상 수")
    args = parser.parse_args()

    output_dir = args.output_dir
    if not output_dir.exists():
        print(f"Error: 디렉토리가 없음: {output_dir}")
        return

    print("=" * 70)
    print(f"Resume Pipeline: {output_dir}")
    print("=" * 70)

    # 설정 로드
    settings = Settings()
    key_infos = settings.google_api_key_infos
    if not key_infos:
        print("Error: No Google API keys configured")
        return

    key_pool = APIKeyPool(
        keys=key_infos,
        strategy=RotationStrategy.ROUND_ROBIN,
        daily_limit=1500,
        max_failures_per_key=3,
    )

    # 기존 데이터 로드
    scenes = load_scenes(output_dir)
    characters = load_characters(output_dir)
    print(f"\n✓ Scenes: {len(scenes)}개")
    print(f"✓ Characters: {len(characters)}개")

    llm = GeminiLLMGateway(key_pool=key_pool, model="gemini-2.0-flash-lite")
    repo = FileAssetRepository(base_dir=output_dir)

    try:
        # L2
        if args.step in ["l2", "all"]:
            shots = await run_l2(output_dir, llm, repo, scenes)

            if args.step == "l2":
                print("\n" + "=" * 70)
                print(f"L2 완료! 출력: {output_dir}")
                print("=" * 70)
                return

            if args.delay > 0:
                print(f"\n⏳ {args.delay}초 대기 중...")
                time.sleep(args.delay)
        elif args.step in ["l3", "veo"]:
            shots = load_shots(output_dir)
            print(f"✓ 기존 Shots 로드: {len(shots)}개")

        # L3
        if args.step in ["l3", "all"]:
            prompts = await run_l3(output_dir, repo, shots, characters, scenes)

            if args.step == "l3":
                print("\n" + "=" * 70)
                print(f"L3 완료! 출력: {output_dir}")
                print("=" * 70)
                return

            if args.delay > 0:
                print(f"\n⏳ {args.delay}초 대기 중...")
                time.sleep(args.delay)
        elif args.step == "veo":
            prompts = load_prompts(output_dir)
            print(f"✓ 기존 Prompts 로드: {len(prompts)}개")

        # Veo
        if args.step in ["veo", "all"]:
            api_key = key_infos[0].key
            videos = await run_veo(output_dir, prompts, args.shots, api_key)
            print(f"\n✓ 생성된 영상: {len(videos)}개")

    finally:
        await llm.close()

    print("\n" + "=" * 70)
    print(f"완료! 출력: {output_dir}")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(main())
