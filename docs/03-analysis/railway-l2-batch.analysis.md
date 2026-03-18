# railway-l2-batch Gap 분석

## Match Rate: 100%

## 분석 일시
2026-03-18

## 설계서 기준
`docs/02-design/features/railway-l2-batch.design.md`

---

## 일치 항목

### 1. 데이터 모델 (creative_saliency 테이블)
- ✅ 기존 테이블 변경 없음 — predict.py가 동일 스키마에 UPSERT

### 2. saliency/predict.py
| 설계 항목 | 구현 | 일치 |
|-----------|------|------|
| .env.local 제거 → 환경변수 직접 사용 | `os.environ.get("NEXT_PUBLIC_SUPABASE_URL")` | ✅ |
| Supabase → REST API | `sb_get()`, `sb_upsert()`, `sb_storage_upload()` 함수 (requests) | ✅ |
| 로그 → stderr | 모든 `print(..., file=sys.stderr)` | ✅ |
| 결과 → stdout JSON | `print(json.dumps({"ok": ..., "analyzed": ..., "errors": ..., "skipped": ...}))` | ✅ |
| CLI: --limit, --account-id | argparse로 구현 | ✅ |
| 모델 캐시 /app/.cache | `WORKDIR /app` 기준으로 동작 | ✅ |

### 3. saliency/requirements.txt
| 설계 항목 | 구현 | 일치 |
|-----------|------|------|
| PyTorch CPU-only 주석 명시 | `# pip install --extra-index-url https://download.pytorch.org/whl/cpu` | ✅ |
| deepgaze_pytorch, clip, scipy, matplotlib, Pillow, numpy, requests, einops | 모두 포함 | ✅ |
| supabase, python-dotenv 제거 | 미포함 | ✅ |

### 4. Dockerfile (multi-stage)
| 설계 항목 | 구현 | 일치 |
|-----------|------|------|
| Stage 1: python:3.11-slim | `FROM python:3.11-slim AS python-deps` | ✅ |
| pip install --target=/deps | `pip install --no-cache-dir --target=/deps` | ✅ |
| Stage 2: node:20-slim | `FROM node:20-slim` | ✅ |
| apt python3 + python3-distutils | `apt-get install -y python3 python3-distutils --no-install-recommends` | ✅ |
| COPY /deps → dist-packages | `COPY --from=python-deps /deps /usr/local/lib/python3.11/dist-packages` | ✅ |
| PYTHONPATH 설정 | `ENV PYTHONPATH=/usr/local/lib/python3.11/dist-packages` | ✅ |
| --extra-index-url CPU wheel | `--extra-index-url https://download.pytorch.org/whl/cpu` | ✅ |

### 5. server.js — POST /saliency
| 설계 항목 | 구현 | 일치 |
|-----------|------|------|
| child_process.execFile 호출 | `const { execFile } = require('child_process')` + `runSaliency()` 헬퍼 | ✅ |
| stdout JSON 파싱 | `stdout.trim().split('\n').pop()` → `JSON.parse()` | ✅ |
| 타임아웃 30분 (1800000ms) | `{ cwd: '/app', timeout: 1800000 }` | ✅ |
| 요청: { limit, accountId } | `const { limit = 9999, accountId = null } = req.body` | ✅ |
| 응답: { ok, analyzed, errors, skipped } | `res.json({ ok: true, ...result })` | ✅ |

### 6. server.js — POST /pipeline L2 추가
| 설계 항목 | 구현 | 일치 |
|-----------|------|------|
| L1 → L2 → L3 → L4 순서 | 코드 순서 일치 | ✅ |
| L2 IMAGE만 대상 (내부 필터링) | predict.py에서 `media_type=eq.IMAGE` 필터 | ✅ |
| L2 실패 시 L3→L4 계속 진행 | `try { saliencyResult = await runSaliency(...) } catch (l2err) { ... }` | ✅ |

---

## 불일치 항목

없음.

---

## 빌드 검증

- `npx tsc --noEmit` → 에러 0개 ✅
- `npm run build` → 성공 ✅
- `node --check services/creative-pipeline/server.js` → OK ✅
- `python3 -m py_compile services/creative-pipeline/saliency/predict.py` → OK ✅

---

## 비고

- Dockerfile의 `python3-distutils` 패키지는 Debian Bookworm (node:20-slim 기반)에서 제공됨
- PyTorch CPU-only wheel은 `torch>=2.0.0` (버전 태그 없이) 명시 — pip가 `--extra-index-url`에서 CPU 빌드 선택
- `/pipeline` 응답에 `saliency: saliencyResult` 필드 추가 (L2 null이면 null 반환)
