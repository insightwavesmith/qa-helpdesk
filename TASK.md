# TASK: 뉴스레터 섹션 배너를 이미지로 교체

## 목적
`markdownToEmailHtml()` 파서의 `### heading` 렌더러가 CSS gradient div를 생성하고 있음.
이메일 클라이언트 호환성을 위해 Supabase Storage에 업로드된 배너 PNG 이미지로 교체.

## 수정 파일
- `src/lib/email-template-utils.ts` (1개)

## 변경 내용

### 1. 배너 이미지 URL 매핑 추가 (파일 상단, import 아래)

```typescript
const BANNER_BASE_URL = "https://symvlrsmkjlztoopbnht.supabase.co/storage/v1/object/public/content-images/newsletter-banners";

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

### 2. `### heading` 핸들러 교체

현재 (line ~63-67):
```typescript
const h3Match = trimmed.match(/^### (.+)/);
if (h3Match) {
  htmlParts.push(`<div style="height:56px;line-height:56px;background:linear-gradient(135deg,#F75D5D 0%,#E54949 60%,transparent 60%);margin:24px 0 16px;border-radius:4px 0 0 4px;"><span style="padding-left:32px;color:#fff;font-size:14px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">${h3Match[1]}</span></div>`);
  continue;
}
```

교체:
```typescript
const h3Match = trimmed.match(/^### (.+)/);
if (h3Match) {
  const bannerKey = h3Match[1].trim();
  const bannerFile = BANNER_MAP[bannerKey];
  if (bannerFile) {
    htmlParts.push(`<img src="${BANNER_BASE_URL}/${bannerFile}.png" alt="${bannerKey}" style="display:block;width:100%;max-width:536px;height:auto;border-radius:6px 6px 0 0;margin:24px 0 0;" />`);
  } else {
    // fallback: CSS gradient (매핑에 없는 경우)
    htmlParts.push(`<div style="height:56px;line-height:56px;background:linear-gradient(135deg,#F75D5D 0%,#E54949 60%,transparent 60%);margin:24px 0 16px;border-radius:4px 0 0 4px;"><span style="padding-left:32px;color:#fff;font-size:14px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">${bannerKey}</span></div>`);
  }
  continue;
}
```

## 완료 기준
- `### INSIGHT` → `<img src="...banner-insight.png">` 출력
- `### 강의 미리보기` → `<img src="...banner-preview.png">` 출력
- 매핑에 없는 `### OTHER` → 기존 CSS gradient fallback
- 타입 체크 통과 (`npx tsc --noEmit`)

## 금지
- 다른 파일 수정하지 말 것
- markdownToEmailHtml의 다른 로직 변경하지 말 것
- 테스트/스토리북 등 추가 파일 생성하지 말 것
