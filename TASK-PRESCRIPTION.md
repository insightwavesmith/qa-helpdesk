# TASK: 처방 시스템 구현 (2축 합산)

CLAUDE.md 읽고 delegate 모드로 팀원 만들어서 진행해라.

## 개요
소재 분석 5축 결과를 기반으로 "뭘 바꿔야 하는지" 처방을 자동 생성하는 시스템.
처방 = 축1(레퍼런스 원론) + 축2(실데이터 패턴) 합산.

## TASK 1: prescription_patterns 테이블 생성
```sql
CREATE TABLE prescription_patterns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  attribute TEXT NOT NULL,        -- 'hook_type', 'emotion', 'urgency' 등
  value TEXT NOT NULL,            -- 'problem', 'curiosity', 'timer' 등
  metric TEXT NOT NULL,           -- 'video_p3s_rate', 'ctr', 'engagement_per_10k' 등
  avg_value NUMERIC,
  median_value NUMERIC,
  sample_count INTEGER,
  confidence TEXT,                -- 'high', 'medium', 'low'
  lift_vs_average NUMERIC,       -- 전체 평균 대비 lift%
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  category TEXT                   -- 'beauty', 'fashion' 등 (카테고리별)
);
```
Cloud SQL에 생성해라 (GCP 이관된 DB).

## TASK 2: 패턴 추출 스크립트
scripts/extract-prescription-patterns.mjs 생성:
1. creative_media.analysis_json의 각 5축 속성값 추출
2. daily_ad_insights와 JOIN해서 속성별 성과 평균/중위값/샘플수 계산
3. 신뢰도 판정 (N>=30 높음, N>=10 보통, N<10 낮음)
4. lift% 계산 (전체 평균 대비)
5. prescription_patterns 테이블에 upsert
6. 카테고리별 분리 (creative.category 기준)

## TASK 3: 프롬프트 수정 (analyze-five-axis.mjs)
VIDEO_PROMPT_V3 / IMAGE_PROMPT_V3에 추가:

1. 처방 가이드 (축1) 고정 삽입 — plans/prescription-prompt-guide.md 핵심 규칙
2. prescription_patterns 데이터 (축2) 동적 삽입 — 이 소재 속성값에 해당하는 패턴
3. 벤치마크 유사소재 Top3 5축 + 성과 동적 삽입 — 임베딩 코사인 유사도
4. 씬별 분석 추가:
   - 각 씬마다: 봤다/들었다/느꼈다
   - 텍스트: 자막 원문 + 위치 + 폰트색상 + 세이프티존 체크
   - 오디오: 씬별 나레이션 톤 변화 + BGM 전환
   - 처방: 여정 단계 태그 + 구체적 액션 + 근거(축1+축2) + 난이도
5. 처방 우선순위 Top 3 출력
6. 절대 금지 규칙: CTA 버튼 추가 처방 금지, 세이프티존 밖 배치 금지 등

## TASK 4: 패턴 추출 크론
- 주 1회 (화요일, collect-benchmarks 후)
- extract-prescription-patterns.mjs 실행
- Cloud Scheduler에 등록

## 우선순위
GCP 이관 완료 후 → TASK 1 → TASK 2 → TASK 3 → TASK 4 순서.
TASK 2는 5축 배치 전체 완료 후 의미 있음. TASK 3은 축1만으로도 먼저 가능.

## 참고 파일
- plans/prescription-prompt-guide.md — 축1 가이드 (프롬프트 삽입용)
- plans/meta-ad-prescription-guide.md — 메타 플랫폼 가이드
- plans/axis2-real-data-architecture.md — 축2 아키텍처 상세
