# 소재 분석 탭 — Design

## 1. 라우팅 + 탭 구조

```
/protractor
├── page.tsx                 (대시보드 — 기존)
├── protractor-tab-nav.tsx   (탭: 대시보드 | 소재 분석 | 경쟁사 분석)  ← 수정
├── competitor/page.tsx      (경쟁사 분석 — 기존)
└── creatives/               ← 신규
    ├── page.tsx             (서버: 인증 + 계정 조회 → 클라이언트)
    └── creative-analysis.tsx (클라이언트: 3개 서브탭 + 전체 UI)
```

## 2. 탭 네비게이션 수정

`protractor-tab-nav.tsx` TABS 배열:
```typescript
const TABS = [
  { label: "대시보드", href: "/protractor" },
  { label: "소재 분석", href: "/protractor/creatives" },
  { label: "경쟁사 분석", href: "/protractor/competitor" },
] as const;
```

## 3. 서버 컴포넌트 (page.tsx)

기존 protractor/page.tsx와 동일 패턴:
- admin → 전체 계정 조회
- student/member → 본인 계정 조회
- 미연결 → 안내 메시지
- `<CreativeAnalysis initialAccounts={accounts} />` 렌더

## 4. 클라이언트 컴포넌트 (creative-analysis.tsx)

### 4-1. 상단 헤더
- ProtractorHeader 재사용 (계정 선택 드롭다운)
- 또는 간단한 계정 선택 + 서브탭

### 4-2. 서브탭 3개
```
[개별 소재] [포트폴리오] [경쟁사 비교]
```
shadcn/ui Tabs 사용 (기존 대시보드와 동일 패턴)

### 4-3. 개별 소재 뷰 (기본 활성, 1순위)

**데이터 조회**:
- `/api/admin/creative-intelligence?account_id=xxx` → L4 점수 목록
- 개별 선택 시 → creative_element_analysis + creative_lp_consistency JOIN

**레이아웃**: 좌측 카드 그리드 + 우측 상세 패널

카드 항목:
- 소재 이미지 (media_url, placeholder if null)
- L4 점수 배지 (80+초록/50-79주황/0-49빨강)
- 카피 2줄, ROAS, CTR
- 정렬: 점수순/ROAS순

상세 패널 (선택 시):
1. 소재 이미지 + 카피
2. L4 5영역 레이더 차트 (Recharts RadarChart)
3. L1 태그 칩 (hook, style, cta, color, human)
4. 벤치마크 비교 (hook별 ROAS 비교 프로그레스 바)
5. LP 일관성 (visual/semantic/cross/total 프로그레스 바)
6. 개선 제안 (L4 suggestions — priority 색상)
7. 성과 지표 (ROAS, CTR, 전환율)

### 4-4. 포트폴리오 뷰

**데이터**: creative-intelligence + creative-benchmark 집계

레이아웃:
- 요약 카드 4개 (평균 점수, 총 소재, 활성 광고, 평균 ROAS)
- 요소 분포 차트 (hook_type별, style별 가로 바)
- 벤치마크 인사이트 (상위 요소 하이라이트)
- L4 점수 분포 히스토그램

### 4-5. 경쟁사 비교 뷰

**데이터**: competitor_ad_cache + creative_element_analysis

레이아웃:
- 안내 배너 (성과 데이터 없음 경고)
- 자사 vs 경쟁사 요소 분포 비교 (bar chart)
- 간접 지표 (게재 기간)

## 5. API 의존성

| API | 용도 | 상태 |
|-----|------|:----:|
| `/api/admin/creative-intelligence?account_id` | L4 점수 목록 | ✅ |
| `/api/admin/creative-benchmark` | L3 벤치마크 | ✅ |
| `/api/admin/creative-lp-consistency?account_id` | LP 일관성 | ✅ |
| `/api/creative/search` | 텍스트 검색 | ✅ |
| `/api/creative/[id]` | 소재 상세 | ✅ |

신규 API는 Phase 2에서 추가 (현재는 기존 API 조합으로 구현).

## 6. 구현 순서

1. protractor-tab-nav.tsx 수정 (탭 추가)
2. creatives/page.tsx 생성 (서버 컴포넌트)
3. creatives/creative-analysis.tsx 생성 (클라이언트 — 3개 서브탭)
4. tsc + lint + build 검증
