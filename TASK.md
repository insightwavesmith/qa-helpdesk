# TASK: 뉴스레터 파서+템플릿 버그 수정 (Round 2)

## 배경
Gmail QA 결과 3가지 공통/개별 버그 발견. 파서 로직 수정 + 각 템플릿 placeholder 행 제거 필요.

## 수정 대상 파일
- `src/lib/email-template-utils.ts`

## 버그 목록

### [BUG-1] 번호 카드 전부 01 (공통, 모든 템플릿)

**현상**: ✅ 번호 카드가 01, 02, 03이 아니라 전부 01로 표시
**원인**: `markdownToEmailHtml()`에서 블록 분리가 `\n\s*\n` (빈 줄) 기준.
email_summary에서 ✅ 항목 사이에 빈 줄이 있으면 각각 1개짜리 블록으로 분리 → 매번 i=0 → 01.

**수정**: 연속된 ✅ 블록을 하나로 합치는 로직 추가.
- 방법: blocks 분리 후, ✅로 시작하는 연속 블록들을 하나로 merge하는 전처리 단계 추가
- 또는: 함수 레벨 카운터를 두고 ✅ bold 카드마다 전역 증가

### [BUG-2] Template B(웨비나) 콘텐츠 중복

**현상**: 파서가 email_summary → HTML로 변환한 내용 + Unlayer 기존 placeholder 행이 둘 다 남아서 콘텐츠 2번 렌더링
**제거해야 할 행 ID** (Template B):
- `row-slide-preview` (강의 미리보기 → 파서가 이미지+캡션으로 렌더링)
- `row-program-list` (핵심 주제 불릿 → 파서가 번호 카드로 렌더링)
- `row-info-block` (웨비나 일정 → 파서가 테이블로 렌더링)
- `row-closing` (클로징 텍스트 → 파서가 본문에 포함)
- `row-cta-outline` (보조 CTA → 중복)

**수정**: `PLACEHOLDER_ROW_IDS`에 위 행 ID 추가하거나, Template B 전용 제거 로직 추가

### [BUG-3] Template C(수강생사례) 콘텐츠 중복

**현상**: 파서 HTML 아래에 프로필카드+BA카드 placeholder가 그대로 남음
**제거해야 할 행 ID** (Template C):
- `row-profile` (수강생 프로필 → 파서가 인용+테이블로 렌더링)
- `row-ba-card` (Before/After 카드 → 파서가 테이블로 렌더링)

**수정**: `PLACEHOLDER_ROW_IDS`에 추가하거나, Template C 전용 제거 로직

### [BUG-4] 체크리스트 디자인 개선

**현상**: `✅ text` (bold 없는) 체크리스트가 단순 텍스트로 표시 (이모지가 깨지는 클라이언트도 있음)
**수정**: 체크리스트용 라인 카드 스타일로 변경

변경 전:
```
✅ Pixel 베이스 코드가 설치되어 있나요?
```

변경 후 HTML:
```html
<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f0f0f0;border-radius:12px;overflow:hidden;">
  <!-- 각 항목 -->
  <tr>
    <td style="padding:14px 20px;border-bottom:1px solid #f0f0f0;">
      <table cellpadding="0" cellspacing="0"><tr>
        <td style="vertical-align:middle;padding-right:12px;">
          <div style="width:24px;height:24px;border-radius:6px;background:#F75D5D;text-align:center;line-height:24px;color:#fff;font-size:14px;font-weight:700;">✓</div>
        </td>
        <td style="vertical-align:middle;font-size:14px;color:#374151;line-height:1.5;">텍스트</td>
      </tr></table>
    </td>
  </tr>
  <!-- 마지막 항목은 border-bottom 없음 -->
</table>
```

### [BUG-5] hook quote 중복 (Template B)

**현상**: 인사말 아래에 hook quote 행이 있고, bodyText1에도 같은 내용이 파서로 렌더링됨
**수정**: `buildDesignFromSummary()`에서 이미 hookQuote 블록에 첫 줄을 넣고 bodyMd에서 제외하는 로직 있음. 확인 필요 — 혹시 hook-quote 행이 Template B에 있으면 bodyMd 제외가 작동하는지 점검.
만약 hook-quote가 있는데 빈 줄이 아닌 행으로 중복 표시되면, hook-quote 행 자체를 제거하는 방법도 고려.

## 테스트 방법
1. `pnpm tsc --noEmit` — 타입 체크
2. Vercel 배포 후 테스트 발송으로 Gmail 확인

### [BUG-6] 로고 아래 빨간 divider 삭제

**현상**: 로고(10+ 자사몰사관학교) 아래에 빨간 가로선(2px solid #F75D5D)이 있음. 제목 블럭 위에 불필요.
**수정**: row-header 안의 divider 행 제거 또는 숨김. 모든 템플릿(A/B/C/Default) 공통.

### [BUG-7] "자사몰사관학교" 텍스트 빨간색으로 변경

**현상**: 로고 아래 "자사몰사관학교" 텍스트가 회색(#94a3b8)
**수정**: "자사몰사관학교" 텍스트 색상을 #F75D5D 빨간색으로 변경. 모든 템플릿 공통.
(로고 구성: 빨간 사각형 "10+" + 아래 "자사몰사관학교" 빨간색)

### [BUG-4 보충] 체크리스트 빨간색 톤 맞추기

체크리스트 라인 카드의 테두리 색상을 #f0f0f0 → 연빨강(#FDE8E8 또는 #FECACA)으로,
전체적으로 빨간 톤앤매너에 맞추기.

### [BUG-8] 이미지가 "다운로드" 링크로 표시 (Template A)

**현상**: `![alt](url)` 이미지가 Gmail에서 img 태그가 아닌 "다운로드" 텍스트 링크로 렌더링
**원인**: 파서가 img 태그를 생성하지만, Gmail이 inline base64나 특정 URL을 차단할 수 있음. 또는 `<a>` 태그로 감싸서 표시되는 문제.
**수정**: 이미지 렌더링 시 `<img>` 태그만 단독 사용, `<a>` 래핑 제거. display:block 추가. alt 텍스트가 링크처럼 보이지 않도록 확인.

## 우선순위
BUG-1 > BUG-2 > BUG-3 > BUG-4 > BUG-5 > BUG-6 > BUG-7 > BUG-8
