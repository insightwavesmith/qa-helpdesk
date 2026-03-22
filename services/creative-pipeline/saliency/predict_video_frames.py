#!/usr/bin/env python3
"""
영상 프레임별 DeepGaze 시선 예측 — 프레임 단위 saliency 분석

영상을 다운로드 → ffmpeg로 1fps 프레임 추출 → DeepGaze 예측 → 프레임별 결과 DB 저장.

Usage: python3 saliency/predict_video_frames.py [--limit N] [--account-id xxx]

출력: stdout에 JSON 결과 1줄 ({"ok": true, "analyzed": N, "errors": N, "skipped": N})
로그: stderr로 출력
"""

import argparse
import io
import json
import os
import subprocess
import sys
import tempfile
import time

# OpenBLAS/MKL 스레드 제한 — Railway 컨테이너 리소스 초과 방지
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
    compute_cta_score,
)


# ━━━ 영상 다운로드 ━━━
def download_video(url: str, dest_path: str) -> bool:
    """Storage URL에서 영상 다운로드."""
    try:
        if url.startswith("http"):
            full_url = url
        else:
            full_url = f"{SB_URL}/storage/v1/object/public/{url}"

        res = requests.get(full_url, timeout=120, stream=True)
        if not res.ok:
            print(f"    영상 다운로드 실패: {res.status_code}", file=sys.stderr)
            return False

        with open(dest_path, "wb") as f:
            for chunk in res.iter_content(chunk_size=8192):
                f.write(chunk)

        return True
    except Exception as e:
        print(f"    영상 다운로드 에러: {e}", file=sys.stderr)
        return False


# ━━━ ffmpeg 프레임 추출 ━━━
def extract_frames(video_path: str, output_dir: str, fps: int = 1) -> list:
    """ffmpeg로 영상에서 프레임을 추출 (기본 1fps)."""
    try:
        output_pattern = os.path.join(output_dir, "frame_%04d.png")
        cmd = [
            "ffmpeg",
            "-i", video_path,
            "-vf", f"fps={fps}",
            "-q:v", "2",
            output_pattern,
            "-y",  # 덮어쓰기
            "-loglevel", "error",
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            print(f"    ffmpeg 에러: {result.stderr[:300]}", file=sys.stderr)
            return []

        # 추출된 프레임 파일 목록
        frames = sorted([
            os.path.join(output_dir, f)
            for f in os.listdir(output_dir)
            if f.startswith("frame_") and f.endswith(".png")
        ])

        return frames
    except subprocess.TimeoutExpired:
        print("    ffmpeg 타임아웃 (120초)", file=sys.stderr)
        return []
    except FileNotFoundError:
        print("    ffmpeg가 설치되지 않음", file=sys.stderr)
        return []
    except Exception as e:
        print(f"    프레임 추출 에러: {e}", file=sys.stderr)
        return []


# ━━━ 영상 길이 (초) 추출 ━━━
def get_video_duration(video_path: str) -> float:
    """ffprobe로 영상 길이 확인."""
    try:
        cmd = [
            "ffprobe",
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            video_path,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode == 0 and result.stdout.strip():
            return float(result.stdout.strip())
    except Exception:
        pass
    return 0.0


# ━━━ 프레임별 saliency 분석 ━━━
def analyze_frame(frame_path: str, frame_idx: int, total_frames: int):
    """단일 프레임에 대한 saliency 분석."""
    img = Image.open(frame_path)
    saliency = predict_saliency(img)

    # fixation 추출
    fixations = extract_fixations(saliency, top_k=3)

    # 인지 부하
    cog_load = compute_cognitive_load(saliency)

    # 이미지 전체 대비 attention 분포 (상/중/하 3등분)
    h, w = saliency.shape
    prob = np.exp(saliency)
    total = prob.sum()

    top_region = float(prob[:int(h * 0.33), :].sum() / total) if total > 0 else 0
    mid_region = float(prob[int(h * 0.33):int(h * 0.66), :].sum() / total) if total > 0 else 0
    bot_region = float(prob[int(h * 0.66):, :].sum() / total) if total > 0 else 0

    # CTA 주목도 (하단 20%)
    cta_score = compute_cta_score(saliency, "bottom")

    return {
        "frame_index": frame_idx,
        "timestamp_sec": frame_idx,  # 1fps이므로 index = 초
        "fixations": fixations,
        "cognitive_load": cog_load,
        "attention_distribution": {
            "top": round(top_region, 3),
            "middle": round(mid_region, 3),
            "bottom": round(bot_region, 3),
        },
        "cta_attention": cta_score,
    }


# ━━━ 프레임별 결과를 종합 ━━━
def summarize_video_analysis(frame_results: list, duration: float):
    """프레임별 결과를 종합 요약."""
    if not frame_results:
        return {}

    # 인지 부하 분포
    load_counts = {"low": 0, "medium": 0, "high": 0}
    for fr in frame_results:
        load = fr.get("cognitive_load", "medium")
        load_counts[load] = load_counts.get(load, 0) + 1

    total = len(frame_results)
    dominant_load = max(load_counts, key=load_counts.get)

    # attention 이동 패턴 (시간에 따른 주목 영역 변화)
    attention_timeline = []
    for fr in frame_results:
        dist = fr.get("attention_distribution", {})
        dominant_region = max(dist, key=dist.get) if dist else "unknown"
        attention_timeline.append({
            "sec": fr["timestamp_sec"],
            "dominant_region": dominant_region,
        })

    # CTA 주목도 평균 (하단 CTA가 보이는 프레임만)
    cta_scores = [fr["cta_attention"] for fr in frame_results if fr.get("cta_attention") is not None]
    avg_cta = round(sum(cta_scores) / len(cta_scores), 3) if cta_scores else None

    # 주목 전환 횟수 (dominant_region 변경 횟수)
    transitions = 0
    for i in range(1, len(attention_timeline)):
        if attention_timeline[i]["dominant_region"] != attention_timeline[i - 1]["dominant_region"]:
            transitions += 1

    return {
        "total_frames": total,
        "duration_sec": round(duration, 1),
        "dominant_cognitive_load": dominant_load,
        "cognitive_load_distribution": load_counts,
        "avg_cta_attention": avg_cta,
        "attention_transitions": transitions,
        "attention_timeline": attention_timeline,
    }


# ━━━ DB 저장 (creative_saliency) ━━━
def save_frame_result(ad_id: str, account_id: str, frame_result: dict, heatmap_url: str):
    """프레임별 결과를 creative_saliency 테이블에 저장."""
    frame_idx = frame_result["frame_index"]

    row = {
        "ad_id": f"{ad_id}__frame_{frame_idx:04d}",
        "account_id": account_id,
        "target_type": "video_frame",
        "top_fixations": frame_result.get("fixations"),
        "cta_attention_score": frame_result.get("cta_attention"),
        "cognitive_load": frame_result.get("cognitive_load"),
        "attention_map_url": heatmap_url,
        "model_version": "deepgaze-iie",
    }

    url = f"{SB_URL}/rest/v1/creative_saliency?on_conflict=ad_id"
    headers = {
        **HEADERS,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    res = requests.post(url, headers=headers, json=row, timeout=30)
    return res.ok, res.status_code


def save_video_summary(ad_id: str, account_id: str, summary: dict, frame_results: list):
    """영상 전체 요약을 creative_saliency에 저장 (target_type='video')."""
    row = {
        "ad_id": ad_id,
        "account_id": account_id,
        "target_type": "video",
        "top_fixations": None,
        "cta_attention_score": summary.get("avg_cta_attention"),
        "cognitive_load": summary.get("dominant_cognitive_load"),
        "model_version": "deepgaze-iie",
    }

    url = f"{SB_URL}/rest/v1/creative_saliency?on_conflict=ad_id"
    headers = {
        **HEADERS,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    res = requests.post(url, headers=headers, json=row, timeout=30)
    return res.ok, res.status_code


# ━━━ 메인 ━━━
def main():
    parser = argparse.ArgumentParser(description="영상 프레임별 DeepGaze 시선 예측")
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--account-id", type=str, default=None)
    parser.add_argument("--max-frames", type=int, default=30,
                        help="영상 당 최대 분석 프레임 수 (기본 30)")
    args = parser.parse_args()

    print("영상 프레임별 시선 예측 시작 (DeepGaze IIE)", file=sys.stderr)
    print(f"  limit: {args.limit}, account-id: {args.account_id or '전체'}, max-frames: {args.max_frames}", file=sys.stderr)

    # ffmpeg 설치 확인
    try:
        subprocess.run(["ffmpeg", "-version"], capture_output=True, timeout=5)
    except FileNotFoundError:
        print("ERROR: ffmpeg가 설치되지 않음", file=sys.stderr)
        print(json.dumps({"ok": False, "error": "ffmpeg not installed", "analyzed": 0, "errors": 1, "skipped": 0}))
        return

    # 이미 분석된 VIDEO ad_id 조회
    existing_set = set()
    try:
        offset = 0
        PAGE = 1000
        while True:
            batch = sb_get(f"/creative_saliency?select=ad_id&target_type=eq.video&limit={PAGE}&offset={offset}")
            if not batch:
                break
            existing_set.update(r["ad_id"] for r in batch)
            if len(batch) < PAGE:
                break
            offset += PAGE
    except Exception as e:
        print(f"  기존 분석 조회 실패 (무시): {e}", file=sys.stderr)

    skipped = len(existing_set)
    print(f"  기존 영상 분석: {skipped}건 (스킵 예정)", file=sys.stderr)

    # 대상 소재 조회 (VIDEO만, media_url 있는 것)
    all_creatives = []
    PAGE_SIZE = 1000
    offset = 0
    while True:
        q = (
            "/ad_creative_embeddings?"
            "select=ad_id,account_id,media_url,media_type"
            "&media_url=not.is.null"
            "&media_type=eq.VIDEO"
            "&order=ad_id"
            f"&limit={PAGE_SIZE}"
            f"&offset={offset}"
        )
        if args.account_id:
            q += f"&account_id=eq.{args.account_id}"
        batch = sb_get(q)
        if not batch:
            break
        all_creatives.extend(batch)
        if len(batch) < PAGE_SIZE:
            break
        offset += PAGE_SIZE

    print(f"  전체 VIDEO 소재: {len(all_creatives)}건", file=sys.stderr)

    if not all_creatives:
        print("처리할 영상 소재 없음", file=sys.stderr)
        print(json.dumps({"ok": True, "analyzed": 0, "errors": 0, "skipped": 0}))
        return

    to_analyze = [c for c in all_creatives if c["ad_id"] not in existing_set]
    print(f"  신규 처리 대상: {len(to_analyze)}건", file=sys.stderr)

    if not to_analyze:
        print("모든 영상 소재 이미 분석 완료", file=sys.stderr)
        print(json.dumps({"ok": True, "analyzed": 0, "errors": 0, "skipped": skipped}))
        return

    # 라운드당 최대 처리 건수
    to_analyze = to_analyze[:args.limit]
    print(f"  이번 라운드 처리: {len(to_analyze)}건", file=sys.stderr)

    # 모델 사전 로드
    from predict import get_model
    get_model()

    analyzed = 0
    errors = 0

    for i, creative in enumerate(to_analyze):
        ad_id = creative["ad_id"]
        account_id = creative.get("account_id")
        print(f"\n[{i + 1}/{len(to_analyze)}] {ad_id}", file=sys.stderr)

        with tempfile.TemporaryDirectory() as tmpdir:
            video_path = os.path.join(tmpdir, "video.mp4")
            frames_dir = os.path.join(tmpdir, "frames")
            os.makedirs(frames_dir, exist_ok=True)

            # 1. 영상 다운로드
            print(f"  다운로드 중...", file=sys.stderr)
            if not download_video(creative["media_url"], video_path):
                errors += 1
                continue

            # 2. 영상 길이 확인
            duration = get_video_duration(video_path)
            print(f"  영상 길이: {duration:.1f}초", file=sys.stderr)

            # 3. 프레임 추출 (1fps)
            print(f"  프레임 추출 중 (1fps)...", file=sys.stderr)
            frame_paths = extract_frames(video_path, frames_dir, fps=1)
            if not frame_paths:
                print(f"  프레임 추출 실패", file=sys.stderr)
                errors += 1
                continue

            # 최대 프레임 수 제한
            if len(frame_paths) > args.max_frames:
                print(f"  프레임 {len(frame_paths)}개 중 {args.max_frames}개만 분석", file=sys.stderr)
                frame_paths = frame_paths[:args.max_frames]

            print(f"  {len(frame_paths)}개 프레임 분석 시작", file=sys.stderr)

            # 4. 프레임별 saliency 분석
            frame_results = []
            frame_errors = 0

            for fi, fp in enumerate(frame_paths):
                try:
                    t0 = time.time()
                    fr = analyze_frame(fp, fi, len(frame_paths))
                    elapsed = time.time() - t0

                    # 히트맵 생성 + 업로드 (매 5번째 프레임만 — 스토리지 절약)
                    heatmap_url = None
                    if fi % 5 == 0:
                        img = Image.open(fp)
                        saliency = predict_saliency(img)
                        heatmap_bytes = create_heatmap(img, saliency)
                        storage_path = f"video-saliency/{ad_id}/frame_{fi:04d}.png"
                        heatmap_url = sb_storage_upload("creatives", storage_path, heatmap_bytes)

                    # 프레임 결과 DB 저장
                    ok, status = save_frame_result(ad_id, account_id, fr, heatmap_url)
                    if not ok:
                        print(f"    프레임 {fi} DB 저장 실패: {status}", file=sys.stderr)
                        frame_errors += 1

                    frame_results.append(fr)

                    if (fi + 1) % 5 == 0 or fi == len(frame_paths) - 1:
                        print(f"    프레임 {fi + 1}/{len(frame_paths)} 완료 ({elapsed:.1f}s)", file=sys.stderr)

                except Exception as e:
                    print(f"    프레임 {fi} 분석 에러: {e}", file=sys.stderr)
                    frame_errors += 1

            if not frame_results:
                print(f"  모든 프레임 분석 실패", file=sys.stderr)
                errors += 1
                continue

            # 5. 영상 전체 요약
            summary = summarize_video_analysis(frame_results, duration)
            print(
                f"  요약: {summary.get('total_frames', 0)}프레임, "
                f"load={summary.get('dominant_cognitive_load', '?')}, "
                f"cta={summary.get('avg_cta_attention', '?')}, "
                f"transitions={summary.get('attention_transitions', 0)}",
                file=sys.stderr,
            )

            # 6. 요약 결과 DB 저장
            ok, status = save_video_summary(ad_id, account_id, summary, frame_results)
            if ok:
                analyzed += 1
            else:
                print(f"  영상 요약 DB 저장 실패: {status}", file=sys.stderr)
                errors += 1

    # 결과 출력
    print(f"\n━━━ 영상 프레임 분석 결과 ━━━", file=sys.stderr)
    print(f"총 대상: {len(all_creatives)}건", file=sys.stderr)
    print(f"스킵(기존): {skipped}건", file=sys.stderr)
    print(f"분석 완료: {analyzed}건", file=sys.stderr)
    print(f"에러: {errors}건", file=sys.stderr)

    # stdout에 결과 JSON 출력 (server.js가 파싱)
    print(json.dumps({"ok": True, "analyzed": analyzed, "errors": errors, "skipped": skipped}))


if __name__ == "__main__":
    main()
