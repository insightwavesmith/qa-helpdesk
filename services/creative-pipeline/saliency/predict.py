#!/usr/bin/env python3
"""
광고 소재 시선 예측 스크립트 — DeepGaze IIE 기반 (서비스용)

Usage: python3 saliency/predict.py [--limit N] [--account-id xxx]
  --limit N          : 최대 N건 처리 (기본: 9999)
  --account-id xxx   : 특정 광고 계정만 처리

출력: stdout에 JSON 결과 1줄 ({"ok": true, "analyzed": N, "errors": N, "skipped": N})
로그: stderr로 출력
"""

import argparse
import io
import json
import os
import sys
import time

import numpy as np
import requests
import torch
from PIL import Image

# ━━━ 환경변수 (Docker 환경변수 직접 사용) ━━━
SB_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SB_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SB_URL or not SB_KEY:
    print("ERROR: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요", file=sys.stderr)
    sys.exit(1)

HEADERS = {
    "apikey": SB_KEY,
    "Authorization": f"Bearer {SB_KEY}",
}

# ━━━ Supabase REST 헬퍼 ━━━
def sb_get(path: str) -> list:
    res = requests.get(f"{SB_URL}/rest/v1{path}", headers=HEADERS, timeout=30)
    res.raise_for_status()
    return res.json()

def sb_upsert(table: str, row: dict, on_conflict: str = "ad_id"):
    url = f"{SB_URL}/rest/v1/{table}?on_conflict={on_conflict}"
    headers = {
        **HEADERS,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    res = requests.post(url, headers=headers, json=row, timeout=30)
    return res.ok, res.status_code

def sb_storage_upload(bucket: str, path: str, data: bytes, content_type: str = "image/png"):
    """Supabase Storage에 파일 업로드 (upsert)."""
    url = f"{SB_URL}/storage/v1/object/{bucket}/{path}"
    headers = {
        "apikey": SB_KEY,
        "Authorization": f"Bearer {SB_KEY}",
        "Content-Type": content_type,
        "x-upsert": "true",
    }
    res = requests.post(url, headers=headers, data=data, timeout=60)
    if res.ok:
        return f"{SB_URL}/storage/v1/object/public/{bucket}/{path}"
    else:
        print(f"    Storage 업로드 실패: {res.status_code} {res.text[:200]}", file=sys.stderr)
        return None

# ━━━ DeepGaze IIE 모델 로드 ━━━
_model = None
_centerbias = None

def get_model():
    global _model, _centerbias
    if _model is not None:
        return _model, _centerbias

    print("DeepGaze IIE 모델 로딩 중...", file=sys.stderr)
    import deepgaze_pytorch

    DEVICE = torch.device("cpu")
    _model = deepgaze_pytorch.DeepGazeIIE(pretrained=True).to(DEVICE)
    _model.eval()

    # centerbias 템플릿 (표준 가우시안 — 사람은 중앙을 더 많이 봄)
    _centerbias = _make_centerbias(1024, 1024)

    print("모델 로드 완료", file=sys.stderr)
    return _model, _centerbias

def _make_centerbias(h: int, w: int) -> np.ndarray:
    """가우시안 centerbias 생성 (log density)."""
    y = np.linspace(-1, 1, h)
    x = np.linspace(-1, 1, w)
    xx, yy = np.meshgrid(x, y)
    gaussian = np.exp(-(xx**2 + yy**2) / (2 * 0.5**2))
    # log-density (DeepGaze 입력 형식)
    log_density = np.log(gaussian + 1e-10)
    # 정규화: 합이 1이 되도록
    log_density -= np.log(np.exp(log_density).sum())
    return log_density

# ━━━ Saliency 예측 ━━━
def predict_saliency(image: Image.Image) -> np.ndarray:
    """이미지에서 saliency map 예측. shape: (H, W), 값: log-density."""
    model, centerbias = get_model()
    DEVICE = torch.device("cpu")

    # 이미지 전처리
    img = image.convert("RGB")
    orig_w, orig_h = img.size

    # DeepGaze는 큰 이미지에서 느리므로 리사이즈
    MAX_DIM = 768
    scale = min(MAX_DIM / orig_w, MAX_DIM / orig_h, 1.0)
    if scale < 1.0:
        new_w = int(orig_w * scale)
        new_h = int(orig_h * scale)
        img = img.resize((new_w, new_h), Image.LANCZOS)
    else:
        new_w, new_h = orig_w, orig_h

    img_arr = np.array(img).astype(np.float32) / 255.0
    img_tensor = torch.tensor(img_arr).permute(2, 0, 1).unsqueeze(0).to(DEVICE)

    # centerbias 리사이즈
    from scipy.ndimage import zoom
    cb = zoom(centerbias, (new_h / 1024, new_w / 1024), order=1)
    cb_tensor = torch.tensor(cb).unsqueeze(0).float().to(DEVICE)  # [1, H, W]

    with torch.no_grad():
        log_density = model(img_tensor, cb_tensor)

    saliency = log_density.squeeze().cpu().numpy()

    # 원본 크기로 리사이즈
    if scale < 1.0:
        saliency = zoom(saliency, (orig_h / new_h, orig_w / new_w), order=1)

    return saliency

# ━━━ 히트맵 생성 ━━━
def create_heatmap(image: Image.Image, saliency: np.ndarray) -> bytes:
    """원본 이미지 위에 saliency 히트맵을 오버레이."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(1, 1, figsize=(8, 8))
    ax.imshow(image)

    # log-density → probability
    prob = np.exp(saliency)
    prob = prob / prob.max()  # 0~1 정규화

    ax.imshow(prob, cmap="jet", alpha=0.4)
    ax.axis("off")
    plt.tight_layout(pad=0)

    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight", pad_inches=0, dpi=100)
    plt.close(fig)
    buf.seek(0)
    return buf.read()

# ━━━ Top Fixation 추출 ━━━
def extract_fixations(saliency: np.ndarray, top_k: int = 5) -> list:
    """saliency map에서 상위 fixation 좌표 추출."""
    from scipy.ndimage import maximum_filter, label

    prob = np.exp(saliency)
    prob = prob / prob.max()

    # 로컬 최댓값 찾기
    local_max = maximum_filter(prob, size=50)
    peaks = (prob == local_max) & (prob > 0.1)

    labeled, n_features = label(peaks)
    fixations = []

    for i in range(1, n_features + 1):
        ys, xs = np.where(labeled == i)
        cy = int(ys.mean())
        cx = int(xs.mean())
        attention = float(prob[cy, cx])
        fixations.append({"x": cx, "y": cy, "attention_pct": round(attention, 3)})

    # attention 기준 정렬 후 상위 K개
    fixations.sort(key=lambda f: f["attention_pct"], reverse=True)
    fixations = fixations[:top_k]

    # rank 부여
    for rank, f in enumerate(fixations, 1):
        f["rank"] = rank

    return fixations

# ━━━ CTA 주목도 점수 ━━━
def compute_cta_score(saliency: np.ndarray, cta_position) -> float:
    """CTA 영역의 saliency 비율 계산."""
    if not cta_position:
        return None

    h, w = saliency.shape
    prob = np.exp(saliency)
    total = prob.sum()

    if total <= 0:
        return None

    # CTA 위치에 따른 ROI
    if cta_position == "bottom":
        roi = prob[int(h * 0.80):, :]
    elif cta_position == "center":
        y1, y2 = int(h * 0.35), int(h * 0.65)
        x1, x2 = int(w * 0.25), int(w * 0.75)
        roi = prob[y1:y2, x1:x2]
    elif cta_position == "end_frame":
        roi = prob[int(h * 0.85):, :]
    else:
        # 기본: 하단 25%
        roi = prob[int(h * 0.75):, :]

    score = float(roi.sum() / total)
    return round(min(score, 1.0), 3)

# ━━━ Cognitive Load 판정 ━━━
def compute_cognitive_load(saliency: np.ndarray) -> str:
    """saliency 분포의 엔트로피로 인지 부하 판정."""
    prob = np.exp(saliency)
    prob = prob / prob.sum()  # 정규화
    prob = prob.flatten()
    prob = prob[prob > 1e-10]

    entropy = -float(np.sum(prob * np.log2(prob)))

    # 정규화 (이미지 크기에 따른 최대 엔트로피 대비)
    max_entropy = np.log2(len(prob))
    normalized_entropy = entropy / max_entropy if max_entropy > 0 else 0

    if normalized_entropy < 0.6:
        return "low"
    elif normalized_entropy < 0.8:
        return "medium"
    else:
        return "high"

# ━━━ 이미지 다운로드 ━━━
def download_image(url: str):
    try:
        res = requests.get(url, timeout=15)
        if not res.ok:
            print(f"    이미지 다운로드 실패: {res.status_code}", file=sys.stderr)
            return None
        return Image.open(io.BytesIO(res.content))
    except Exception as e:
        print(f"    이미지 다운로드 에러: {e}", file=sys.stderr)
        return None

# ━━━ 메인 ━━━
def main():
    parser = argparse.ArgumentParser(description="광고 소재 시선 예측 (DeepGaze IIE)")
    parser.add_argument("--limit", type=int, default=9999)
    parser.add_argument("--account-id", type=str, default=None)
    args = parser.parse_args()

    print("시선 예측 시작 (DeepGaze IIE)", file=sys.stderr)
    print(f"  limit: {args.limit}, account-id: {args.account_id or '전체'}", file=sys.stderr)

    # 대상 소재 조회 (IMAGE만, media_url 있는 것)
    query = (
        "/ad_creative_embeddings?"
        "select=ad_id,account_id,media_url,media_type"
        "&media_url=not.is.null"
        "&media_type=eq.IMAGE"
        "&order=ad_id"
        f"&limit={args.limit}"
    )
    if args.account_id:
        query += f"&account_id=eq.{args.account_id}"

    creatives = sb_get(query)
    print(f"  대상 소재: {len(creatives)}건", file=sys.stderr)

    if not creatives:
        print("처리할 소재 없음", file=sys.stderr)
        print(json.dumps({"ok": True, "analyzed": 0, "errors": 0, "skipped": 0}))
        return

    # 이미 분석된 ad_id 조회 (전체 조회 — in 필터는 URL 길이 제한에 걸림)
    existing = []
    try:
        existing = sb_get("/creative_saliency?select=ad_id&limit=9999")
    except Exception as e:
        print(f"  기존 분석 조회 실패 (무시): {e}", file=sys.stderr)

    existing_set = set(r["ad_id"] for r in existing)
    to_analyze = [c for c in creatives if c["ad_id"] not in existing_set]
    skipped = len(existing_set)
    print(f"  기존 분석: {skipped}건 스킵, 신규: {len(to_analyze)}건 처리", file=sys.stderr)

    if not to_analyze:
        print("모든 소재 이미 분석 완료", file=sys.stderr)
        print(json.dumps({"ok": True, "analyzed": 0, "errors": 0, "skipped": skipped}))
        return

    # 타임아웃 방지: 한 라운드에 최대 100건 (12s/건 × 100 = ~20분)
    MAX_PER_ROUND = 100
    remaining = len(to_analyze)
    if remaining > MAX_PER_ROUND:
        print(f"  {remaining}건 중 {MAX_PER_ROUND}건만 이번 라운드에서 처리", file=sys.stderr)
        to_analyze = to_analyze[:MAX_PER_ROUND]

    # CTA 위치 정보 조회 (배치 300개씩 — URL 길이 제한 방지)
    cta_map = {}
    try:
        batch_size = 300
        for bi in range(0, len(to_analyze), batch_size):
            batch_ids = ",".join(c["ad_id"] for c in to_analyze[bi:bi + batch_size])
            cea_data = sb_get(
                f"/creative_element_analysis?select=ad_id,cta_position&ad_id=in.({batch_ids})"
            )
            for r in cea_data:
                cta_map[r["ad_id"]] = r.get("cta_position")
    except Exception as e:
        print(f"  CTA 위치 조회 실패 (무시): {e}", file=sys.stderr)

    # 모델 사전 로드
    get_model()

    analyzed = 0
    errors = 0

    for i, creative in enumerate(to_analyze):
        ad_id = creative["ad_id"]
        print(f"[{i+1}/{len(to_analyze)}] {ad_id} — ", end="", flush=True, file=sys.stderr)

        # 이미지 다운로드
        img = download_image(creative["media_url"])
        if img is None:
            errors += 1
            continue

        try:
            # saliency 예측
            t0 = time.time()
            saliency = predict_saliency(img)
            elapsed = time.time() - t0

            # 히트맵 생성
            heatmap_bytes = create_heatmap(img, saliency)

            # Supabase Storage 업로드
            storage_path = f"saliency/{ad_id}.png"
            heatmap_url = sb_storage_upload("creatives", storage_path, heatmap_bytes)

            # fixation 추출
            fixations = extract_fixations(saliency, top_k=5)

            # CTA 주목도
            cta_pos = cta_map.get(ad_id)
            cta_score = compute_cta_score(saliency, cta_pos)

            # cognitive load
            cog_load = compute_cognitive_load(saliency)

            print(
                f"cta_score: {cta_score or '?'}, "
                f"fixations: {len(fixations)}, "
                f"load: {cog_load}, "
                f"{elapsed:.1f}s",
                file=sys.stderr,
            )

            # DB UPSERT
            row = {
                "ad_id": ad_id,
                "account_id": creative.get("account_id"),
                "target_type": "creative",
                "attention_map_url": heatmap_url,
                "top_fixations": fixations,
                "cta_attention_score": cta_score,
                "cognitive_load": cog_load,
                "model_version": "deepgaze-iie",
            }

            ok, status = sb_upsert("creative_saliency", row, "ad_id")
            if ok:
                analyzed += 1
            else:
                print(f"    DB 저장 실패: {status}", file=sys.stderr)
                errors += 1

        except Exception as e:
            print(f"분석 에러: {e}", file=sys.stderr)
            errors += 1

    print(f"\n━━━ 결과 ━━━", file=sys.stderr)
    print(f"총 대상: {len(creatives)}건", file=sys.stderr)
    print(f"스킵(기존): {skipped}건", file=sys.stderr)
    print(f"분석 완료: {analyzed}건", file=sys.stderr)
    print(f"에러: {errors}건", file=sys.stderr)

    # stdout에 결과 JSON 출력 (server.js가 파싱)
    print(json.dumps({"ok": True, "analyzed": analyzed, "errors": errors, "skipped": skipped}))


if __name__ == "__main__":
    main()
