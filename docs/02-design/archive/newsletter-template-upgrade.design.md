# 뉴스레터 템플릿 디자인 고도화 — Design

## 1. 수정 대상 파일
| 파일 | 변경 내용 |
|------|----------|
| `src/lib/email-default-template.ts` | BS_CAMP_TEMPLATE_A/B/C 재구축 |
| `src/lib/email-template-utils.ts` | buildDesignFromSummary() 색상 분기, 새 블록 매핑 |

## 2. Template A 블록 구조 (정보공유형/교육 — #F75D5D)

```
row-header           → content-logo (BS 아이콘 + 브랜드명)
                       content-divider-header (빨간 2px 라인)
row-greeting         → content-greeting (인사말 텍스트) [NEW]
row-title            → content-title (제목 h1) [기존 id 유지]
row-hook-quote       → content-hook-quote (빨간 이탤릭 센터) [기존 id 유지]
row-toc              → content-toc (목차 리스트) [NEW]
row-section-banner   → content-section-banner (빨간 단색 배경 + 흰 텍스트) [NEW]
row-body-text-1      → content-body-text-1 (본문 상단) [기존 id 유지]
row-infographic      → content-infographic (이미지 placeholder) [NEW]
row-quote            → content-quote-block (왼쪽 빨간 보더 인용) [NEW]
row-bullet-list      → content-bullet-list (빨간 도트 리스트) [NEW]
row-cta              → content-cta-button (빨간 CTA) [기존 id 유지]
row-divider          → content-divider (회색 1px) [NEW]
row-footer           → content-footer-divider, content-footer-text, content-footer-copyright
```

## 3. Template B 블록 구조 (공지/홍보형 — #059669)

```
row-header           → content-logo (BS 아이콘 + 브랜드명)
                       content-divider-header
row-title            → content-title (제목) [기존 id 유지]
row-hero             → content-hero (다크 배경 + 흰 텍스트, 이벤트명) [기존 유지]
row-body-text-1      → content-body-text-1 (본문) [기존 id 유지]
row-info-block       → content-info-block (일정 정보 테이블) [기존 유지]
row-section-banner   → content-section-banner-b (초록 단색 배너) [NEW]
row-program-list     → content-program-list (프로그램 리스트) [NEW]
row-cta              → content-cta-button (초록 CTA #059669) [기존 id 유지, 색상 변경]
row-closing          → content-closing (클로징 텍스트)
row-footer           → 기존 푸터
```

## 4. Template C 블록 구조 (고객사례형 — #F97316)

```
row-header           → content-logo (BS 아이콘 + 브랜드명)
                       content-divider-header
row-title            → content-title (제목) [기존 id 유지]
row-greeting         → content-greeting-c (인사말) [NEW]
row-hook-quote       → content-hook-quote (주황 인용구) [기존 id 유지, 색상 변경]
row-profile          → content-profile (프로필 카드) [기존 유지]
row-ba-card          → content-ba-before, content-ba-after (2컬럼) [기존 유지]
row-section-banner   → content-section-banner-c (주황 배너 INTERVIEW) [NEW]
row-quote-block      → content-quote-block-c (주황 보더 인용) [NEW]
row-bullet-list      → content-bullet-list-c (주황 도트) [NEW]
row-body-text-1      → content-body-text-1 (본문) [기존 id 유지]
row-cta              → content-cta-button (주황 CTA #EA580C) [기존 id 유지, 색상 변경]
row-footer           → 기존 푸터
```

## 5. buildDesignFromSummary() 업데이트

### 색상 분기
```typescript
const themeColors = {
  education: { primary: '#F75D5D', hover: '#E54949' },
  notice:    { primary: '#059669', hover: '#047857' },
  case_study:{ primary: '#F97316', hover: '#EA580C' },
  default:   { primary: '#F75D5D', hover: '#E54949' },
};
```

### 훅 인용구 색상 분기
- 현재: 항상 `#F75D5D` 하드코딩
- 수정: content.type에 따라 themeColors[type].primary 사용

### 새 블록 매핑
| 블록 id | 데이터 소스 | 로직 |
|---------|------------|------|
| content-greeting | content.title에서 이름 추출 또는 기본값 | 플레이스홀더 유지 (동적 불필요) |
| content-toc | email_summary에서 ## 헤딩 추출 | 있으면 채우고 없으면 플레이스홀더 |
| content-section-banner | 고정 텍스트 | 플레이스홀더 유지 |
| content-quote-block | email_summary에서 > 인용 추출 | 있으면 채우고 없으면 플레이스홀더 |
| content-bullet-list | email_summary에서 - 리스트 추출 | 있으면 채우고 없으면 플레이스홀더 |

## 6. 에러 처리
- 기존 id 없는 블록은 findContentById()가 null 반환 → 기존 로직 그대로 안전
- 새 블록 매핑 실패 시 플레이스홀더 텍스트 유지

## 7. 구현 순서
1. [T1] Template A 재구축 → email-default-template.ts
2. [T2] Template B 재구축 → email-default-template.ts
3. [T3] Template C 재구축 → email-default-template.ts
4. [T4] buildDesignFromSummary() 업데이트 → email-template-utils.ts
5. [T5] 파일 분리 (선택) → 신규 파일 생성 + re-export
6. npm run build 확인
