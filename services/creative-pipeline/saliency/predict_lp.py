#!/usr/bin/env python3
"""
LP 스크린샷 시선 예측 스크립트 — DeepGaze IIE 기반

lp_snapshots에서 스크린샷을 가져와 DeepGaze로 시선 분석 후
lp_analysis.eye_tracking JSONB에 결과 저장.

Usage: python3 saliency/predict_lp.py [--limit N] [--account-id xxx]

출력: stdout에 JSON 결과 1줄 ({"ok": true, "analyzed": N, "errors": N, "skipped": N})
로그: stderr로 출력
"""

import argparse
import io
import json
import os
import sys
import time

# OpenBLAS/MKL 스레드 제한
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("OMP_NUM_THREADS", "1")

import numpy as np
import requests
from PIL import Image

# predict.py에서 공용 함수 임포트
from predict import (
    SB_URL,
    SB_KEY,
    HEADERS,
    sb_get,
    sb_storage_upload,
    predict_saliency,
    create_heatmap,
    extract_fixations,
    compute_cognitive_load,
)

# ━━━ LP 섹션별 Saliency 분석 ━━━
def compute_section_weights(saliency: np.ndarray) -> list:
    """LP 스크린샷을 5등분하여 섹션별 attention weight 계산."""
    h, w = saliency.shape
    prob = np.exp(saliency)
    total = prob.sum()
    if total <= 0:
        return []

    sections = []
    section_names = ["hero", "상단", "중단", "하단", "푸터"]
    num_sections = 5

    for i in range(num_sections):
        y_start = int(h * i / num_sections)
        y_end = int(h * (i + 1) / num_sections)
        section_prob = prob[y_start:y_end, :]
        weight = float(section_prob.sum() / total)
        sections.append({
            "section": section_names[i],
            "y_range": [round(i / num_sections, 2), round((i + 1) / num_sections, 2)],
            "weight": round(weight, 3),
        })

    return sections


def compute_cta_attention(saliency: np.ndarray) -> float:
    """LP 하단 20%의 CTA 영역 attention 비율."""
    h, w = saliency.shape
    prob = np.exp(saliency)
    total = prob.sum()
    if total <= 0:
        return 0.0

    cta_region = prob[int(h * 0.80):, :]
    score = float(cta_region.sum() / total)
    return round(min(score, 1.0), 3)


def compute_fold_attention(saliency: np.ndarray) -> float:
    """Above-the-fold (상위 30%) attention 비율."""
    h, w = saliency.shape
    prob = np.exp(saliency)
    total = prob.sum()
    if total <= 0:
        return 0.0

    fold_region = prob[:int(h * 0.30), :]
    score = float(fold_region.sum() / total)
    return round(min(score, 1.0), 3)


def download_lp_screenshot(screenshot_url: str):
    """Supabase Storage에서 LP 스크린샷 다운로드."""
    try:
        # Storage public URL 조합
        if screenshot_url.startswith("http"):
            url = screenshot_url
        else:
            url = f"{SB_URL}/storage/v1/object/public/{screenshot_url}"

        res = requests.get(url, timeout=30)
        if not res.ok:
            print(f"    LP 스크린샷 다운로드 실패: {res.status_code}", file=sys.stderr)
            return None
        return Image.open(io.BytesIO(res.content))
    except Exception as e:
        print(f"    LP 스크린샷 다운로드 에러: {e}", file=sys.stderr)
        return None


# ━━━ 메인 ━━━
def main():
    parser = argparse.ArgumentParser(description="LP 스크린샷 시선 예측 (DeepGaze IIE)")
    parser.add_argument("--limit", type=int, default=9999)
    parser.add_argument("--account-id", type=str, default=None)
    args = parser.parse_args()

    print("LP 시선 예측 시작 (DeepGaze IIE)", file=sys.stderr)
    print(f"  limit: {args.limit}, account-id: {args.account_id or '전체'}", file=sys.stderr)

    # lp_analysis에서 eye_tracking이 NULL인 항목 조회
    # lp_analysis → lp_id → lp_snapshots.screenshot_url
    all_targets = []
    PAGE_SIZE = 1000
    offset = 0
    while True:
        q = (
            "/lp_analysis?"
            "select=id,lp_id,viewport,analyzed_at"
            "&eye_tracking=is.null"
            "&analyzed_at=not.is.null"
            "&order=lp_id"
            f"&limit={PAGE_SIZE}"
            f"&offset={offset}"
        )
        batch = sb_get(q)
        if not batch:
            break
        all_targets.extend(batch)
        if len(batch) < PAGE_SIZE:
            break
        offset += PAGE_SIZE

    print(f"  eye_tracking NULL인 lp_analysis: {len(all_targets)}건", file=sys.stderr)

    if not all_targets:
        print("처리할 LP 없음", file=sys.stderr)
        print(json.dumps({"ok": True, "analyzed": 0, "errors": 0, "skipped": 0}))
        return

    # lp_id → lp_snapshots에서 screenshot_url 조회
    lp_ids = list(set(t["lp_id"] for t in all_targets))

    # account_id 필터가 있으면 landing_pages 조인 필요
    if args.account_id:
        # landing_pages에서 해당 account의 lp_id만 필터
        lp_filter_ids = set()
        for bi in range(0, len(lp_ids), 300):
            batch_ids = ",".join(lp_ids[bi:bi + 300])
            lp_data = sb_get(
                f"/landing_pages?select=id&account_id=eq.{args.account_id}&id=in.({batch_ids})"
            )
            for r in lp_data:
                lp_filter_ids.add(r["id"])
        all_targets = [t for t in all_targets if t["lp_id"] in lp_filter_ids]
        lp_ids = list(lp_filter_ids)
        print(f"  account-id 필터 후: {len(all_targets)}건", file=sys.stderr)

    # lp_snapshots에서 screenshot_url 매핑
    snapshot_map = {}  # lp_id+viewport → screenshot_url
    for bi in range(0, len(lp_ids), 300):
        batch_ids = ",".join(lp_ids[bi:bi + 300])
        snap_data = sb_get(
            f"/lp_snapshots?select=lp_id,viewport,screenshot_url"
            f"&screenshot_url=not.is.null"
            f"&lp_id=in.({batch_ids})"
        )
        for s in snap_data:
            key = f"{s['lp_id']}|{s.get('viewport', 'mobile')}"
            snapshot_map[key] = s["screenshot_url"]

    print(f"  스크린샷 매핑: {len(snapshot_map)}건", file=sys.stderr)

    # 스크린샷이 있는 항목만 필터
    work_items = []
    skipped = 0
    for t in all_targets:
        key = f"{t['lp_id']}|{t.get('viewport', 'mobile')}"
        if key in snapshot_map:
            t["screenshot_url"] = snapshot_map[key]
            work_items.append(t)
        else:
            skipped += 1

    print(f"  실제 처리 대상: {len(work_items)}건 (스크린샷 없음 스킵: {skipped}건)", file=sys.stderr)

    if not work_items:
        print("스크린샷이 있는 LP 없음", file=sys.stderr)
        print(json.dumps({"ok": True, "analyzed": 0, "errors": 0, "skipped": skipped}))
        return

    # 타임아웃 방지: 라운드당 최대 50건
    MAX_PER_ROUND = min(50, args.limit) if args.limit != 9999 else 50
    if len(work_items) > MAX_PER_ROUND:
        print(f"  {len(work_items)}건 중 {MAX_PER_ROUND}건만 이번 라운드 처리", file=sys.stderr)
        work_items = work_items[:MAX_PER_ROUND]

    # 모델 사전 로드
    from predict import get_model
    get_model()

    analyzed = 0
    errors = 0

    for i, item in enumerate(work_items):
        lp_id = item["lp_id"]
        analysis_id = item["id"]
        viewport = item.get("viewport", "mobile")
        print(f"[{i+1}/{len(work_items)}] lp={lp_id[:8]}... ({viewport}) — ", end="", flush=True, file=sys.stderr)

        # 스크린샷 다운로드
        img = download_lp_screenshot(item["screenshot_url"])
        if img is None:
            errors += 1
            continue

        try:
            t0 = time.time()

            # saliency 예측
            saliency = predict_saliency(img)
            elapsed = time.time() - t0

            # 히트맵 생성 + Storage 업로드
            heatmap_bytes = create_heatmap(img, saliency)
            storage_path = f"lp-saliency/{lp_id}_{viewport}.png"
            heatmap_url = sb_storage_upload("creatives", storage_path, heatmap_bytes)

            # fixation 추출
            fixations = extract_fixations(saliency, top_k=5)

            # 섹션별 weight
            section_weights = compute_section_weights(saliency)

            # CTA/fold attention
            cta_attention = compute_cta_attention(saliency)
            fold_attention = compute_fold_attention(saliency)

            # cognitive load
            cog_load = compute_cognitive_load(saliency)

            print(
                f"fold: {fold_attention}, cta: {cta_attention}, "
                f"load: {cog_load}, {elapsed:.1f}s",
                file=sys.stderr,
            )

            # eye_tracking JSONB 구성
            eye_tracking = {
                "model": "deepgaze-iie",
                "heatmap_url": heatmap_url,
                "sections": section_weights,
                "fixations": fixations,
                "cta_attention": cta_attention,
                "fold_attention": fold_attention,
                "cognitive_load": cog_load,
                "analyzed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }

            # lp_analysis UPDATE (eye_tracking 컬럼)
            url = f"{SB_URL}/rest/v1/lp_analysis?id=eq.{analysis_id}"
            headers = {
                **HEADERS,
                "Content-Type": "application/json",
                "Prefer": "return=minimal",
            }
            res = requests.patch(
                url,
                headers=headers,
                json={"eye_tracking": eye_tracking},
                timeout=30,
            )
            if res.ok:
                analyzed += 1
            else:
                print(f"    DB 업데이트 실패: {res.status_code} {res.text[:200]}", file=sys.stderr)
                errors += 1

        except Exception as e:
            print(f"분석 에러: {e}", file=sys.stderr)
            errors += 1

        # Rate limit
        time.sleep(0.2)

    print(f"\n━━━ LP 시선 분석 결과 ━━━", file=sys.stderr)
    print(f"총 대상: {len(all_targets)}건", file=sys.stderr)
    print(f"스크린샷 없음 스킵: {skipped}건", file=sys.stderr)
    print(f"분석 완료: {analyzed}건", file=sys.stderr)
    print(f"에러: {errors}건", file=sys.stderr)

    print(json.dumps({"ok": True, "analyzed": analyzed, "errors": errors, "skipped": skipped}))


if __name__ == "__main__":
    main()
