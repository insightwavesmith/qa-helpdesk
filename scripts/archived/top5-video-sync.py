#!/usr/bin/env python3
"""
총가치각도기 Top-5 VIDEO 소재 자동 동기화 크론

전략 순서 (계정당 미매칭 VIDEO 광고마다):
  1. story_video_id -> /{id}?fields=source  (advideos 권한 있는 계정)
  2. SearchAPI 텍스트 매칭 -> video_hd_url  (광고 라이브러리 인덱싱 계정)
  3. advideos 전체 수집 + phash 매칭        (최후 수단)

Usage:
  python3 scripts/top5-video-sync.py
  python3 scripts/top5-video-sync.py --dry-run
  python3 scripts/top5-video-sync.py --account 1466150721479287
  python3 scripts/top5-video-sync.py --report-only
"""

import os, sys, json, time, argparse, tempfile, requests, psycopg2

META_TOKEN  = os.environ.get("META_ACCESS_TOKEN", "")
SEARCH_KEY  = os.environ.get("SEARCH_API_KEY", "")
DB_URL      = os.environ.get("DATABASE_URL", "")
GCS_BUCKET  = "bscamp-storage"
META_BASE   = "https://graph.facebook.com/v22.0"
SEARCHAPI   = "https://www.searchapi.io/api/v1/search"
RATE_DELAY  = 0.5
DOWNLOAD_TO = 300
PHASH_THRESH = 18

parser = argparse.ArgumentParser()
parser.add_argument("--dry-run",     action="store_true")
parser.add_argument("--report-only", action="store_true")
parser.add_argument("--account",     help="특정 account_id만 처리")
args = parser.parse_args()


# ── Meta API ──────────────────────────────────────────────

def meta_get(path, retries=3):
    sep = "&" if "?" in path else "?"
    url = f"{META_BASE}{path}{sep}access_token={META_TOKEN}"
    for attempt in range(retries):
        try:
            r = requests.get(url, timeout=60)
            data = r.json()
            if "error" in data:
                code = data["error"].get("code", 0)
                if code in (17, 4, 32, 613) and attempt < retries - 1:
                    print(f"  [RateLimit] code={code} — 30s 대기", flush=True)
                    time.sleep(30)
                    continue
                return data
            return data
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(5)
                continue
            return {"error": {"code": -1, "message": str(e)}}
    return {}


def meta_get_paged(path):
    all_data, data = [], meta_get(path)
    all_data.extend(data.get("data", []))
    next_url = data.get("paging", {}).get("next")
    while next_url:
        try:
            nd = requests.get(next_url, timeout=60).json()
            if "error" in nd:
                break
            all_data.extend(nd.get("data", []))
            next_url = nd.get("paging", {}).get("next")
        except:
            break
    return all_data


# ── SearchAPI ─────────────────────────────────────────────

def searchapi_find_video(body_text):
    query = body_text.strip().split("\n")[0][:60]
    if not query:
        return None
    params = {
        "engine": "meta_ad_library",
        "q": query,
        "country": "KR",
        "ad_active_status": "all",
        "api_key": SEARCH_KEY,
    }
    try:
        r = requests.get(SEARCHAPI, params=params, timeout=30)
        ads = r.json().get("ads", r.json().get("data", []))
        key = query[:20]
        for ad in ads:
            snap = ad.get("snapshot", {})
            snap_body = snap.get("body", "")
            if isinstance(snap_body, dict):
                snap_body = snap_body.get("text", "")
            if key and key in snap_body:
                for vid in snap.get("videos", []):
                    url = vid.get("video_hd_url") or vid.get("video_sd_url")
                    if url:
                        return url
                for card in snap.get("cards", []):
                    url = card.get("video_hd_url") or card.get("video_sd_url")
                    if url:
                        return url
    except Exception as e:
        print(f"  [SearchAPI] {e}", flush=True)
    return None


# ── advideos phash 매칭 ────────────────────────────────────

def phash_match_advideos(acct_id, creative_thumb_url):
    try:
        import imagehash
        from PIL import Image
        from io import BytesIO
    except ImportError:
        return None

    sess = requests.Session()
    sess.headers["User-Agent"] = "Mozilla/5.0"
    try:
        r = sess.get(creative_thumb_url, timeout=15)
        if not r.ok:
            return None
        cr_hash = imagehash.phash(Image.open(BytesIO(r.content)).convert("RGB"), hash_size=8)
    except Exception:
        return None

    videos = meta_get_paged(f"/act_{acct_id}/advideos?fields=id,source,thumbnails{{uri}}&limit=100")
    best_url, best_dist = None, 999
    for v in videos:
        src = v.get("source")
        if not src:
            continue
        thumbs = v.get("thumbnails", {}).get("data", [])
        if not thumbs:
            continue
        try:
            rv = sess.get(thumbs[0]["uri"], timeout=10)
            av_hash = imagehash.phash(Image.open(BytesIO(rv.content)).convert("RGB"), hash_size=8)
            dist = cr_hash - av_hash
            if dist < best_dist:
                best_dist, best_url = dist, src
        except Exception:
            continue

    if best_dist <= PHASH_THRESH:
        print(f"  [phash] dist={best_dist} -> 매칭 성공", flush=True)
        return best_url
    if best_url:
        print(f"  [phash] 최근접 dist={best_dist} (임계값 {PHASH_THRESH} 초과)", flush=True)
    return None


# ── GCS ───────────────────────────────────────────────────

def upload_to_gcs(local_path, gcs_path):
    from google.cloud import storage as gcs
    blob = gcs.Client().bucket(GCS_BUCKET).blob(gcs_path)
    blob.upload_from_filename(local_path, content_type="video/mp4")
    return f"gs://{GCS_BUCKET}/{gcs_path}"


def gcs_exists(gcs_path):
    from google.cloud import storage as gcs
    return gcs.Client().bucket(GCS_BUCKET).blob(gcs_path).exists()


def download_video(url, dest):
    r = requests.get(url, timeout=DOWNLOAD_TO, stream=True)
    r.raise_for_status()
    with open(dest, "wb") as f:
        for chunk in r.iter_content(65536):
            f.write(chunk)
    return os.path.getsize(dest)


# ── 계정 처리 ─────────────────────────────────────────────

def process_account(conn, acct_id, items):
    cur = conn.cursor()
    stats = {"s1": 0, "s2": 0, "s3": 0, "skip": 0, "error": 0}

    # story_video_id 배치 prefetch
    story_map = {}
    try:
        ads = meta_get_paged(f"/act_{acct_id}/ads?fields=id,creative{{object_story_spec}}&limit=100")
        for ad in ads:
            oss = ad.get("creative", {}).get("object_story_spec", {})
            if isinstance(oss, dict):
                vd = oss.get("video_data", {})
                if isinstance(vd, dict) and vd.get("video_id"):
                    story_map[str(ad["id"])] = str(vd["video_id"])
        print(f"  story 매핑: {len(story_map)}건", flush=True)
    except Exception as e:
        print(f"  story 매핑 실패: {e}", flush=True)
    time.sleep(RATE_DELAY)

    for item in items:
        cm_id      = item["cm_id"]
        ad_id      = str(item["ad_id"])
        body       = item.get("body") or ""
        thumb      = item.get("thumb_url") or ""
        rn         = item["rn"]
        prefix     = f"    [rank{rn} {ad_id[:12]}]"
        source_url = None
        strategy   = None

        # S1: story_video_id -> source
        story_vid = story_map.get(ad_id)
        if not story_vid:
            d = meta_get(f"/{ad_id}?fields=creative.fields(object_story_spec)")
            oss = d.get("creative", {}).get("object_story_spec", {})
            if isinstance(oss, dict):
                vd = oss.get("video_data", {})
                if isinstance(vd, dict) and vd.get("video_id"):
                    story_vid = str(vd["video_id"])
        if story_vid:
            src_data = meta_get(f"/{story_vid}?fields=source,length")
            src = src_data.get("source")
            if src and "error" not in src_data:
                source_url, strategy = src, "s1"
                print(f"{prefix} S1 -> story={story_vid}", flush=True)
        time.sleep(RATE_DELAY)

        # S2: SearchAPI 텍스트 매칭
        if not source_url and body:
            url = searchapi_find_video(body)
            if url:
                source_url, strategy = url, "s2"
                print(f"{prefix} S2 -> SearchAPI", flush=True)
            else:
                print(f"{prefix} S2 미매칭", flush=True)

        # S3: advideos phash
        if not source_url and thumb:
            url = phash_match_advideos(acct_id, thumb)
            if url:
                source_url, strategy = url, "s3"
                print(f"{prefix} S3 -> phash", flush=True)
            else:
                print(f"{prefix} S3 미매칭", flush=True)

        if not source_url:
            print(f"{prefix} 전략 모두 실패 -> 스킵", flush=True)
            stats["skip"] += 1
            continue

        gcs_path = f"creatives/{acct_id}/videos/{ad_id}.mp4"

        if args.dry_run:
            print(f"{prefix} [dry] {strategy} -> gs://{GCS_BUCKET}/{gcs_path}", flush=True)
            stats[strategy] += 1
            continue

        if gcs_exists(gcs_path):
            gcs_url = f"gs://{GCS_BUCKET}/{gcs_path}"
            print(f"{prefix} GCS 기존 -> DB만 업데이트", flush=True)
        else:
            tmp = os.path.join(tempfile.gettempdir(), f"top5_{ad_id}.mp4")
            try:
                sz = download_video(source_url, tmp)
                gcs_url = upload_to_gcs(tmp, gcs_path)
                print(f"{prefix} OK {strategy} {sz/1024/1024:.1f}MB", flush=True)
            except Exception as e:
                print(f"{prefix} ERR: {e}", flush=True)
                stats["error"] += 1
                if os.path.exists(tmp):
                    os.remove(tmp)
                continue
            finally:
                if os.path.exists(tmp):
                    os.remove(tmp)

        try:
            cur.execute("UPDATE creative_media SET storage_url=%s WHERE id=%s", (gcs_url, cm_id))
            conn.commit()
            stats[strategy] += 1
        except Exception as e:
            conn.rollback()
            print(f"{prefix} DB 실패: {e}", flush=True)
            stats["error"] += 1

    cur.close()
    return stats


# ── 리포트 ────────────────────────────────────────────────

def print_report(conn):
    cur = conn.cursor()
    cur.execute("""
        WITH ranked AS (
          SELECT c.account_id, aa.account_name, cm.storage_url,
            ROW_NUMBER() OVER (PARTITION BY c.account_id ORDER BY SUM(cp.total_spend) DESC) as rn
          FROM creative_performance cp
          JOIN creatives c ON c.id = cp.creative_id
          JOIN creative_media cm ON cm.creative_id = c.id AND cm.media_type = 'VIDEO'
          LEFT JOIN ad_accounts aa ON aa.account_id = c.account_id
          GROUP BY c.account_id, aa.account_name, c.ad_id, cm.id, cm.storage_url
        )
        SELECT account_id, account_name,
          COUNT(*) FILTER (WHERE rn <= 5) as top5_total,
          COUNT(*) FILTER (WHERE rn <= 5 AND storage_url IS NOT NULL) as matched,
          COUNT(*) FILTER (WHERE rn <= 5 AND storage_url IS NULL) as unmatched
        FROM ranked
        GROUP BY account_id, account_name
        ORDER BY top5_total DESC, unmatched DESC
    """)
    rows = cur.fetchall()
    cur.close()

    total_top5      = sum(r[2] for r in rows)
    total_matched   = sum(r[3] for r in rows)
    total_unmatched = sum(r[4] for r in rows)
    pct = total_matched / total_top5 * 100 if total_top5 else 0

    print("\n" + "="*65)
    print("  총가치각도기 Top-5 VIDEO 매칭 현황")
    print("="*65)
    print(f"  {'계정명':<22} {'계정ID':<18} {'top5':>5} {'매칭':>5} {'미매칭':>6}")
    print("  " + "-"*60)
    for acct_id, name, top5, matched, unmatched in rows:
        name = (name or "")[:20]
        mark = "OK" if unmatched == 0 else "--"
        print(f"  [{mark}] {name:<20} {acct_id:<18} {top5:>5} {matched:>5} {unmatched:>6}")
    print("  " + "-"*60)
    print(f"  {'합계':<42} {total_top5:>5} {total_matched:>5} {total_unmatched:>6}")
    print(f"\n  커버리지: {total_matched}/{total_top5} = {pct:.1f}%")
    print("="*65)


# ── main ──────────────────────────────────────────────────

def main():
    if not META_TOKEN:
        print("ERROR: META_ACCESS_TOKEN 환경변수 필요", file=sys.stderr)
        sys.exit(1)
    if not DB_URL:
        print("ERROR: DATABASE_URL 환경변수 필요", file=sys.stderr)
        sys.exit(1)
    conn = psycopg2.connect(DB_URL)

    if args.report_only:
        print_report(conn)
        conn.close()
        return

    cur = conn.cursor()
    filter_clause = f"AND c.account_id = '{args.account}'" if args.account else ""
    cur.execute(f"""
        WITH ranked AS (
          SELECT c.account_id, aa.account_name, c.ad_id, cm.id as cm_id,
            c.raw_creative->>'body'          as body,
            c.raw_creative->>'thumbnail_url' as thumb_url,
            SUM(cp.total_spend) as spend,
            ROW_NUMBER() OVER (PARTITION BY c.account_id ORDER BY SUM(cp.total_spend) DESC) as rn
          FROM creative_performance cp
          JOIN creatives c ON c.id = cp.creative_id
          JOIN creative_media cm ON cm.creative_id = c.id AND cm.media_type = 'VIDEO'
          LEFT JOIN ad_accounts aa ON aa.account_id = c.account_id
          {filter_clause}
          GROUP BY c.account_id, aa.account_name, c.ad_id, cm.id, cm.storage_url, c.raw_creative
        )
        SELECT account_id, account_name, ad_id, cm_id, body, thumb_url, spend, rn
        FROM ranked
        WHERE rn <= 5 AND storage_url IS NULL
        ORDER BY account_id, rn
    """)
    rows = cur.fetchall()
    cols = [d[0] for d in cur.description]
    items = [dict(zip(cols, r)) for r in rows]
    cur.close()

    if not items:
        print("모든 top-5 VIDEO 매칭 완료.")
        print_report(conn)
        conn.close()
        return

    groups = {}
    for item in items:
        groups.setdefault(str(item["account_id"]), []).append(item)

    print(f"=== Top-5 VIDEO 동기화 === 미매칭 {len(items)}건 / {len(groups)}개 계정  dry={args.dry_run}")

    total = {"s1": 0, "s2": 0, "s3": 0, "skip": 0, "error": 0}
    for acct_id, acct_items in groups.items():
        name = acct_items[0].get("account_name") or acct_id
        print(f"\n[{name}] ({acct_id}) {len(acct_items)}건")
        st = process_account(conn, acct_id, acct_items)
        for k, v in st.items():
            total[k] = total.get(k, 0) + v
        time.sleep(RATE_DELAY)

    print(f"\n완료: S1={total['s1']} S2={total['s2']} S3={total['s3']} "
          f"스킵={total['skip']} 오류={total['error']}")
    print_report(conn)
    conn.close()


if __name__ == "__main__":
    main()
