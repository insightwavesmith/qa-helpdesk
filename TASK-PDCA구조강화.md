# TASK-PDCA구조강화.md — 설계서 갱신 강제 + 아키텍처 문서 정비

> 작성: 모찌 | 2026-02-28 09:12
> 프로젝트: /Users/smith/projects/qa-helpdesk
> 최신 커밋: c97e2e4e
> ⚠️ Plan 인터뷰 스킵: 질문 없이 바로 개발 실행

---

## 타입
인프라 / 프로세스 강화

## 제약
- npm run build 성공 필수
- 기존 hook 스크립트(notify-stop.sh, notify-task.sh) 수정 금지
- .claude/hooks/ 내 기존 파일 삭제 금지

---

## 1. validate-design.sh — 설계서 갱신 강제 hook

### 위치
`.claude/hooks/validate-design.sh`

### 트리거
PreToolUse hook → `git commit` 실행 시 (gap-analysis.sh와 동일 패턴)

### 로직
1. 현재 staged 파일에서 `src/` 하위 변경된 파일 목록 추출
2. 변경된 기능 영역 판별 (protractor, admin, settings 등 — 폴더명 기반)
3. `docs/02-design/features/` 에서 해당 기능의 설계서 존재 확인
4. 설계서가 존재하면: 설계서의 git 수정일이 이번 커밋의 staged 파일보다 오래되었는지 체크
5. 설계서가 staged에 포함되지 않으면 → **경고 + exit 2 차단**:
   ```
   "설계서 갱신 필요: docs/02-design/features/protractor-refactoring.design.md
    src/lib/protractor/ 파일이 변경되었지만 설계서가 업데이트되지 않았습니다.
    설계서를 갱신한 후 다시 커밋하세요."
   ```
6. 설계서가 없는 기능 영역은 패스 (신규 기능은 별도)
7. docs:, chore:, style: 커밋은 패스

### 기능→설계서 매핑 (스크립트 내 정의)
```
src/lib/protractor/     → docs/02-design/features/protractor-refactoring.design.md
src/app/(main)/protractor/ → docs/02-design/features/protractor-refactoring.design.md
src/app/api/cron/       → docs/02-design/features/cron-collection.design.md (없으면 생성)
src/app/(main)/admin/   → docs/02-design/features/admin-panel.design.md (없으면 생성)
src/actions/embed-pipeline → docs/02-design/features/content-pipeline.design.md
```

### settings.local.json 등록
```json
{
  "matcher": "Bash",
  "hooks": [{
    "type": "command",
    "command": "bash /Users/smith/projects/qa-helpdesk/.claude/hooks/validate-design.sh",
    "timeout": 15000
  }]
}
```
기존 PreToolUse Bash hooks 배열에 추가할 것.

---

## 2. protractor-refactoring.design.md 현행화

### 위치
`docs/02-design/features/protractor-refactoring.design.md`

### 요구사항
현재 코드 기준으로 설계서 전면 갱신:

#### 데이터 흐름도
```
[Meta API] → collect-daily → daily_ad_insights (DB)
[Meta API] → collect-benchmarks → benchmarks (DB)
[Mixpanel API] → collect-mixpanel → daily_mixpanel_insights (DB)
[Meta API] → collect-daily(overlap) → daily_overlap_insights (DB)

daily_ad_insights + benchmarks
  → /api/protractor/total-value → computeMetricValues() → calculateT3Score()
  → /api/diagnose → 진단 파트 배열

UI:
  → benchmark-compare.tsx (성과요약 탭)
  → content-ranking.tsx (콘텐츠 탭)
  둘 다 metric-groups.ts 참조
```

#### 지표 정의 (13개) — metric-groups.ts가 single source of truth
```
영상(3): video_p3s_rate, thruplay_rate, retention_rate
참여(5): reactions_per_10k, comments_per_10k, shares_per_10k, saves_per_10k, engagement_per_10k
전환(5): ctr, click_to_checkout_rate, click_to_purchase_rate, checkout_to_purchase_rate, reach_to_purchase_rate
```

#### 각 지표별 명세
- DB 컬럼명
- 한국어 라벨
- 계산식 (분자/분모)
- 벤치마크 그룹 (video/engagement/conversion)
- higher_better (true/false)
- 단위 (%, /만노출, 배수 등)

#### 주의: reach_to_purchase_rate
- 라벨: "노출당구매확률"
- 계산: purchases / impressions × 100 (분모가 reach 아님!)
- DB 컬럼명은 reach_to_purchase_rate 유지 (변경 금지)

#### T3 점수 계산
- computeMetricValues: 기간별 raw 데이터 합산 → 비율 재계산
- calculateT3Score: 지표별 벤치마크 대비 점수 → 가중 평균
- verdict: value >= aboveAvg → 🟢, >= 0.75 → 🟡, else 🔴

---

## 3. cron-collection.design.md 신규 생성

### 위치
`docs/02-design/features/cron-collection.design.md`

### 내용
- collect-daily: Meta API /ads → 광고별 일일 지표 → daily_ad_insights + overlap → daily_overlap_insights
- collect-benchmarks: Meta API ranking → ABOVE_AVERAGE 그룹 평균 → benchmarks
- collect-mixpanel: Mixpanel Export API → 매출 데이터 → daily_mixpanel_insights
- Vercel cron 스케줄: daily 03:00 UTC, benchmarks 02:00 UTC Mon, mixpanel 03:30 UTC
- 관리자 재수집 API: /api/protractor/collect-daily, collect-mixpanel

---

## 4. CLAUDE.md 업데이트

### 추가 내용
```markdown
## 총가치각도기 (Protractor) 지표 규칙
- **지표 정의 single source of truth**: `src/lib/protractor/metric-groups.ts`
- 지표 추가/수정/삭제 시 이 파일만 수정. 다른 곳에 하드코딩 금지.
- 설계서: `docs/02-design/features/protractor-refactoring.design.md`
- 설계서 갱신 안 하면 commit 차단됨 (validate-design.sh)
```

---

## 검증
1. npm run build 성공
2. validate-design.sh가 settings.local.json에 등록됨
3. protractor-refactoring.design.md가 현재 코드와 일치
4. cron-collection.design.md 신규 생성 확인
5. CLAUDE.md에 지표 규칙 추가 확인
