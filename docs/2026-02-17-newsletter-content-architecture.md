# 뉴스레터 콘텐츠 아키텍처 설계서

> 작성: 모찌 | 날짜: 2026-02-17 | 상태: Smith님 검토 대기

## 1. 현재 문제 (AS-IS)

```
AI → email_summary (마크다운) → markdownToEmailHtml() → 단일 HTML 덩어리
                                                           ↓
                          Unlayer: row-body-text-1 ← [전부 여기에 삽입]
                                   row-infographic ← [삭제됨]
                                   row-quote       ← [삭제됨]
                                   row-bullet-list ← [삭제됨]
```

- `buildDesignFromSummary()`가 `PLACEHOLDER_ROW_IDS`에 해당하는 row를 **모두 삭제**
- 배너 이미지는 `markdownToEmailHtml()` 안에서 `<img>` 태그로 렌더링되지만, Unlayer 구조상 하나의 텍스트 블록 안에 있어 **개별 편집 불가**
- 템플릿의 섹션별 row 구조가 완전히 무시됨

---

## 2. 목표 (TO-BE)

```
AI → email_summary (구조화된 마크다운)
  ↓
parseSummaryToSections()  → Section[] 배열
  ↓
템플릿 섹션 정의(TEMPLATE_SCHEMA) + Section[] → Unlayer rows 동적 생성
  ↓
Unlayer: 각 섹션이 독립된 row → 개별 편집 가능
```

**핵심 원칙:**
1. 각 템플릿은 **섹션 순서와 스펙을 정의**하는 스키마를 가진다
2. AI가 생성하는 email_summary는 이 스키마를 **반드시 준수**한다
3. 파서는 email_summary를 섹션별로 잘라서 **해당 row에 1:1 매핑**한다
4. 수동 삽입 항목(이미지 등)은 **placeholder row로 유지**되어 편집 가능하다

---

## 3. 템플릿별 섹션 구조 정의

### 3-A. 템플릿 A — 정보공유형 (education)

| 순서 | 섹션 ID | 배너키 | row-id | 콘텐츠 타입 | 소스 |
|------|---------|--------|--------|-------------|------|
| 1 | header | — | row-header | 로고 (v4, 투명배경) | 고정 |
| 2 | title | — | row-title | 제목 (22px, 볼드, 센터) | 자동 (content.title) |
| 3 | hook | — | row-hook-quote | 훅 인용구 (빨간 이탤릭) | 자동 (email_summary 첫 줄) |
| 4 | toc | — | row-toc | 목차 (배너키 목록 → 빨간 링크) | 자동 (섹션 목록에서 생성) |
| **5** | **insight** | **INSIGHT** | **row-section-insight** | **배너 PNG + 본문 텍스트** | **자동 (AI)** |
| 5a | — | — | — | ↳ 인사이트 본문 (1~2문단) | 자동 |
| 5b | — | — | — | ↳ 💡 팁 인용블록 (선택) | 자동 |
| 5c | insight-img | — | row-section-insight-img | ↳ 관련 이미지 + 캡션 | **수동 (placeholder)** |
| **6** | **keypoint** | **KEY POINT** | **row-section-keypoint** | **배너 PNG + 카드형 리스트** | **자동 (AI)** |
| 6a | — | — | — | ↳ ✅ **제목** — 설명 (2~3개) | 자동 |
| **7** | **checklist** | **CHECKLIST** | **row-section-checklist** | **배너 PNG + 체크리스트** | **자동 (AI)** |
| 7a | — | — | — | ↳ ✅ 질문형 텍스트 (2~4개) | 자동 |
| 8 | profile | — | row-profile | 스미스 코치 프로필 카드 | 고정 |
| 9 | cta | — | row-cta | CTA "전체 가이드 보기 →" | 자동 (URL) |
| 10 | closing | — | row-closing | 클로징 텍스트 + 자사몰사관학교 드림 | 고정 |
| 11 | footer | — | row-footer | 푸터 (정보 + 수신거부) | 고정 |

**AI 생성 email_summary 필수 구조:**
```markdown
이 글은 메타 광고에서 가장 중요한 3가지를 정리했어요.

### INSIGHT
핵심 인사이트 본문 텍스트...
> 💡 실전 팁 텍스트 (선택)

### KEY POINT
✅ **제목 1** — 설명
✅ **제목 2** — 설명
✅ **제목 3** — 설명

### CHECKLIST
✅ 질문형 체크 1
✅ 질문형 체크 2
✅ 질문형 체크 3
```

---

### 3-B. 템플릿 B — 웨비나/공지형 (webinar/notice)

| 순서 | 섹션 ID | 배너키 | row-id | 콘텐츠 타입 | 소스 |
|------|---------|--------|--------|-------------|------|
| 1 | header | — | row-header | 로고 | 고정 |
| 2 | title | — | row-title | 제목 | 자동 |
| 3 | hero | — | row-hero | 히어로 (빨간 배경, LIVE 뱃지) | 자동 (title + hook) |
| 4 | hook | — | row-hook-quote | 훅 인용구 | 자동 |
| **5** | **preview** | **강의 미리보기** | **row-section-preview** | **배너 PNG** | **자동 (배너)** |
| 5a | preview-slide | — | row-section-preview-slide | ↳ 슬라이드 캡처 이미지 | **수동 (placeholder)** |
| 5b | preview-caption | — | row-section-preview-caption | ↳ 3개 키워드 캡션 | 자동 |
| **6** | **topics** | **핵심 주제** | **row-section-topics** | **배너 PNG + 주제 리스트** | **자동 (AI)** |
| 6a | — | — | — | ↳ ■ 주제1 + 불릿 설명 | 자동 |
| 6b | — | — | — | ↳ ■ 주제2 + 불릿 설명 | 자동 |
| 6c | — | — | — | ↳ ■ 주제3 + 불릿 설명 | 자동 |
| **7** | **target** | **이런 분들을 위해** | **row-section-target** | **배너 PNG + 대상 리스트** | **자동 (AI)** |
| 7a | — | — | — | ↳ - 대상 1, - 대상 2... | 자동 |
| **8** | **schedule** | **웨비나 일정** | **row-section-schedule** | **배너 PNG + 일정 테이블** | **자동 (AI + 메타데이터)** |
| 8a | — | — | — | ↳ 📅 일시 / 📍 형식 / 💰 참가비 / 🔗 참여 | 자동 |
| 9 | profile | — | row-profile | 스미스 코치 프로필 | 고정 |
| 10 | cta | — | row-cta | CTA "무료웨비나 신청 →" | 자동 |
| 11 | closing | — | row-closing | 클로징 + 오픈채팅 안내 | 고정 |
| 12 | cta-outline | — | row-cta-outline | 아웃라인 CTA "오픈채팅 입장하기" | 고정 |
| 13 | footer | — | row-footer | 푸터 | 고정 |

**AI 생성 email_summary 필수 구조:**
```markdown
이번 무료 웨비나에서 자사몰 광고의 핵심을 알려드려요.

### 강의 미리보기
메타 머신러닝 · 콘텐츠 제작 · 데이터 분석 슬라이드

### 핵심 주제
■ **퍼포먼스 마케팅 최적화**
- 자사몰 광고 데이터 성공사례
- 성과를 만드는 메타 광고 세팅법

■ **컨텐츠 제작 프로세스**
- 고객 정의 → 콘텐츠 기획 → 마켓 테스트

■ **데이터 시각화 & 분석**
- 고객 데이터 흐름 파악 → 매출 전환 포인트 도출

### 이런 분들을 위해
- 메타 광고를 처음 시작하는 자사몰 대표님
- ROAS가 떨어져서 고민인 마케터
- 자사몰 매출을 월 1,000만 원 이상 만들고 싶은 분

### 웨비나 일정
| 항목 | 내용 |
| --- | --- |
| 📅 일시 | 2026년 2월 19일(수) 오후 3시 ~ 5시 |
| 📍 형식 | 실시간 온라인 웨비나(120분) + Q&A |
| 💰 참가비 | 무료 |
| 🔗 참여 | 사전 신청자에게 알림톡으로 참여 링크 전달 |
```

---

### 3-C. 템플릿 C — 고객사례형 (case_study)

| 순서 | 섹션 ID | 배너키 | row-id | 콘텐츠 타입 | 소스 |
|------|---------|--------|--------|-------------|------|
| 1 | header | — | row-header | 로고 | 고정 |
| 2 | title | — | row-title | 제목 | 자동 |
| 3 | hook | — | row-hook-quote | 성과 훅 인용구 (빨간) | 자동 |
| 4 | student | — | row-student-profile | 수강생 프로필 카드 | **반자동 (AI 추출 + 수동 보완)** |
| 4a | — | — | — | ↳ 이니셜 + 이름/업종/기수 | AI가 본문에서 추출 |
| **5** | **results** | **성과** | **row-section-results** | **배너 PNG + BA 카드** | **자동 (AI)** |
| 5a | ba-card | — | row-ba-card | ↳ Before/After 2컬럼 (수치) | 자동 (AI 추출) |
| 5b | results-detail | — | — | ↳ 세부 지표 테이블 (선택) | 자동 |
| **6** | **interview** | **INTERVIEW** | **row-section-interview** | **배너 PNG + 인용구** | **자동 (AI)** |
| 6a | — | — | — | ↳ "인용문" — 수강생 X님 | 자동 |
| **7** | **changes** | **핵심 변화** | **row-section-changes** | **배너 PNG + 변화 리스트** | **자동 (AI)** |
| 7a | — | — | — | ↳ ✅ **변화 1** — 설명 | 자동 |
| 7b | — | — | — | ↳ ✅ **변화 2** — 설명 | 자동 |
| 7c | — | — | — | ↳ ✅ **변화 3** — 설명 | 자동 |
| 8 | infographic | — | row-infographic | 매출 그래프 이미지 + 캡션 | **수동 (placeholder)** |
| 9 | profile | — | row-profile | 스미스 코치 프로필 | 고정 |
| 10 | cta | — | row-cta | CTA "성공 사례 더 보기 →" | 자동 |
| 11 | footer | — | row-footer | 푸터 | 고정 |

**AI 생성 email_summary 필수 구조:**
```markdown
월 매출 800만에서 5,200만으로, 3개월 만의 변화를 확인해보세요.

### 성과
#### 매출 변화
| 지표 | Before | After |
| --- | --- | --- |
| 월 매출 | 800만 | 5,200만 |
| ROAS | 1.2 | 4.8 |

### INTERVIEW
> "사관학교에서 배운 메타 광고 전략으로 매출이 6배 이상 올랐어요." — 수강생 J님

### 핵심 변화
✅ **광고 세팅 체계화** — 감으로 하던 광고를 데이터 기반으로 전환
✅ **콘텐츠 전략 수립** — 타겟별 맞춤 소재 제작 프로세스 확립
✅ **매출 구조 안정화** — 단발성 매출에서 반복 구매 구조로 전환
```

---

## 4. 콘텐츠 소스 분류

| 소스 타입 | 설명 | 예시 | Unlayer 편집 |
|-----------|------|------|-------------|
| **고정** | 모든 뉴스레터 공통, 변경 없음 | 로고, 프로필, 푸터 | 가능하지만 보통 안 함 |
| **자동 (AI)** | AI가 email_summary에서 생성 | 인사이트 본문, 체크리스트 | 가능 (텍스트 수정) |
| **자동 (배너)** | 배너키 매칭으로 PNG 자동 삽입 | INSIGHT 배너, KEY POINT 배너 | 가능 (이미지 교체) |
| **자동 (메타데이터)** | content 필드에서 추출 | 제목, CTA URL | 가능 |
| **수동 (placeholder)** | 직원이 Unlayer에서 교체 | 슬라이드 캡처, 인포그래픽 | **반드시 수동 교체** |
| **반자동** | AI가 초안 생성, 직원이 보완 | 수강생 프로필, BA 수치 | 가능 (수정 필요할 수 있음) |

---

## 5. 파서 → Row 매핑 로직

### 5-1. parseSummaryToSections()

```
입력: email_summary (마크다운 문자열)
출력: Section[] 배열

interface Section {
  bannerKey: string;        // "INSIGHT", "KEY POINT" 등
  content: string;          // 해당 섹션의 마크다운 본문
  contentHtml: string;      // markdownToEmailHtml() 결과
}

로직:
1. 첫 번째 ### 이전 텍스트 → hookLine (첫 줄) + introText (나머지)
2. ### 배너키 기준으로 split
3. 각 섹션을 Section 객체로 변환
4. 순서 검증: TEMPLATE_SCHEMA의 순서와 일치하는지 확인
```

### 5-2. TEMPLATE_SCHEMA (새로운 구조)

```typescript
interface SectionSpec {
  sectionId: string;            // "insight", "keypoint", "checklist" 등
  bannerKey: string | null;     // BANNER_MAP 키 (null이면 고정 섹션)
  rowType: "banner-text"        // 배너 PNG + 텍스트
         | "banner-image"       // 배너 PNG + placeholder 이미지
         | "banner-table"       // 배너 PNG + 테이블
         | "banner-list"        // 배너 PNG + 불릿/체크 리스트
         | "banner-quote"       // 배너 PNG + 인용구
         | "fixed"              // 변경 없는 고정 row
         | "auto-meta"          // 메타데이터 기반 자동 생성
         | "placeholder";       // 수동 교체 필요
  source: "ai" | "fixed" | "meta" | "manual" | "semi-auto";
  required: boolean;            // 필수 여부
}

interface TemplateSchema {
  id: string;                   // "A", "B", "C"
  name: string;                 // "정보공유형", "웨비나형", "고객사례형"
  contentTypes: string[];       // ["education"], ["webinar", "notice"], ["case_study"]
  sections: SectionSpec[];      // 순서대로
}
```

### 5-3. buildDesignFromSummary() 리디자인

```
1. content.type → TemplateSchema 선택
2. parseSummaryToSections(email_summary) → Section[]
3. 스키마 순회:
   for (섹션 in schema.sections):
     if 고정 → 기존 row 유지
     if AI → Section[]에서 매칭되는 bannerKey 찾기 → createSectionRow()
     if placeholder → placeholder row 유지 (삭제하지 않음!)
     if meta → content 필드에서 추출하여 row 생성
4. rows 배열 = 순서대로 조립
5. Unlayer JSON 반환
```

### 5-4. createSectionRow() (새로운 함수)

하나의 섹션 = **배너 row** + **콘텐츠 row** (2개의 독립 row)

```
배너 row:
  - type: "image" 또는 "html"
  - src: BANNER_MAP[bannerKey] + ".png"
  - id: "row-banner-{sectionId}"

콘텐츠 row:
  - type: "text"
  - html: markdownToEmailHtml(section.content)  ← 해당 섹션 마크다운만!
  - id: "row-content-{sectionId}"
```

이렇게 하면 Unlayer에서:
- 배너 이미지를 클릭 → 다른 이미지로 교체 가능
- 콘텐츠 텍스트를 클릭 → 해당 섹션만 수정 가능
- 섹션 순서 드래그로 변경 가능

---

## 6. 확장 구조 — 새 템플릿 추가 방법

### 6-1. 새 템플릿 추가 절차

1. **TEMPLATE_SCHEMA에 새 스키마 정의** (sections 배열)
2. **BANNER_KEYS_BY_TYPE에 AI 생성 규칙 추가** (contents.ts)
3. **필요시 새 배너 PNG 제작** (Supabase Storage 업로드)
4. **필요시 새 고정 row 정의** (email-default-template.ts)

코드 변경 최소화: 스키마 정의만 추가하면 파서 + row 생성은 자동.

### 6-2. 파일 구조 변경

```
src/lib/
  email-template-schema.ts    ← NEW: TemplateSchema 정의 (A/B/C + 확장용)
  email-template-rows.ts      ← NEW: 공통 row 팩토리 (createBannerRow, createTextRow 등)
  email-template-utils.ts     ← MODIFY: parseSummaryToSections + buildDesignFromSummary 리디자인
  email-default-template.ts   ← KEEP: 고정 row 정의 (header, footer, profile 등)
```

---

## 7. 전체 데이터 흐름

```
[콘텐츠 작성]
     ↓
body_md (원본 마크다운)
     ↓
[AI 생성] generateEmailSummary()
     ↓
email_summary (구조화된 마크다운, ### 배너키 순서 강제)
     ↓
[Unlayer 로드] newsletter-edit-panel.tsx
     ↓
buildDesignFromSummary(content)
     ├─ 1. TemplateSchema 선택 (type → A/B/C)
     ├─ 2. parseSummaryToSections(email_summary)
     ├─ 3. 스키마 순회 → 섹션별 독립 row 생성
     ├─ 4. 고정 row (header/profile/cta/footer) 유지
     └─ 5. placeholder row 유지 (수동 교체용)
     ↓
Unlayer JSON (email_design_json)
     ↓
[Unlayer 에디터] — 섹션별 독립 편집 가능
     ├─ 배너 이미지 교체
     ├─ 텍스트 수정
     ├─ placeholder 이미지 교체 (직원)
     └─ 섹션 순서 변경 (드래그)
     ↓
[저장] → email_design_json DB 업데이트
     ↓
[발송] → Unlayer exportHtml() → 이메일 HTML
```

---

## 8. 검증 체크리스트

- [ ] 템플릿 A: INSIGHT → KEY POINT → CHECKLIST 순서로 독립 row 생성되는가?
- [ ] 템플릿 B: 강의 미리보기 → 핵심 주제 → 이런 분들을 위해 → 웨비나 일정 순서 맞는가?
- [ ] 템플릿 C: 성과(BA) → INTERVIEW → 핵심 변화 순서 맞는가?
- [ ] 각 배너 PNG가 해당 섹션 위에 정확히 배치되는가?
- [ ] placeholder row가 삭제되지 않고 유지되는가? (수동 이미지 교체용)
- [ ] Unlayer에서 각 섹션을 독립적으로 편집할 수 있는가?
- [ ] 새 템플릿 추가 시 스키마만 정의하면 되는가?
- [ ] AI가 지정되지 않은 배너키를 생성하면 에러 처리되는가?
- [ ] email_design_json이 null이면 재생성 가능한가?

---

## 9. 기존 TASK.md 대비 변경점

| 항목 | 기존 TASK.md | 이 설계서 |
|------|-------------|----------|
| 섹션 매핑 | parseSummaryToSections만 정의 | **템플릿별 섹션 스키마 + AI 생성 규칙 + 소스 분류 전부 정의** |
| Row 생성 | createBannerRow만 언급 | **createBannerRow + createTextRow + placeholder 유지 로직** |
| 확장성 | 없음 | **TemplateSchema 기반 추가 구조** |
| 콘텐츠 소스 | 구분 없음 | **6가지 소스 타입 분류 (고정/자동AI/자동배너/자동메타/수동/반자동)** |
| AI 규칙 | BANNER_KEYS_BY_TYPE만 | **각 템플릿의 정확한 마크다운 구조 예시 포함** |

---

## 부록: BANNER_MAP (현재 13개)

| 배너키 | 파일명 | 사용 템플릿 |
|--------|--------|------------|
| INSIGHT | banner-insight.png | A |
| INSIGHT 01~03 | banner-insight-01~03.png | A (deprecated) |
| KEY POINT | banner-key-point.png | A |
| CHECKLIST | banner-checklist.png | A |
| 강의 미리보기 | banner-preview.png | B |
| 핵심 주제 | banner-topics.png | B |
| 이런 분들을 위해 | banner-target.png | B |
| 웨비나 일정 | banner-schedule.png | B |
| INTERVIEW | banner-interview.png | C |
| 핵심 변화 | banner-change.png | C |
| 성과 | banner-results.png | C |