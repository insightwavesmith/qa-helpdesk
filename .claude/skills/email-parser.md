---
name: email-parser
description: 이메일 뉴스레터 파서 규칙. BANNER_MAP, markdownToEmailHtml, 프로필 카드.
---

# 이메일 뉴스레터 파서

## 핵심 파일
- `src/lib/email-template-utils.ts` — markdownToEmailHtml(), buildDesignFromSummary()
- `src/lib/email-default-template.ts` — Unlayer JSON 템플릿 A/B/C

## BANNER_MAP (13개)
Supabase Storage: `https://symvlrsmkjlztoopbnht.supabase.co/storage/v1/object/public/content-images/newsletter-banners/`

| 키 | 파일명 |
|---|---|
| INSIGHT | banner-insight.png |
| INSIGHT 01~03 | banner-insight-01~03.png |
| KEY POINT | banner-key-point.png |
| CHECKLIST | banner-checklist.png |
| 강의 미리보기 | banner-lecture-preview.png |
| 핵심 주제 | banner-core-topics.png |
| 이런 분들을 위해 | banner-target-audience.png |
| 웨비나 일정 | banner-webinar-schedule.png |
| INTERVIEW | banner-interview.png |
| 핵심 변화 | banner-key-changes.png |
| 성과 | banner-results.png |

## 파서 규칙
- `### KEY` → BANNER_MAP에서 찾아서 `<img>` 태그 (width="600")
- `## 제목` → h2도 h3와 동일하게 배너 매핑 처리
- BANNER_MAP에 없는 키 → CSS gradient fallback
- `---` → `<hr>` 구분선
- `> 인용` → 왼쪽 border + 이탤릭 블록
- `💡팁` → 팁 카드 (배경색 + 아이콘)
- `✅` → 체크 아이콘 치환
- 불릿(`-`) → 목록
- 테이블(`|`) → HTML table

## 프로필 카드
- 위치: CTA 위, 이메일 하단
- 원형 사진 (profile-smith.png) + "스미스" + 자격
- 테마색 border

## email_summary 작성 규칙
- 정보글: INSIGHT + KEY POINT + CHECKLIST 배너 구조 필수
- h3(###) 사용. h2(##)도 지원하지만 h3 권장.
