#!/usr/bin/env python3
"""
Knowledge DB 시딩 스크립트.

YAML 파일 → Supabase knowledge_techniques 테이블로 데이터 이관.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv

load_dotenv()

from adapters.knowledge_db import YAMLKnowledgeDB, SupabaseKnowledgeDB


CATEGORIES = ["camera_language", "rendering_style", "shot_grammar"]


def main():
    print("=" * 60)
    print("Knowledge DB Seeding: YAML → Supabase")
    print("=" * 60)

    # 소스: YAML
    yaml_dir = Path(__file__).parent.parent / "databases" / "knowledge"
    yaml_db = YAMLKnowledgeDB(yaml_dir)

    # 타겟: Supabase
    supabase_db = SupabaseKnowledgeDB.from_env()

    total_inserted = 0

    for category in CATEGORIES:
        print(f"\n[{category}]")

        # 기존 데이터 확인
        existing_count = supabase_db.count_by_category(category)
        if existing_count > 0:
            print(f"  이미 {existing_count}개 존재 → 스킵")
            continue

        # YAML에서 로드
        entries = yaml_db.query(category, limit=100)
        print(f"  YAML: {len(entries)}개 로드")

        if not entries:
            print("  데이터 없음 → 스킵")
            continue

        # Supabase에 삽입
        inserted = supabase_db.insert_techniques_batch(category, entries)
        print(f"  Supabase: {len(inserted)}개 삽입 완료")
        total_inserted += len(inserted)

    print("\n" + "=" * 60)
    print(f"완료: 총 {total_inserted}개 삽입")
    print("=" * 60)


if __name__ == "__main__":
    main()
