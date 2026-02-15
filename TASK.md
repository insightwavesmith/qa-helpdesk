# TASK.md — 이메일 템플릿 로고/인사말 수정
> 2026-02-15 | Smith님 피드백: 로고 배경색 통일 + 인사말 텍스트 삭제

## 목표
1. 로고 이미지를 v4(투명 배경)로 교체하여 이메일 배경(#ffffff)과 자연스럽게 통일
2. "안녕하세요! 대표님 자사몰사관학교의 스미스코치입니다." 인사말 블록(row-greeting) 완전 삭제
3. buildDesignFromSummary에서 greeting 관련 로직 제거

## 레퍼런스
- Smith님 스크린샷: 로고 빨간 배경이 이메일 흰 배경과 불일치, 인사말 텍스트 불필요
- 새 로고 v4: `https://symvlrsmkjlztoopbnht.supabase.co/storage/v1/object/public/content-images/newsletter-banners/logo-email-v4.png` (503x132, 투명배경 + 10+ 빨간마크 + 자사몰사관학교 검정텍스트)

## 현재 코드

### 로고 (email-default-template.ts — 4곳)
```ts
// 라인 109, 708, 1372, 2294 — 4개 템플릿 전부 동일
text: '<p style="text-align:center;"><img src="https://symvlrsmkjlztoopbnht.supabase.co/storage/v1/object/public/content-images/newsletter-banners/logo-email-v3.png" alt="자사몰사관학교" style="display:block;margin:0 auto;height:64px;width:auto;" /></p>',
```

### 인사말 row-greeting (email-default-template.ts — 3곳)
```ts
// Template A: 라인 745~807 (row-greeting, id="row-greeting")
// Template B: 라인 1482~1539 (row-greeting, id="row-greeting")
// Template C: 라인 2333~2390 (row-greeting, id="row-greeting")
// Default 템플릿: 인사말이 content-body-text-1 안에 포함 (별도 row 없음)

// Template A 예시 (B/C도 구조 동일):
{
  id: "row-greeting",
  cells: [1],
  columns: [{
    id: "col-greeting",
    contents: [{
      id: "content-greeting",
      type: "text",
      values: {
        text: '<p style="font-size: 15px; line-height: 170%;"><span style="color: #1a1a1a;">안녕하세요! <strong>대표</strong>님</span><br><a href="https://bscamp.co.kr" style="color: #F75D5D;">자사몰사관학교</a><span>의 스미스코치입니다.</span></p>',
      },
    }],
    // ... column values
  }],
  // ... row values
}
```

### Default 템플릿 인사말 (email-default-template.ts — 라인 245)
```ts
// Default 템플릿의 content-body-text-1에 인사말이 포함돼 있음
text: '<p style="font-size: 15px; line-height: 180%;"><span style="color: #333333;">안녕하세요! <strong>대표</strong>님 <a href="https://bscamp.co.kr" style="color:#F75D5D;">자사몰사관학교</a>의 스미스코치입니다.</span></p>\n<p style="font-size: 15px; line-height: 180%;"><span style="color: #333333;">여기에 뉴스레터 본문 내용을 작성해주세요...</span></p>',
```

### buildDesignFromSummary (email-template-utils.ts)
```ts
// 라인 301~314 — hookQuote와 bodyText1에서 greeting 고려
const hookQuote = findContentById(rows, "content-hook-quote");
if (hookQuote && content.email_summary) {
  const firstLine = content.email_summary.split("\n\n")[0].trim();
  hookQuote.values.text = `<p ...>${escapeHtml(firstLine)}</p>`;
}

const bodyText1 = findContentById(rows, "content-body-text-1");
if (bodyText1 && content.email_summary) {
  let bodyMd = content.email_summary;
  if (hookQuote) {
    const idx = bodyMd.indexOf("\n\n");
    bodyMd = idx !== -1 ? bodyMd.slice(idx + 2) : "";
  }
  bodyText1.values.text = bodyMd ? markdownToEmailHtml(bodyMd) : "";
}
```
※ greeting 행이 삭제되면 content-greeting이 없어지므로 별도 코드 영향 없음.
※ Default 템플릿의 content-body-text-1 인사말은 buildDesignFromSummary에서 email_summary로 덮어씌워지므로 auto-generated에서는 무관. 단, Unlayer 에디터에서 직접 편집 시에는 기본값으로 보이므로 placeholder 텍스트로 교체 필요.

## 제약
- email-template-utils.ts의 `markdownToEmailHtml`, `buildDesignFromSummary` 핵심 로직 변경 금지
- 기존 배너 이미지(BANNER_MAP), 프로필 카드(SMITH_PROFILE_ROW), CTA 버튼 건드리지 않음
- PLACEHOLDER_ROW_IDS 배열에 "row-greeting" 추가하지 않음 (행 자체를 템플릿에서 삭제)

## 태스크

### T1. 로고 이미지 v3→v4 교체 → frontend-dev
- 파일: `app/src/lib/email-default-template.ts`
- 의존: 없음
- 완료 기준:
  - [ ] `logo-email-v3.png` → `logo-email-v4.png` URL 교체 (4곳: 라인 109, 708, 1372, 2294)
  - [ ] height `64px` → `48px` (투명 배경이라 여백 불필요, 시각적 크기 유지)
  - [ ] 4개 템플릿(Default/A/B/C) 전부 동일하게 변경

### T2. 인사말 블록 삭제 → frontend-dev
- 파일: `app/src/lib/email-default-template.ts`
- 의존: 없음 (T1과 병렬 가능하지만 같은 파일이므로 순차)
- 완료 기준:
  - [ ] Template A: `row-greeting` 전체 삭제 (라인 745~807 구간)
  - [ ] Template B: `row-greeting` 전체 삭제 (라인 1482~1539 구간)
  - [ ] Template C: `row-greeting` 전체 삭제 (라인 2333~2390 구간)
  - [ ] Default 템플릿: `content-body-text-1`의 인사말 텍스트를 placeholder로 교체
    - Before: "안녕하세요! 대표님 자사몰사관학교의 스미스코치입니다. / 여기에 뉴스레터 본문 내용을..."
    - After: "여기에 뉴스레터 본문 내용을 작성해주세요."

### T3. 체크리스트 모바일 반응형 수정 → frontend-dev
- 파일: `app/src/lib/email-template-utils.ts`
- 의존: T1, T2 완료 후 (같은 파일은 아니지만 순차 안전)
- 완료 기준:
  - [ ] BUG-4 체크리스트(bold 없는 ✅): `table-layout:fixed` 제거 + 내부 테이블 제거
  - [ ] 체크 아이콘을 `<td width="36">` 고정 대신 인라인 처리
  - [ ] 번호 카드(bold 있는 ✅): `width:44px` 고정 → `width` 속성 제거, `min-width:44px` 사용
  - [ ] 모바일(375px 뷰포트)에서 텍스트 밀림 없이 정상 렌더링
  - [ ] Gmail 모바일 앱에서 테스트

현재 코드 (BUG-4 체크리스트, 라인 153~160):
```ts
// 문제: table-layout:fixed + width:36px가 모바일에서 텍스트 밀림 유발
const rows = checkItems.map((l, i) => {
  const text = l.trim().replace(/^✅\s*/, "");
  const borderBottom = i < checkItems.length - 1 ? "border-bottom:1px solid #FEE2E2;" : "";
  return `<tr><td style="padding:14px 20px;${borderBottom}"><table cellpadding="0" cellspacing="0" width="100%" style="table-layout:fixed;"><tr><td style="width:36px;vertical-align:middle;"><div style="width:20px;height:20px;...">&#10003;</div></td><td style="vertical-align:middle;...">${text}</td></tr></table></td></tr>`;
});
htmlParts.push(`<table width="100%" ... style="table-layout:fixed;border:1px solid #FECACA;...">${rows.join("")}</table>`);
```

수정 방향: 
- 외부 테이블: `table-layout:fixed` 제거 → `table-layout:auto`
- 내부 중첩 테이블 제거 → 단일 `<td>` 안에 체크 아이콘 + 텍스트를 인라인으로
- 또는: `<td style="width:28px;min-width:28px;">` + 아이콘 크기 축소(20→16px)

## 엣지 케이스
| 상황 | 기대 동작 |
|------|-----------|
| Unlayer에서 기존 콘텐츠 열기 | greeting row 없이 로고 → 훅인용구/본문 바로 연결 |
| buildDesignFromSummary 자동 생성 | greeting이 없으므로 로고 → hookQuote → body 순서 |
| Default 템플릿으로 새 콘텐츠 생성 | 인사말 없이 placeholder 텍스트만 표시 |
| 이메일 클라이언트(Gmail/Outlook) | 투명 배경 로고가 흰 배경 위에 자연스럽게 표시 |

## 리뷰 보고서
- 보고서 파일: docs/review/2026-02-15-email-logo-greeting.html
- 리뷰 일시: 2026-02-15 13:37
- 변경 유형: UI/UX
- 피드백 요약: 에이전트팀 리뷰 완료. Before/After HTML 목업 포함. 로고 v3→v4 + 인사말 삭제 2건. Default 템플릿은 텍스트만 제거, A/B/C는 row 삭제로 구분 이해됨. 엣지 케이스 3건 확인.
- 반영 여부: 반영함

## 검증
☐ npm run build 성공
☐ 기존 배너/프로필카드/CTA 렌더링 정상
☐ 로고 확인: 4개 템플릿 Unlayer 에디터에서 로고가 투명 배경으로 표시
☐ 인사말 확인: Template A/B/C에서 greeting row 없음
☐ 테스트 이메일 3건 발송 → Gmail에서 로고가 배경과 자연스럽게 통일
☐ 테스트 이메일에서 "스미스코치입니다" 텍스트 안 보임
