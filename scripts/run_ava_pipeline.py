#!/usr/bin/env python3
"""
AVA Framework 전체 파이프라인 스크립트.

Music/Lore → AVA → L1 → L2 → L3 → Veo → Video

Usage:
    # AVA 변환만 (빠름)
    python scripts/run_ava_pipeline.py --lore assets/lore/temple_of_time.yaml

    # L1까지 (씬 분할)
    python scripts/run_ava_pipeline.py --lore assets/lore/temple_of_time.yaml --run-l1

    # 전체 파이프라인 + 영상 생성
    python scripts/run_ava_pipeline.py --lore assets/lore/temple_of_time.yaml --generate-video
"""
import asyncio
import argparse
import json
from pathlib import Path
from datetime import datetime

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

import yaml

from domain.entities.music import MusicMetadata, MusicSection
from usecases.music_to_video_adapter import MusicToVideoAdapter
from usecases.scene_architect import SceneArchitect, SceneArchitectInput
from usecases.shot_composer import LLMDirectComposer, ShotComposerInput
from usecases.prompt_builder import PromptBuilder, PromptBuilderInput
from infrastructure.settings import Settings
from infrastructure.api_key_pool import APIKeyPool, RotationStrategy
from adapters.gateways.gemini_llm import GeminiLLMGateway
from adapters.gateways.veo_video import VeoVideoGenerator
from adapters.repositories.file_repository import FileAssetRepository


def load_lore_as_music_metadata(lore_path: Path) -> tuple[MusicMetadata, str | None, dict | None]:
    """Lore YAML에서 MusicMetadata 추출."""
    with open(lore_path) as f:
        data = yaml.safe_load(f)

    meta = data.get("metadata", {})
    anchor = data.get("anchor", {})
    visual_hints = data.get("visual_hints", {})

    # sections 변환
    sections = []
    structure = anchor.get("structure", {})
    for sec in structure.get("sections", []):
        sections.append(MusicSection(
            label=sec["label"],
            start_time=sec["start_time"],
            end_time=sec["end_time"],
            energy_level=sec.get("energy_level", 0.5),
        ))

    # BPM 처리 (range인 경우 평균)
    bpm = meta.get("bpm")
    if not bpm and "bpm_range" in meta:
        bpm_range = meta["bpm_range"]
        bpm = sum(bpm_range) // len(bpm_range)

    music = MusicMetadata(
        title=meta.get("title", "Unknown"),
        artist=meta.get("composer") or meta.get("artist"),
        duration_seconds=meta.get("duration_seconds"),
        bpm=bpm,
        mood_tags=meta.get("mood_tags", []),
        genre_tags=meta.get("genre_tags", []),
        sections=sections,
    )

    # narrative beats + visual_hints → story_seed
    narrative = anchor.get("narrative", {})
    beats = narrative.get("beats", [])

    story_parts = []
    # visual_hints를 스토리 앞에 추가
    if visual_hints:
        if visual_hints.get("setting"):
            story_parts.append(f"Setting: {visual_hints['setting']}")
        if visual_hints.get("characters"):
            story_parts.append(f"Characters: {visual_hints['characters']}")
        if visual_hints.get("atmosphere"):
            story_parts.append(f"Atmosphere: {visual_hints['atmosphere']}")
        story_parts.append("")  # 빈 줄

    # narrative beats 추가
    for beat in beats:
        story_parts.append(f"- {beat}")

    story_seed = "\n".join(story_parts) if story_parts else None

    return music, story_seed, visual_hints


def create_sample_music() -> tuple[MusicMetadata, str | None]:
    """샘플 MusicMetadata 생성 (lore 없을 때)."""
    music = MusicMetadata(
        title="Rainy Memories",
        artist="Unknown",
        duration_seconds=180,
        bpm=72,
        mood_tags=["melancholic", "nostalgic"],
        genre_tags=["ambient", "piano"],
        sections=[
            MusicSection("intro", 0, 30, 0.3),
            MusicSection("verse", 30, 90, 0.5),
            MusicSection("chorus", 90, 150, 0.8),
            MusicSection("outro", 150, 180, 0.4),
        ],
    )
    story_seed = "A lonely figure walks through rain, remembering lost moments."
    return music, story_seed


async def main():
    parser = argparse.ArgumentParser(description="AVA Framework Pipeline")
    parser.add_argument("--lore", type=Path, help="Path to lore YAML file")
    parser.add_argument("--run-l1", action="store_true", help="Run L1 (SceneArchitect)")
    parser.add_argument("--generate-video", action="store_true", help="Run full pipeline + generate video")
    parser.add_argument("--shots", type=int, default=1, help="Number of shots to generate (default: 1)")
    args = parser.parse_args()

    print("=" * 70)
    print("AVA Framework Pipeline")
    print("=" * 70)

    # 1. 입력 데이터 로드
    visual_hints = None
    if args.lore and args.lore.exists():
        print(f"\n[입력] Lore 파일: {args.lore}")
        music, story_seed, visual_hints = load_lore_as_music_metadata(args.lore)
    else:
        print("\n[입력] 샘플 데이터 사용")
        music, story_seed = create_sample_music()

    print(f"  Title: {music.title}")
    print(f"  Artist: {music.artist}")
    print(f"  BPM: {music.bpm} ({music.get_tempo_category()})")
    print(f"  Mood: {music.mood_tags}")
    print(f"  Sections: {len(music.sections)}개")
    if story_seed:
        print(f"  Story Seed:\n{story_seed[:200]}...")

    # 2. AVA 파이프라인 실행
    print("\n" + "=" * 70)
    print("[AVA] Music → Anchor → Expression → SceneArchitectInput")
    print("=" * 70)

    knowledge_db_path = Path("databases/knowledge")
    adapter = MusicToVideoAdapter.from_yaml_db(knowledge_db_path)

    # 중간 결과 확인
    anchor = adapter.get_anchor(music)
    print(f"\n[Anchor]")
    print(f"  Theme: {anchor.narrative.theme}")
    print(f"  Arc: {anchor.narrative.arc}")
    print(f"  Primary Mood: {anchor.emotion.primary_mood}")
    print(f"  Tempo: {anchor.structure.tempo}")

    expression = adapter.get_expression(music)
    print(f"\n[Expression]")
    print(f"  Location: {expression.world.location}")
    print(f"  Time: {expression.world.time_of_day}")
    print(f"  Atmosphere: {expression.world.atmosphere}")
    print(f"  Movement: {expression.actor.movement_quality}")
    print(f"  Rendering: {expression.style.rendering_style}")
    print(f"  Camera: {expression.style.camera_language}")

    # 최종 SceneArchitectInput
    scene_input = adapter.execute(music, story_seed=story_seed)

    print(f"\n[SceneArchitectInput]")
    print(f"  Genre: {scene_input.genre}")
    print(f"  Duration: {scene_input.target_duration_minutes * 60:.0f}초")
    print(f"  Story ({len(scene_input.story)}자):")
    print(f"    {scene_input.story[:300]}...")

    # AVA만 실행하는 경우 여기서 종료
    if not args.run_l1 and not args.generate_video:
        print("\n" + "=" * 70)
        print("완료 (AVA 변환만)")
        print("=" * 70)
        return

    # 3. 설정 로드 및 출력 디렉토리 생성
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

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_dir = Path(f"output/{timestamp}")
    output_dir.mkdir(parents=True, exist_ok=True)

    llm = GeminiLLMGateway(key_pool=key_pool, model="gemini-2.0-flash-lite")
    repo = FileAssetRepository(base_dir=output_dir)

    try:
        # =========================================================================
        # L1: Scene Architect
        # =========================================================================
        print("\n" + "=" * 70)
        print("[L1] SceneArchitect")
        print("=" * 70)

        scene_architect = SceneArchitect(llm_gateway=llm, asset_repository=repo)
        l1_output = await scene_architect.execute(scene_input)

        print(f"\n✓ 씬 {len(l1_output.scenes)}개 생성")
        for scene in l1_output.scenes:
            print(f"  [{scene.id}] {scene.scene_type.value} | {scene.duration.seconds}초")

        # L1만 실행하는 경우 여기서 종료
        if not args.generate_video:
            result_path = output_dir / "l1_result.json"
            result_path.write_text(json.dumps({
                "scenes": [
                    {"id": s.id, "type": s.scene_type.value, "duration": s.duration.seconds, "narrative": s.narrative_summary}
                    for s in l1_output.scenes
                ]
            }, indent=2, ensure_ascii=False))
            print(f"\n✓ 결과 저장: {result_path}")
            print("\n" + "=" * 70)
            print("완료 (L1까지)")
            print("=" * 70)
            return

        # =========================================================================
        # L2: Shot Composer
        # =========================================================================
        print("\n" + "=" * 70)
        print("[L2] ShotComposer")
        print("=" * 70)

        shot_composer = LLMDirectComposer(llm_gateway=llm, asset_repository=repo)
        l2_input = ShotComposerInput(scenes=l1_output.scenes)
        l2_output = await shot_composer.execute(l2_input)

        all_shots = []
        for scene_id, shots in l2_output.shot_sequences.items():
            for shot in shots:
                all_shots.append(shot)

        print(f"\n✓ 총 {len(all_shots)}개 샷 생성")
        for shot in all_shots[:5]:  # 처음 5개만 표시
            print(f"  [{shot.id}] {shot.shot_type.value} | {shot.duration.seconds}초 | {shot.purpose[:30]}...")
        if len(all_shots) > 5:
            print(f"  ... 외 {len(all_shots) - 5}개")

        # =========================================================================
        # L3: Prompt Builder
        # =========================================================================
        print("\n" + "=" * 70)
        print("[L3] PromptBuilder")
        print("=" * 70)

        prompt_builder = PromptBuilder(asset_repository=repo)

        scene_contexts = {scene.id: scene.narrative_summary for scene in l1_output.scenes}

        # AVA Expression에서 스타일 키워드 추출
        style_keywords = [
            expression.style.rendering_style,
            expression.style.camera_language,
            "Cinematic", "24fps film look",
        ]
        style_keywords = [s for s in style_keywords if s]  # 빈 값 제거

        l3_input = PromptBuilderInput(
            shots=all_shots,
            characters=l1_output.characters,
            scene_contexts=scene_contexts,
            style_keywords=style_keywords,
            negative_prompts=["CGI", "cartoon", "anime", "deformed", "text", "subtitles", "watermark", "chinese text", "letters"],
        )

        l3_output = await prompt_builder.execute(l3_input)

        print(f"\n✓ 총 {len(l3_output.prompts)}개 프롬프트 생성")

        # =========================================================================
        # Veo: Video Generation
        # =========================================================================
        print("\n" + "=" * 70)
        print("[Veo] Video Generation")
        print("=" * 70)

        # 생성할 샷 수 제한
        prompts_to_generate = l3_output.prompts[:args.shots]
        print(f"\n생성할 샷: {len(prompts_to_generate)}개")

        # Veo 생성기 초기화 (첫 번째 키 사용)
        api_key = key_infos[0].key
        veo = VeoVideoGenerator(api_key=api_key, model="veo-3.0-generate-001")

        videos_dir = output_dir / "videos"
        videos_dir.mkdir(exist_ok=True)

        generated_videos = []

        try:
            for i, prompt in enumerate(prompts_to_generate):
                prompt_text = prompt.build()
                print(f"\n[{i+1}/{len(prompts_to_generate)}] {prompt.shot_id}")
                print(f"  Prompt: {prompt_text[:100]}...")

                # 영상 생성 요청
                from usecases.interfaces import VideoRequest
                request = VideoRequest(
                    prompt=prompt_text,
                    duration_seconds=8,
                    aspect_ratio="16:9",
                )

                print("  생성 중...")
                job = await veo.generate(request)
                print(f"  Job ID: {job.job_id[:50]}...")

                # 완료 대기
                completed_job = await veo.wait_for_completion(job.job_id, timeout_seconds=300)

                if completed_job.video_url:
                    # 다운로드
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

        # =========================================================================
        # 결과 저장
        # =========================================================================
        print("\n" + "=" * 70)
        print("결과 저장")
        print("=" * 70)

        result = {
            "timestamp": timestamp,
            "input": {
                "lore": str(args.lore) if args.lore else None,
                "music": {
                    "title": music.title,
                    "bpm": music.bpm,
                    "mood_tags": music.mood_tags,
                },
            },
            "ava": {
                "anchor": {
                    "theme": anchor.narrative.theme,
                    "arc": anchor.narrative.arc,
                    "mood": str(anchor.emotion.primary_mood),
                },
                "expression": {
                    "location": expression.world.location,
                    "atmosphere": expression.world.atmosphere,
                    "rendering": expression.style.rendering_style,
                    "camera": expression.style.camera_language,
                },
            },
            "pipeline": {
                "scenes": len(l1_output.scenes),
                "shots": len(all_shots),
                "prompts": len(l3_output.prompts),
            },
            "videos": generated_videos,
        }

        result_path = output_dir / "pipeline_result.json"
        result_path.write_text(json.dumps(result, indent=2, ensure_ascii=False))
        print(f"\n✓ 결과: {result_path}")
        print(f"✓ 영상: {videos_dir}")

    finally:
        await llm.close()

    print("\n" + "=" * 70)
    print(f"완료! 출력: {output_dir}")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(main())
