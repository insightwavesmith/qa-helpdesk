# 기획서: 메타 광고 라이브러리 경쟁사 분석기

> 작성: 2026-03-06 | 상태: 초안

## 개요
메타 광고 라이브러리에서 경쟁사 광고를 검색하고, 소재 다운로드 + AI 분석 + 벤치마크 기반 성과 추정까지 제공하는 bscamp 관리자/수강생 도구.

## 핵심 차별점
- **소재 원클릭 다운로드** (메타 광고 라이브러리에 없는 기능)
- **한국 자사몰 특화 벤치마크** 기반 성과 추정 (글로벌 평균이 아닌 실제 데이터)
- **AI 소재 분석** + 자사몰사관학교 강의 맥락 연결

## 경쟁 서비스 분석

| 서비스 | 가격 | 강점 | 약점 |
|--------|------|------|------|
| Foreplay | $49/월 | 스와이프 파일, 팀 협업, 브리프 생성 | 다운로드 약함, 성과 추정 없음 |
| AdSpy | $149/월 | 2억+ DB, 타겟/인구통계 필터, 댓글 분석 | 비쌈, 한국 특화 없음 |
| Minea | $49/월 | 제품 발굴, 인플루언서 추적, 역이미지 검색 | 드롭쉽 편향 |
| BigSpy | $9/월 | 멀티플랫폼, 저렴 | 데이터 정확도 낮음 |
| Panoramata | $89/월 | 풀퍼널(광고→랜딩→이메일), 알림, 트렌드 | 비쌈 |
| Benly | $99/월 | AI 크리에이티브 생성 + 리서치 통합 | 신규 |

**이들의 공통 한계:**
- 한국 시장 특화 벤치마크 없음
- 카테고리별 CPM/성과 추정 불가
- 자사몰 교육 맥락 연결 없음

---

## 기능 상세

### F1. 검색 + 다운로드 (P0)
- Meta Ad Library API 기반 키워드/경쟁사 검색
- 이미지/영상 소재 원클릭 다운로드
- 광고 메타데이터 저장 (문구, CTA, 시작일, 플랫폼)

### F2. AI 카테고리 자동 분류 (P0)
- 광고 소재(이미지+문구) + 광고주 페이지 정보 → AI가 카테고리 판별
- 카테고리: 뷰티, 식품, 패션, 건강기능식품, 가전, 생활용품, 교육, 기타
- 벤치마크 매칭의 전제 조건

### F3. 벤치마크 기반 성과 추정 (P0)
- 카테고리별 CPM 벤치마크 활용 (우리 실데이터)

**추정 로직:**
```
1. 영상 조회수 or engagement → 노출수 추정
   - 영상: 조회수 ÷ 0.4 ≈ 노출수
   - 이미지: (좋아요+댓글+공유) ÷ engagement_rate ≈ 노출수

2. 노출수 → 광고비 추정
   - 광고비 = 노출수 ÷ 1000 × 카테고리별 CPM

3. 광고 기간 → 수익성 판단
   - 7일 미만: 테스트 중
   - 7~30일: 성과 관찰 중
   - 30일+: 수익성 있음 (거의 확실)

4. 벤치마크 대비 평가
   - engagement_per_10k, ctr, video_p3s_rate 등
   - "이 광고는 뷰티 카테고리 ABOVE_AVERAGE 수준"
```

**선행 작업:** benchmarks 테이블에 category 컬럼 추가
```sql
ALTER TABLE benchmarks ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'all';
-- creative_type × ranking_type × ranking_group × category
```

### F4. AI 소재 분석 리포트 (P1)
- 소재 이미지/영상 → AI 분석:
  - 훅 유형 (문제제기/혜택강조/호기심유발/사회적증거)
  - CTA 패턴 (할인/무료배송/한정수량/후기)
  - 레이아웃 (비포애프터/제품중심/UGC/텍스트오버레이)
  - 카피 톤 (감성/논리/긴급)
- 댓글 감성 분석 → 구매 의도 신호 감지 ("어디서 사요?" = 구매 의도 높음)
- 강의 맥락 연결 → "2주차 훅 패턴과 유사"

### F5. 스와이프 파일 (P2)
- 좋은 광고 저장 → 폴더별 정리 (Foreplay 벤치마크)
- 태그 분류 (카테고리/훅유형/소재유형)
- 수강생 간 공유 가능

### F6. 경쟁사 모니터링 알림 (P3)
- 경쟁사 페이지 등록 → 새 광고 감지 시 알림
- "A사가 새 영상 광고 3개 시작 (뷰티, 추정 광고비 ₩150만원~)"
- 장수 광고(30일+) 자동 하이라이트

---

## 기술 아키텍처

```
[수강생/관리자 UI]
    ↓
[bscamp API]
    ├── Meta Ad Library API (공식, 무료)
    │   → 검색 결과 + 소재 URL
    ├── 소재 다운로드 프록시
    │   → Supabase Storage에 저장
    ├── AI 분석 (Sonnet)
    │   → 카테고리 분류 + 소재 분석 + 댓글 감성
    └── 벤치마크 엔진
        → benchmarks 테이블 (category별 CPM/CTR/engagement)
        → 성과 추정 계산
```

**데이터 소스:**
- Meta Ad Library API: 소재, 문구, 시작일, 페이지정보
- Facebook Graph API: engagement (좋아요/댓글/공유)
- 우리 benchmarks: 카테고리별 CPM/CTR/engagement 실데이터

**신규 테이블:**
```sql
-- 저장된 경쟁사 광고
competitor_ads (
  id, meta_ad_id, page_name, category,
  creative_url, ad_copy, cta,
  start_date, platforms,
  likes, comments, shares, video_views,
  estimated_impressions, estimated_spend,
  ai_analysis JSONB,
  saved_by, folder_id,
  created_at
)

-- 모니터링 대상 페이지
monitored_pages (
  id, page_id, page_name, category,
  check_interval, last_checked,
  created_by
)
```

---

## 우선순위

| Phase | 기능 | 기간 | 선행 작업 |
|-------|------|------|----------|
| **P0** | 검색 + 다운로드 + 카테고리 분류 + 성과 추정 | 2주 | benchmarks category 추가 |
| **P1** | AI 소재 분석 리포트 | 1주 | P0 |
| **P2** | 스와이프 파일 (저장/정리/공유) | 1주 | P0 |
| **P3** | 경쟁사 모니터링 알림 | 3일 | P0 |

---

## 리스크

1. **Meta API rate limit** — 검색 횟수 제한 있음, 캐싱 필요
2. **engagement 크롤링** — 공개 데이터지만 대량 수집 시 차단 가능, 점진적 수집
3. **카테고리 분류 정확도** — AI 판별 80~90% 수준, 수동 보정 UI 필요
4. **CPM 추정 오차** — ±30~50%, "추정치" 명시 필수

## 다음 단계
1. Smith님 리뷰 → 방향 확정
2. benchmarks 테이블 category 확장
3. Meta Ad Library API 연동 PoC
4. P0 TASK 작성 → SDK 실행
