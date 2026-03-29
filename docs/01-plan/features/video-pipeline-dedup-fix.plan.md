# Video Pipeline Dedup Fix (영상 파이프라인 수정) Plan

> 작성일: 2026-03-29
> 프로세스 레벨: L2 (src/ + hooks 수정)
> Match Rate 기준: 90%

---

## Executive Summary

| 항목 | 내용 |
|------|------|
| **기능** | 영상 파이프라인 Dedup 통일 + embed-creatives 독립 트리거 + L1 자동 보고 |
| **작성일** | 2026-03-29 |
| **범위** | src/cron 3개 수정 + hooks 2개 수정 + TDD |
| **예상 산출물** | src/ 2~3파일 + hooks 2파일 수정 + TDD 테스트 |

| 관점 | 내용 |
|------|------|
| **Problem** | ① video-saliency 157건 공회전 ② embed-creatives chain 끊김 ③ L1 조사/분석 작업 자동 보고 안 됨 |
| **Solution** | ① Dedup creative_saliency 사전 체크 ② chain 조건 완화 ③ hooks L1 분기 추가 |
| **Core Value** | Cloud Run 비용 절감 + 임베딩 정상화 + 조사/분석 작업 Smith님 자동 보고 |

---

## 1. 문제 분석

### 문제 A: Dedup 기준 불일치 → 157건 공회전

**현재 흐름:**
```
video-saliency cron
  1. creative_media WHERE video_analysis IS NULL → 157건 선택
  2. Cloud Run /video-saliency 호출 (계정별)
  3. Cloud Run → creative_saliency 테이블에 저장 (ad_id UNIQUE)
  4. creative_saliency → creative_media.video_analysis 동기화
```

**공회전 원인:**
- Cloud Run Python이 `creative_saliency`에 이미 저장 완료 (ad_id UNIQUE constraint)
- Step 4 동기화에서 `creative_saliency.target_type='video'` 조회 시 매칭 실패 또는 에러 → `creative_media.video_analysis`가 여전히 NULL
- 다음 cron 실행 시 같은 157건 다시 선택 → Cloud Run에 중복 요청 → 공회전

**근본 원인:**
- Dedup 기준 분리: Cron은 `creative_media.video_analysis` 체크, Cloud Run은 `creative_saliency.ad_id` 체크
- Step 4 동기화 실패해도 exit 0 (에러 무시) → 영구 공회전

**검증 포인트:**
1. `creative_saliency`에 157건 ad_id가 이미 존재하는지 확인
2. `creative_saliency.target_type` 실제 값 확인 ('video' vs 다른 값)
3. Step 4 동기화 로그 에러 확인

### 문제 B: embed-creatives 미실행

**현재 흐름:**
```
process-media (chain=true)
  → uploaded > 0 || processed > 0 ? triggerNext(["embed-creatives", ...]) : 스킵
```

**미실행 원인:**
- 모든 미디어가 content_hash dedup 처리 → `uploaded=0, processed=0`
- dedup은 성공했지만 chain 조건에 미포함 → embed-creatives 트리거 안 됨
- embed-creatives는 독자 로직(Meta API 직접 호출)인데 process-media 결과에 종속

**근본 원인:** chain 조건이 `uploaded || processed`만 체크 → dedup-only에서 chain 끊김

### 문제 C: L1 조사/분석 작업 자동 보고 안 됨

**현재 TaskCompleted hook 체인 (8개):**
```
1. task-completed.sh      — git log 기반 마커 생성 + 알림
2. task-quality-gate.sh   — tsc + build + gap분석 문서 + pdca-status ← L1 차단 지점
3. gap-analysis.sh        — staged 파일 vs TASK.md 대조
4. pdca-update.sh         — pdca-status 갱신
5. pdca-sync-monitor.sh   — 3곳 sync
6. auto-team-cleanup.sh   — 팀원 정리
7. notify-completion.sh   — Slack 알림
8. pdca-chain-handoff.sh  — Match Rate 95% 게이트 + 전송 ← L1 차단 지점
```

**L1 차단 경로 분석:**

| Hook | L1 동작 | 결과 |
|------|--------|------|
| task-quality-gate.sh | gap분석 문서 없음 (`docs/03-analysis/*.analysis.md` 1일 이내 없으면 exit 2) | **차단** |
| pdca-chain-handoff.sh | CTO팀: Match Rate 0% < 95% → exit 2 / PM팀: CTO-only 필터 → exit 0 (보고 안 함) | **차단 또는 무시** |

**근본 원인:**
- `task-quality-gate.sh`: 프로세스 레벨 구분 없이 일괄 tsc+build+gap 강제
- `pdca-chain-handoff.sh`: CTO-only + Match Rate 95% 게이트 → L1 조사/분석은 통과 불가
- 결과: L1 작업 완료 시 `notify-completion.sh`(#7)까지 도달 못함 → Smith님에게 보고 안 됨

---

## 2. 수정 방향

### 수정 A: video-saliency Dedup 통일

**전략: creative_saliency 사전 필터링**

```
[BEFORE]
creative_media WHERE video_analysis IS NULL → 157건 → 전부 Cloud Run

[AFTER]
creative_media WHERE video_analysis IS NULL → 후보
  → creative_saliency에 ad_id 있는 건: Cloud Run 스킵 + 동기화만 재시도
  → creative_saliency에 ad_id 없는 건: Cloud Run 호출
```

**수정 파일:** `src/app/api/cron/video-saliency/route.ts`
- Step 1~2 사이에 creative_saliency 사전 조회 추가
- 이미 있는 건 → 바로 동기화 (Step 4 로직 재사용)
- 없는 건만 Cloud Run 호출

### 수정 B: embed-creatives chain 조건 완화

```
[BEFORE]
isChain && (result.uploaded > 0 || result.processed > 0)

[AFTER]
isChain && (result.uploaded > 0 || result.processed > 0 || result.dedup > 0)
```

**수정 파일:** `src/app/api/cron/process-media/route.ts` (라인 196, 1줄 수정)

### 수정 C: L1 TaskCompleted hook 자동 보고

**전략: 2개 hook에 프로세스 레벨 분기 추가**

#### C-1. task-quality-gate.sh — L0/L1 경량 검증

```
[BEFORE]
모든 레벨: tsc + build + gap분석 + pdca-status (4항목 강제)

[AFTER]
L0: 전부 스킵 (exit 0)
L1: 산출물 존재 확인만 (docs/ 변경 있는지)
L2/L3: 기존대로 (tsc + build + gap분석 + pdca-status)
```

**L1 산출물 검증 로직:**
- `git diff HEAD~1 --name-only` 또는 `find docs/ -mmin -60`로 최근 변경 문서 확인
- docs/ 하위에 1개 이상 파일 변경/생성 있으면 → 산출물 있음 → 통과
- 아무 산출물도 없으면 → "L1 작업이지만 산출물이 없습니다" 경고 (차단은 안 함)

#### C-2. pdca-chain-handoff.sh — L1 보고 경로 추가

```
[BEFORE]
CTO-only → Match Rate 95% 필수 → PM/MOZZI 라우팅

[AFTER]
모든 팀 대상으로 확대 (CTO-only 필터 제거 → 팀 무관)
프로세스 레벨 분기:
  L0/L1: Match Rate 게이트 스킵 → MOZZI 직접 보고 (ANALYSIS_REPORT 타입)
  L2: 기존대로 (Match Rate 95% → PM 또는 MOZZI)
  L3: 기존대로 (Match Rate 95% → PM 수동 필수)
```

**L1 payload 변경:**
```json
{
  "type": "ANALYSIS_REPORT",     // COMPLETION_REPORT 대신
  "to_role": "MOZZI",
  "payload": {
    "deliverables": ["docs/01-plan/...", "docs/03-analysis/..."],
    "process_level": "L1",
    "summary": "조사/분석 완료. 산출물 N건."
  }
}
```

**CTO-only 필터 변경:**
- 기존: `[[ "$TEAM" != CTO* ]] && exit 0` (CTO 아니면 전부 무시)
- 변경: 팀 체크 제거. 모든 팀의 TaskCompleted에서 실행. 팀명은 payload에만 포함.

---

## 3. 범위

### 수정 파일

| 파일 | 수정 내용 | 카테고리 |
|------|----------|---------|
| `src/app/api/cron/video-saliency/route.ts` | creative_saliency 사전 체크 + 동기화 분리 | 문제 A |
| `src/app/api/cron/process-media/route.ts` | chain 조건에 `dedup > 0` 추가 (1줄) | 문제 B |
| `.claude/hooks/task-quality-gate.sh` | L0/L1 경량 검증 분기 추가 | 문제 C |
| `.claude/hooks/pdca-chain-handoff.sh` | CTO-only 제거 + L1 ANALYSIS_REPORT 경로 | 문제 C |

### 건드리지 않는 것
- collect-daily (수집 로직 변경 없음)
- creative-saliency (이미지 saliency 변경 없음)
- Cloud Run Python 서비스 (외부)
- DB 스키마
- embed-creatives (chain 수신만 — 자체 수정 없음)
- settings.local.json hook 배열 (순서/구성 변경 없음)

---

## 4. 성공 기준

### 정량 기준
- [ ] video-saliency cron 실행 시 공회전 0건
- [ ] creative_media.video_analysis NULL + creative_saliency 존재 건 → 동기화 완료
- [ ] process-media dedup-only 실행 후 embed-creatives 트리거 확인
- [ ] L1 작업 TaskCompleted 시 Smith님(MOZZI) 보고 자동 도달
- [ ] L2/L3 기존 동작 변경 없음 (regression 0)

### 테스트 시나리오

#### 문제 A: video-saliency Dedup

| ID | 시나리오 | 기대 결과 |
|----|---------|----------|
| VS-1 | creative_saliency에 이미 ad_id 존재 + target_type=video | Cloud Run 스킵, 동기화만 → video_analysis 채워짐 |
| VS-2 | creative_saliency에 ad_id 없음 | Cloud Run 호출 → creative_saliency 저장 + video_analysis 동기화 |
| VS-3 | creative_saliency에 ad_id 존재 + target_type≠video | 동기화 스킵 → Cloud Run 재호출 |
| VS-4 | creative_saliency 조회 실패 (DB 에러) | 기존 로직 fallback (전체 Cloud Run 호출) |
| VS-5 | 미분석 VIDEO 0건 | "처리 대상 없음" 즉시 반환 |

#### 문제 B: embed-creatives chain

| ID | 시나리오 | 기대 결과 |
|----|---------|----------|
| EC-1 | dedup=5, uploaded=0, processed=0 | embed-creatives chain 트리거 |
| EC-2 | dedup=0, uploaded=0, processed=0 | chain 스킵 (기존 동작) |
| EC-3 | dedup=3, uploaded=2 | chain 트리거 (기존 동작 유지) |

#### 문제 C: L1 자동 보고

| ID | 시나리오 | 기대 결과 |
|----|---------|----------|
| LR-1 | L1 TaskCompleted, task-quality-gate | tsc+build 스킵, 산출물(docs/) 존재 확인만 → 통과 |
| LR-2 | L1 TaskCompleted, task-quality-gate, 산출물 없음 | 경고 출력 + 통과 (차단 안 함) |
| LR-3 | L2 TaskCompleted, task-quality-gate | 기존대로 tsc+build+gap 강제 |
| LR-4 | L1 TaskCompleted, pdca-chain-handoff, CTO팀 | Match Rate 스킵 → MOZZI ANALYSIS_REPORT 전송 |
| LR-5 | L1 TaskCompleted, pdca-chain-handoff, PM팀 | Match Rate 스킵 → MOZZI ANALYSIS_REPORT 전송 |
| LR-6 | L2 TaskCompleted, pdca-chain-handoff, CTO팀 | 기존대로 Match Rate 95% 게이트 → PM/MOZZI |
| LR-7 | L0 TaskCompleted, task-quality-gate | 전부 스킵 → exit 0 |
| LR-8 | L1 TaskCompleted, pdca-chain-handoff, broker 다운 | ACTION_REQUIRED fallback |
| LR-9 | L1 pdca-chain-handoff, ANALYSIS_REPORT payload 검증 | deliverables 배열 + process_level=L1 포함 |
| LR-10 | L3 task-quality-gate | 기존대로 (tsc+build+gap+pdca) |

#### Mock Data
```
fixtures/
  creative_saliency_existing.json  — ad_id + target_type=video 레코드
  creative_saliency_wrong_type.json — ad_id + target_type=image
  process_media_dedup_only.json — dedup=5, uploaded=0
```

---

## 5. 의존성

- TASK 2 (영상 수집 누락 점검) 결과에 따라 수집 누락 발견 시 해당 건 해결 후 Dedup 효과 검증
- Cloud Run Python `creative_saliency.target_type` 값 확인 필요 (DB 직접 조회)
- pdca-chain-handoff.sh 수정은 agent-ops-review-issues의 v2 코드 위에 진행 (기반 유지)

---

## 6. 프로세스 레벨 판단 — 기존 detect-process-level.sh 활용

task-quality-gate.sh와 pdca-chain-handoff.sh에서 `detect-process-level.sh`를 source하여 레벨 판단:

```bash
source "$(dirname "$0")/detect-process-level.sh"
# git diff HEAD~1 기반 판단
CHANGED_FILES=$(git diff HEAD~1 --name-only 2>/dev/null || echo "")
HAS_SRC=$(echo "$CHANGED_FILES" | grep -c "^src/" || true)
if [ "$HAS_SRC" -eq 0 ]; then
    PROCESS_LEVEL="L1"
fi
# (L0/L3 판단은 기존 로직)
```

L1 판단 기준: `git diff HEAD~1`에 `src/` 파일이 없으면 L1.
커밋이 없는 경우 (순수 조사): staged 파일도 없고 최근 커밋도 docs만 → L1.

---

## 7. 참조

### 관련 파일
- `src/app/api/cron/video-saliency/route.ts` — 미분석 조회(라인 65-75), 동기화(라인 196-252)
- `src/app/api/cron/process-media/route.ts` — chain 조건(라인 194-203)
- `src/app/api/cron/embed-creatives/route.ts` — 임베딩 파이프라인
- `.claude/hooks/task-quality-gate.sh` — tsc+build+gap 검증 (프로세스 레벨 미구분)
- `.claude/hooks/pdca-chain-handoff.sh` — v2 (CTO-only + Match Rate 95%)
- `.claude/hooks/detect-process-level.sh` — L0/L1/L2/L3 판단 헬퍼
- `.claude/hooks/notify-completion.sh` — Slack 알림 (#7, L1 차단으로 미도달)
- `src/lib/pipeline-chain.ts` — triggerNext 유틸

### 분석 문서
- `docs/03-analysis/creative-saliency.analysis.md` — DeepGaze 분석 (Match Rate 93%)
- `docs/03-analysis/embed-creatives.analysis.md` — 임베딩 분석 (Match Rate 97%)
