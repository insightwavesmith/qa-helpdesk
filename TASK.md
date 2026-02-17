# TASK.md — 뉴스레터 배너키 순서 강제 (핫픽스)
> 2026-02-17 | 동적 row 생성 시 템플릿별 배너키 순서가 AI 생성 순서에 의존하여 규칙 위반

## 목표
- `buildDesignFromSummary`에서 템플릿별 배너키 순서를 하드코딩하여, AI가 어떤 순서로 email_summary를 생성하든 정해진 순서로 정렬
- 3개 템플릿 모두 적용: education(A), webinar/notice(B), case_study(C)

## 레퍼런스
- 기존 Gmail 뉴스레터 (Template B 웨비나): 강의 미리보기 → 핵심 주제 → 이런 분들을 위해 → 웨비나 일정
- BANNER_MAP 키: email-template-utils.ts 상단
- 리뷰 보고서(잘못된 순서 기록됨): mozzi-reports review/2026-02-17-newsletter-template-examples.html

## 현재 코드
```ts
// src/lib/email-template-utils.ts — buildDesignFromSummary() T3 섹션 (약 240행~)
// 현재: parsed.sections 순서 그대로 dynamicRows 생성 → AI 생성 순서에 의존
if (content.email_summary) {
    const parsed = parseSummaryToSections(content.email_summary);
    const dynamicRows: object[] = [];
    for (const section of parsed.sections) {
      dynamicRows.push(...createSectionRows(section));
    }
    // ... headerRows + dynamicRows + footerRows 조합
}
```

```ts
// BANNER_MAP 키 (현재)
const BANNER_MAP: Record<string, string> = {
  "INSIGHT": "banner-insight",
  "INSIGHT 01": "banner-insight-01", "INSIGHT 02": "banner-insight-02", "INSIGHT 03": "banner-insight-03",
  "KEY POINT": "banner-key-point",
  "CHECKLIST": "banner-checklist",
  "강의 미리보기": "banner-preview",
  "핵심 주제": "banner-topics",
  "이런 분들을 위해": "banner-target",
  "웨비나 일정": "banner-schedule",
  "INTERVIEW": "banner-interview",
  "핵심 변화": "banner-change",
  "성과": "banner-results",
};
```

```ts
// validateBannerKeys — 웨비나 기대 키 (현재, 참고용)
const expectedByType: Record<string, string[]> = {
    education: ["INSIGHT", "KEY POINT", "CHECKLIST"],
    webinar: ["웨비나 일정", "INSIGHT", "KEY POINT", "CHECKLIST", "이런 분들을 위해"],
    notice: ["웨비나 일정", "INSIGHT", "KEY POINT", "CHECKLIST", "이런 분들을 위해"],
    case_study: ["성과", "INTERVIEW", "핵심 변화"],
};
```

## 제약
- `parseSummaryToSections`, `createSectionRows`, `createBannerImageRow` 함수는 수정하지 않는다 (정상 동작 중)
- BANNER_MAP 자체는 수정하지 않는다
- `markdownToEmailHtml` 함수는 수정하지 않는다
- 배너키 매칭은 기존 `slugify`처럼 partial match (includes) 기반으로 한다

## 태스크
### T1. 템플릿별 배너키 순서 맵 정의 + 섹션 정렬 로직 → frontend-dev
- 파일: `src/lib/email-template-utils.ts`
- 의존: 없음
- 완료 기준:
  - [ ] `TEMPLATE_KEY_ORDER` 상수 추가 — 3개 템플릿별 배너키 순서 배열:
    ```ts
    // 순서 기준: 기존 Gmail 실제 발송 순서 (강의 미리보기→핵심 주제→이런 분들을 위해→웨비나 일정)
    // AI가 영문 키를 생성할 수 있으므로 Korean+English 모두 포함, 같은 위치에 배치
    const TEMPLATE_KEY_ORDER: Record<string, string[]> = {
      education: ["INSIGHT", "KEY POINT", "CHECKLIST"],
      webinar: ["강의 미리보기", "INSIGHT", "핵심 주제", "KEY POINT", "CHECKLIST", "이런 분들을 위해", "웨비나 일정"],
      notice: ["강의 미리보기", "INSIGHT", "핵심 주제", "KEY POINT", "CHECKLIST", "이런 분들을 위해", "웨비나 일정"],
      case_study: ["성과", "INTERVIEW", "핵심 변화"],
    };
    ```
    - webinar: 강의 미리보기/INSIGHT(앞) → 핵심 주제/KEY POINT(중간) → CHECKLIST → 이런 분들을 위해 → 웨비나 일정(뒤) — 기존 Gmail 순서 기준
    - AI가 "INSIGHT" 생성 시 "강의 미리보기" 위치에, "KEY POINT" 생성 시 "핵심 주제" 위치에 배치
    - ⚠️ 리뷰 지적(R1): AI 프롬프트는 "웨비나 일정→INSIGHT→KEY POINT→CHECKLIST→이런 분들을 위해" 순서로 생성하지만, 이 핫픽스에서 정렬 강제하므로 AI 순서 무시됨
  - [ ] `sortSectionsByTemplate(sections: SummarySection[], contentType: string): SummarySection[]` 함수 추가:
    - TEMPLATE_KEY_ORDER에서 해당 타입의 순서 배열을 가져온다
    - 각 섹션의 key를 순서 배열과 partial match (includes)로 매칭
    - 매칭된 섹션은 정의된 순서대로, 매칭 안 된 섹션은 끝에 원래 순서대로 배치
  - [ ] `buildDesignFromSummary` T3 섹션에서 `parsed.sections`를 `sortSectionsByTemplate`로 정렬 후 dynamicRows 생성:
    ```ts
    const sorted = sortSectionsByTemplate(parsed.sections, content.type ?? "education");
    const dynamicRows: object[] = [];
    for (const section of sorted) {
      dynamicRows.push(...createSectionRows(section));
    }
    ```
  - [ ] export: `sortSectionsByTemplate`을 export (테스트 가능성 확보)

## 엣지 케이스
| 상황 | 기대 동작 |
|------|-----------|
| AI가 "핵심 주제" 대신 "KEY POINT" 생성 | 같은 위치(2번째)에 배치 |
| AI가 "웨비나 일정 안내" (BANNER_MAP: "웨비나 일정") 생성 | partial match로 마지막 위치에 배치 |
| 순서 맵에 없는 배너키 (예: "INSIGHT 01") | 정렬된 섹션 뒤에 원래 순서대로 배치 |
| content.type이 null/undefined | education 순서 기본값 사용 |
| 섹션이 0개 | 빈 배열 반환, 에러 없음 |
| AI가 순서 맵의 일부 키만 생성 | 있는 키만 정의된 순서로, 없는 키는 무시 |

## 리뷰 보고서
- 보고서 파일: mozzi-reports/public/reports/review/2026-02-17-banner-key-order-fix.html
- 리뷰 일시: 2026-02-17 15:11
- 변경 유형: 백엔드 구조
- 피드백 요약:
  - C1(CRITICAL): webinar 순서 맵에 INSIGHT, CHECKLIST 누락 → 반영함 (TEMPLATE_KEY_ORDER에 추가)
  - C1 순서 제안(R1): 웨비나 일정을 맨 앞으로 → 미반영 (Gmail 레퍼런스 기준 웨비나 일정은 마지막)
  - R2: notice를 education과 동일하게 → 미반영 (notice도 webinar와 같은 배너키 사용)
  - R3(권장): partial match 방향 주석 → 반영 예정
  - R4(장기): 3곳 배너키 정의 통합 → 이번 범위 밖, 후속 태스크로
- 반영 여부: C1 핵심 지적(키 누락) 반영, 순서는 Gmail 레퍼런스 기준 유지

## 검증
☐ npm run build 성공
☐ 기존 기능 안 깨짐 (parseSummaryToSections, createSectionRows 미수정)
☐ 웨비나 콘텐츠: 뉴스레터 재생성 → Unlayer에서 배너 순서 확인 (강의 미리보기 or KEY POINT → 이런 분들을 위해 → 웨비나 일정)
☐ 교육 콘텐츠: 뉴스레터 재생성 → INSIGHT → KEY POINT → CHECKLIST 순서
☐ 고객사례 콘텐츠: 뉴스레터 재생성 → 성과 → INTERVIEW → 핵심 변화 순서
