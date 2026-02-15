# TASK.md — 웨비나 템플릿 배너 부분매칭 + PC뷰 크기 수정

> 2026-02-15 | notice 배너 키 부분매칭 도입 + PC에서 배너 과대 렌더링 수정

## 목표
1. BANNER_MAP 키 매칭을 **부분매칭(includes)**으로 변경하여, email_summary의 h3 텍스트에 키가 포함되면 배너 이미지 출력
2. 배너 이미지 PC뷰 크기 제한 — `max-width:600px`로 데스크톱에서 과대 렌더링 방지
3. notice 4개 배너 (강의 미리보기, 핵심 주제, 이런 분들을 위해, 웨비나 일정) 전부 이미지로 정상 렌더링

## 레퍼런스
- 배너 이미지: `https://symvlrsmkjlztoopbnht.supabase.co/storage/v1/object/public/content-images/newsletter-banners/`
- 배너 사이즈: 1200×160px (@2x) → 표시 크기 600×80px
- 기존 패턴: `src/lib/email-template-utils.ts`

## 현재 코드

```ts
// src/lib/email-template-utils.ts — BANNER_MAP (6~21행)
const BANNER_MAP: Record<string, string> = {
  "INSIGHT": "banner-insight",
  "INSIGHT 01": "banner-insight-01",
  "INSIGHT 02": "banner-insight-02",
  "INSIGHT 03": "banner-insight-03",
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
// src/lib/email-template-utils.ts — h3 배너 매칭 로직 (87~100행)
// 현재: 정확 매칭 (exact match)
const h3Match = trimmed.match(/^### (.+)/);
if (h3Match) {
  const bannerKey = h3Match[1].trim();
  const bannerFile = BANNER_MAP[bannerKey];  // ← 정확 매칭만 됨
  if (bannerFile) {
    htmlParts.push(
      `<img src="${BANNER_BASE_URL}/${bannerFile}.png" alt="${bannerKey}" ` +
      `style="display:block;width:100%;height:auto;border-radius:6px 6px 0 0;margin:24px 0 0;" />`
      // ↑ width:100%만 있어서 PC에서 과대 렌더링
    );
  } else {
    // CSS gradient fallback
    htmlParts.push(`<div style="height:80px;...">${bannerKey}</div>`);
  }
}
```

```
// 매칭 실패 사례:
h3 텍스트: "웨비나에서 다루는 핵심 주제"
BANNER_MAP 키: "핵심 주제"
정확매칭: BANNER_MAP["웨비나에서 다루는 핵심 주제"] → undefined ❌
부분매칭: "웨비나에서 다루는 핵심 주제".includes("핵심 주제") → true ✅
```

## 제약
- BANNER_MAP 키 자체는 변경하지 않음 (기존 단축키 유지)
- DB email_summary 수정 금지 (코드에서 해결)
- education, case_study 타입 배너 매칭에 영향 없어야 함
- 부분매칭 시 여러 키가 매칭될 수 있으면 가장 긴 키 우선 (예: "INSIGHT 01" > "INSIGHT")

## 태스크

### T1. 배너 매칭 로직 변경 (exact → includes) + PC 크기 제한 → backend-dev
- 파일: `src/lib/email-template-utils.ts`
- 의존: 없음
- 수정 범위: h3 배너 매칭 블록 (87~100행 부근)
- 변경 1 — 부분매칭:
  ```ts
  // AS-IS: 정확 매칭
  const bannerFile = BANNER_MAP[bannerKey];

  // TO-BE: 부분매칭 (h3 텍스트에 BANNER_MAP 키가 포함되면 매칭)
  // 긴 키 우선 매칭 (예: "INSIGHT 01"이 "INSIGHT"보다 먼저)
  const matchedKey = Object.keys(BANNER_MAP)
    .filter(key => bannerKey.includes(key))
    .sort((a, b) => b.length - a.length)[0];
  const bannerFile = matchedKey ? BANNER_MAP[matchedKey] : undefined;
  ```
- 변경 2 — PC 크기 제한:
  ```ts
  // AS-IS:
  style="display:block;width:100%;height:auto;..."

  // TO-BE:
  style="display:block;width:100%;max-width:600px;height:auto;..."
  ```
- 완료 기준:
  - [ ] BANNER_MAP 키가 h3 텍스트에 포함되면 매칭 (includes)
  - [ ] 여러 키 매칭 시 가장 긴 키 우선
  - [ ] img 태그에 `max-width:600px` 추가
  - [ ] CSS gradient fallback에도 `max-width:600px` 추가
  - [ ] TypeScript 에러 없음

### T2. ✅ 체크마크 정렬 수정 → backend-dev
- 파일: `src/lib/email-template-utils.ts`
- 의존: T1과 독립 (같은 파일 다른 블록)
- 수정 범위: ✅ 체크 포인트 렌더링 (158행 부근)
- 현재 코드:
  ```ts
  // 158행 — ✅ 단순 체크 모드 (bold 없는 경우)
  return `<tr><td style="padding:14px 20px;${borderBottom}"><div style="font-size:14px;color:#374151;line-height:1.5;"><span style="display:inline-block;width:16px;height:16px;border-radius:4px;background:#F75D5D;text-align:center;line-height:16px;color:#fff;font-size:10px;font-weight:700;vertical-align:middle;margin-right:8px;">&#10003;</span>${text}</div></td></tr>`;
  ```
- 문제: ✓ 문자(&#10003;)가 16×16px 빨간 네모 안에서 수직 중앙 정렬 안 됨. 시각적으로 아래로 치우침.
- 수정 방향:
  ```ts
  // line-height를 font-size와 맞춤 + padding으로 중앙 배치
  // 또는 vertical-align 조정
  // 테스트 후 최적값 결정 — 이메일 클라이언트(Gmail, Outlook)에서 정렬 확인 필요
  ```
- 완료 기준:
  - [ ] ✓ 문자가 빨간 네모 안에서 시각적으로 중앙 정렬
  - [ ] 옆 텍스트와 수직 정렬 일치
  - [ ] ✅ 카드 모드(bold 있는 경우)의 번호 아이콘도 동일 패턴이면 함께 수정
  - [ ] TypeScript 에러 없음

### T3. 코드 리뷰 → code-reviewer
- 파일: T1, T2 결과물
- 의존: T1, T2 완료 후
- 완료 기준:
  - [ ] education "INSIGHT" 정확매칭 여전히 동작하는지
  - [ ] "INSIGHT 01"이 "INSIGHT"보다 우선 매칭되는지
  - [ ] "성과" 키가 "성과 분석" 같은 의도하지 않은 h3에 매칭되지 않는지 (부작용 체크)
  - [ ] case_study 배너 영향 없는지

## 엣지 케이스
| 상황 | 기대 동작 |
|------|-----------|
| h3="웨비나에서 다루는 핵심 주제", 키="핵심 주제" | includes 매칭 → banner-topics.png ✅ |
| h3="이런 분들을 위해 준비했어요", 키="이런 분들을 위해" | includes 매칭 → banner-target.png ✅ |
| h3="웨비나 일정 안내", 키="웨비나 일정" | includes 매칭 → banner-schedule.png ✅ |
| h3="INSIGHT 01", 키="INSIGHT"과 "INSIGHT 01" 둘 다 매칭 | 긴 키 우선 → banner-insight-01.png ✅ |
| h3="INSIGHT", 키="INSIGHT"만 매칭 | 정확매칭과 동일 → banner-insight.png ✅ |
| h3="새로운 섹션", 매칭 키 없음 | CSS gradient fallback (기존 동작) |
| h3="성과", 키="성과" | 정확 includes 매칭 → banner-results.png ✅ |
| PC 뷰 (넓은 화면) | 배너 max-width 600px로 제한, 중앙 정렬 아닌 좌측 정렬 |
| 모바일 뷰 (375px 이하) | width:100%로 화면 너비에 맞춤 (기존과 동일) |

## 리뷰 보고서
- 보고서 파일: docs/review/2026-02-15-notice-banner-fix.html
- 리뷰 일시: (리뷰 후 작성)
- 변경 유형: 백엔드 (파서 매칭 로직 + 스타일)
- 피드백 요약: (리뷰 후 작성)
- 반영 여부: (리뷰 후 작성)

## 검증
☐ npm run build 성공
☐ TypeScript 에러 0, ESLint 에러 0
☐ education 콘텐츠 → 뉴스레터 탭 → INSIGHT, KEY POINT, CHECKLIST 배너 이미지 정상
☐ notice 콘텐츠 → 뉴스레터 탭 → 4개 배너 전부 이미지로 렌더링 (gradient fallback 없음)
☐ case_study 콘텐츠 → 뉴스레터 탭 → 성과, INTERVIEW, 핵심 변화 배너 정상
☐ PC 뷰에서 배너 이미지 max-width 600px 적용 확인 (과대 렌더링 없음)
☐ 모바일 뷰(375px)에서 배너 width:100% 유지 확인
☐ 테스트 발송 → smith.kim@inwv.co에서 배너 이미지 + 크기 확인
