#!/usr/bin/env python3
"""
VIDEO 전체 수집 (3단계 전략)

Phase 1: VIDEO 352건 → story_video_id 방식 다운로드
Phase 2: 67계정 advideos 전체 GCS 업로드 (DB 매칭 여부 무관)
Phase 3: IMAGE 카탈로그 243건 → Phase 2 결과와 매칭 후 VIDEO 전환

토큰 권한 제약:
- /{video_id}?fields=source: code 10 에러 (System User 토큰, pages 권한 없음)
- advideos?fields=source: 정상 동작
- object_story_spec.video_data.video_id (story_video_id): 정상 동작

Usage:
  python3 scripts/download-all-videos.py
  python3 scripts/download-all-videos.py --phase 1
  python3 scripts/download-all-videos.py --phase 2
  python3 scripts/download-all-videos.py --phase 3
  python3 scripts/download-all-videos.py --dry-run
"""

import os
import sys
import json
import time
import argparse
import tempfile
import requests
import psycopg2
from google.cloud import storage as gcs_storage

META_TOKEN = os.environ.get("META_ACCESS_TOKEN", "")
DB_URL = os.environ.get("DATABASE_URL", "")
GCS_BUCKET = "bscamp-storage"
META_API_BASE = "https://graph.facebook.com/v21.0"
DOWNLOAD_TIMEOUT = 300
RATE_LIMIT_DELAY = 1.0
RATE_LIMIT_RETRY = 30

parser = argparse.ArgumentParser()
parser.add_argument("--dry-run", action="store_true")
parser.add_argument("--phase", type=int, default=0, help="0=전체, 1/2/3=특정 단계만")
args = parser.parse_args()

# ── 유틸 ──

def meta_get(path, retries=3):
    sep = "&" if "?" in path else "?"
    url = f"{META_API_BASE}{path}{sep}access_token={META_TOKEN}"
    for attempt in range(retries):
        try:
            resp = requests.get(url, timeout=60)
            data = resp.json()
            if "error" in data:
                code = data["error"].get("code", 0)
                if code in (17, 4, 32, 613) and attempt < retries - 1:
                    print(f"  [RateLimit] code={code} — {RATE_LIMIT_RETRY}s 대기", flush=True)
                    time.sleep(RATE_LIMIT_RETRY)
                    continue
                return data
            return data
        except requests.exceptions.RequestException as e:
            if attempt < retries - 1:
                time.sleep(5)
                continue
            return {"error": {"code": -1, "message": str(e)}}
    return {}


def meta_get_paged(initial_path):
    all_data = []
    data = meta_get(initial_path)
    all_data.extend(data.get("data", []))
    next_url = data.get("paging", {}).get("next")
    while next_url:
        try:
            resp = requests.get(next_url, timeout=60)
            nd = resp.json()
            if "error" in nd:
                break
            all_data.extend(nd.get("data", []))
            next_url = nd.get("paging", {}).get("next")
        except:
            break
    return all_data


def download_file(url, dest_path):
    resp = requests.get(url, timeout=DOWNLOAD_TIMEOUT, stream=True)
    resp.raise_for_status()
    with open(dest_path, "wb") as f:
        for chunk in resp.iter_content(chunk_size=65536):
            f.write(chunk)
    return os.path.getsize(dest_path)


def upload_to_gcs(bucket_name, local_path, gcs_path):
    client = gcs_storage.Client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(gcs_path)
    blob.upload_from_filename(local_path, content_type="video/mp4")
    return f"gs://{bucket_name}/{gcs_path}"


def gcs_exists(bucket_name, gcs_path):
    client = gcs_storage.Client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(gcs_path)
    return blob.exists()


# ── Phase 1: VIDEO records via story_video_id ──

def phase1_video_story(conn):
    print("\n" + "="*60, flush=True)
    print("Phase 1: VIDEO 352건 → story_video_id 방식", flush=True)
    print("="*60, flush=True)

    cur = conn.cursor()
    cur.execute("""
        SELECT cm.id as media_id, c.ad_id, c.account_id,
               c.raw_creative->>'video_id' as video_id
        FROM creative_media cm
        JOIN creatives c ON c.id = cm.creative_id
        WHERE cm.media_type = 'VIDEO'
        AND (cm.storage_url IS NULL OR cm.storage_url = '' OR cm.storage_url NOT LIKE 'gs://%%')
        ORDER BY c.account_id, cm.id
    """)
    rows = cur.fetchall()
    cols = [d[0] for d in cur.description]
    items = [dict(zip(cols, r)) for r in rows]
    print(f"  대상: {len(items)}건", flush=True)

    # 계정별 그룹
    groups = {}
    for item in items:
        acct = str(item["account_id"])
        groups.setdefault(acct, []).append(item)

    stats = {"success": 0, "skip": 0, "error": 0}
    total = len(items)
    processed = 0

    for acct_id, acct_items in groups.items():
        print(f"\n  ── 계정 {acct_id} ({len(acct_items)}건) ──", flush=True)

        # ads → story_video_id 매핑
        story_map = {}
        ads = meta_get_paged(f"/act_{acct_id}/ads?fields=id,creative{{object_story_spec}}&limit=100")
        for ad in ads:
            oss = ad.get("creative", {}).get("object_story_spec", {})
            if isinstance(oss, dict):
                vd = oss.get("video_data", {})
                if isinstance(vd, dict) and vd.get("video_id"):
                    story_map[ad["id"]] = str(vd["video_id"])
        print(f"    story 매핑: {len(story_map)}건", flush=True)

        for item in acct_items:
            processed += 1
            media_id = item["media_id"]
            ad_id = item.get("ad_id")
            db_vid = item.get("video_id")
            pfx = f"[P1 {processed}/{total}]"

            if not ad_id:
                print(f"  {pfx} SKIP media={media_id} — ad_id없음", flush=True)
                stats["skip"] += 1
                continue

            story_vid = story_map.get(str(ad_id))
            if not story_vid:
                # 개별 fallback
                d = meta_get(f"/{ad_id}?fields=creative{{object_story_spec}}")
                oss = d.get("creative", {}).get("object_story_spec", {})
                if isinstance(oss, dict):
                    vd = oss.get("video_data", {})
                    if isinstance(vd, dict) and vd.get("video_id"):
                        story_vid = str(vd["video_id"])

            if not story_vid:
                print(f"  {pfx} SKIP media={media_id} — story_video_id없음", flush=True)
                stats["skip"] += 1
                continue

            src_data = meta_get(f"/{story_vid}?fields=source,length")
            source_url = src_data.get("source")
            if not source_url:
                print(f"  {pfx} SKIP media={media_id} story={story_vid} — source없음", flush=True)
                stats["skip"] += 1
                continue

            file_vid = db_vid or story_vid
            gcs_path = f"creatives/{acct_id}/videos/{file_vid}.mp4"

            if args.dry_run:
                print(f"  {pfx} [dry] media={media_id} → gs://{GCS_BUCKET}/{gcs_path}", flush=True)
                stats["success"] += 1
                continue

            tmp = os.path.join(tempfile.gettempdir(), f"v1_{file_vid}.mp4")
            try:
                sz = download_file(source_url, tmp)
                gcs_url = upload_to_gcs(GCS_BUCKET, tmp, gcs_path)
                cur.execute("UPDATE creative_media SET storage_url=%s WHERE id=%s", (gcs_url, media_id))
                conn.commit()
                print(f"  {pfx} OK {file_vid} ({sz/1024/1024:.1f}MB) → {gcs_path}", flush=True)
                stats["success"] += 1
            except Exception as e:
                conn.rollback()
                print(f"  {pfx} ERR {file_vid} — {e}", flush=True)
                stats["error"] += 1
            finally:
                if os.path.exists(tmp):
                    os.remove(tmp)

            if processed % 10 == 0:
                pct = processed / total * 100
                print(f"  --- Phase1 진행: {processed}/{total} ({pct:.0f}%) ---", flush=True)

        time.sleep(RATE_LIMIT_DELAY)

    cur.close()
    print(f"\nPhase1 결과: 성공={stats['success']} 스킵={stats['skip']} 오류={stats['error']}", flush=True)
    return stats


# ── Phase 2: 67계정 advideos 전체 다운로드 ──

def phase2_advideos_all(conn):
    print("\n" + "="*60, flush=True)
    print("Phase 2: 67계정 advideos 전체 수집", flush=True)
    print("="*60, flush=True)

    cur = conn.cursor()
    cur.execute("SELECT DISTINCT account_id FROM creatives ORDER BY account_id")
    accounts = [str(r[0]) for r in cur.fetchall()]
    print(f"  계정 수: {len(accounts)}개", flush=True)

    # DB에서 video_id → media_id 역매핑 (매칭 업데이트용)
    cur.execute("""
        SELECT c.raw_creative->>'video_id' as vid, cm.id as media_id
        FROM creative_media cm
        JOIN creatives c ON c.id = cm.creative_id
        WHERE c.raw_creative->>'video_id' IS NOT NULL
        AND (cm.storage_url IS NULL OR cm.storage_url = '' OR cm.storage_url NOT LIKE 'gs://%%')
    """)
    vid_to_media = {r[0]: r[1] for r in cur.fetchall()}
    print(f"  DB video_id→media_id 역매핑: {len(vid_to_media)}건", flush=True)

    # Phase 2에서 다운로드된 video_id→gcs_url (Phase 3에서 사용)
    downloaded_map = {}  # video_id → gcs_url

    stats = {"success": 0, "skip_exists": 0, "skip_no_src": 0, "error": 0, "total": 0}
    total_advids = 0

    for acct_id in accounts:
        print(f"\n  ── 계정 {acct_id} ──", flush=True)
        try:
            videos = meta_get_paged(f"/act_{acct_id}/advideos?fields=id,title,source&limit=100")
        except Exception as e:
            print(f"    advideos 조회 실패: {e}", flush=True)
            time.sleep(RATE_LIMIT_DELAY)
            continue

        total_advids += len(videos)
        print(f"    advideos: {len(videos)}건", flush=True)
        stats["total"] += len(videos)

        for v in videos:
            vid = v.get("id")
            source_url = v.get("source")
            if not source_url:
                stats["skip_no_src"] += 1
                continue

            gcs_path = f"creatives/{acct_id}/videos/{vid}.mp4"
            gcs_url = f"gs://{GCS_BUCKET}/{gcs_path}"

            if args.dry_run:
                downloaded_map[vid] = gcs_url
                stats["success"] += 1
                continue

            # 이미 GCS에 있으면 스킵
            if gcs_exists(GCS_BUCKET, gcs_path):
                print(f"    EXIST {vid} — 이미 GCS에 있음", flush=True)
                downloaded_map[vid] = gcs_url
                stats["skip_exists"] += 1
                # DB에 매칭되면 업데이트
                if vid in vid_to_media:
                    media_id = vid_to_media[vid]
                    cur.execute("UPDATE creative_media SET storage_url=%s WHERE id=%s AND (storage_url IS NULL OR storage_url NOT LIKE 'gs://%%')", (gcs_url, media_id))
                    conn.commit()
                continue

            tmp = os.path.join(tempfile.gettempdir(), f"v2_{vid}.mp4")
            try:
                sz = download_file(source_url, tmp)
                actual_url = upload_to_gcs(GCS_BUCKET, tmp, gcs_path)
                downloaded_map[vid] = actual_url

                # DB 매칭 업데이트
                if vid in vid_to_media:
                    media_id = vid_to_media[vid]
                    cur.execute("UPDATE creative_media SET storage_url=%s WHERE id=%s", (actual_url, media_id))
                    conn.commit()
                    print(f"    OK+DB {vid} ({sz/1024/1024:.1f}MB)", flush=True)
                else:
                    print(f"    OK {vid} ({sz/1024/1024:.1f}MB) [DB매칭없음]", flush=True)
                stats["success"] += 1
            except Exception as e:
                conn.rollback()
                print(f"    ERR {vid} — {e}", flush=True)
                stats["error"] += 1
            finally:
                if os.path.exists(tmp):
                    os.remove(tmp)

        time.sleep(RATE_LIMIT_DELAY)

    cur.close()
    print(f"\nPhase2 결과: 총={stats['total']} 성공={stats['success']} 기존={stats['skip_exists']} src없음={stats['skip_no_src']} 오류={stats['error']}", flush=True)
    return stats, downloaded_map


# ── Phase 3: IMAGE 카탈로그 → VIDEO 전환 ──

def phase3_catalog_to_video(conn, downloaded_map):
    print("\n" + "="*60, flush=True)
    print("Phase 3: IMAGE 카탈로그 243건 → VIDEO 전환", flush=True)
    print("="*60, flush=True)

    cur = conn.cursor()
    cur.execute("""
        SELECT cm.id as media_id, c.ad_id, c.account_id,
               c.raw_creative->'asset_feed_spec'->'videos' as asset_videos
        FROM creatives c
        JOIN creative_media cm ON cm.creative_id = c.id
        WHERE c.raw_creative->'asset_feed_spec'->'videos' IS NOT NULL
        AND jsonb_array_length(c.raw_creative->'asset_feed_spec'->'videos') > 0
        AND cm.media_type = 'IMAGE'
        AND (cm.storage_url IS NULL OR cm.storage_url = '' OR cm.storage_url NOT LIKE 'gs://%%')
    """)
    rows = cur.fetchall()
    cols = [d[0] for d in cur.description]
    items = [dict(zip(cols, r)) for r in rows]
    print(f"  대상: {len(items)}건", flush=True)

    stats = {"updated": 0, "skip_no_match": 0, "skip_no_gcs": 0}
    total = len(items)

    for i, item in enumerate(items):
        media_id = item["media_id"]
        acct_id = str(item["account_id"])
        raw_av = item.get("asset_videos")

        if raw_av is None:
            stats["skip_no_match"] += 1
            continue

        av = raw_av if isinstance(raw_av, list) else json.loads(raw_av) if isinstance(raw_av, str) else []
        vid_ids = [str(v.get("video_id", "")) for v in av if isinstance(v, dict) and v.get("video_id")]

        # Phase 2에서 다운로드된 video_id와 매칭
        matched_gcs = None
        matched_vid = None
        for vid in vid_ids:
            if vid in downloaded_map:
                matched_gcs = downloaded_map[vid]
                matched_vid = vid
                break

        if not matched_gcs:
            print(f"  [P3 {i+1}/{total}] SKIP media={media_id} — vids={vid_ids[:3]} 매칭없음", flush=True)
            stats["skip_no_match"] += 1
            continue

        if args.dry_run:
            print(f"  [P3 {i+1}/{total}] [dry] media={media_id} vid={matched_vid} → VIDEO + {matched_gcs}", flush=True)
            stats["updated"] += 1
            continue

        try:
            cur.execute("""
                UPDATE creative_media
                SET storage_url = %s, media_type = 'VIDEO'
                WHERE id = %s
            """, (matched_gcs, media_id))
            conn.commit()
            print(f"  [P3 {i+1}/{total}] OK media={media_id} vid={matched_vid} → VIDEO", flush=True)
            stats["updated"] += 1
        except Exception as e:
            conn.rollback()
            print(f"  [P3 {i+1}/{total}] ERR media={media_id} — {e}", flush=True)

    cur.close()
    print(f"\nPhase3 결과: 전환={stats['updated']} 매칭없음={stats['skip_no_match']}", flush=True)
    return stats


# ── main ──

def main():
    if not META_TOKEN:
        print("ERROR: META_ACCESS_TOKEN 환경변수 필요", file=sys.stderr)
        sys.exit(1)
    if not DB_URL:
        print("ERROR: DATABASE_URL 환경변수 필요", file=sys.stderr)
        sys.exit(1)
    print(f"=== VIDEO 전체 수집 시작 ===", flush=True)
    print(f"  dry_run={args.dry_run} phase={args.phase or '전체'}", flush=True)

    conn = psycopg2.connect(DB_URL)
    downloaded_map = {}

    try:
        run_all = args.phase == 0

        if run_all or args.phase == 1:
            phase1_video_story(conn)

        if run_all or args.phase == 2:
            _, downloaded_map = phase2_advideos_all(conn)

        if run_all or args.phase == 3:
            if not downloaded_map and args.phase == 3:
                # Phase 3 단독 실행 시: GCS에서 기존 파일 경로 추정
                print("  Phase 3 단독: downloaded_map 없음 — GCS 기존 파일 기반 매칭 불가", flush=True)
            phase3_catalog_to_video(conn, downloaded_map)

    finally:
        conn.close()

    print(f"\n=== 완료 ===", flush=True)


if __name__ == "__main__":
    main()
