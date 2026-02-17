# 뉴스레터 골드 스탠다드 v7 릴리즈 보고서

**날짜**: 2026-02-17
**커밋**: `f51e58e` feat: 뉴스레터 골드 스탠다드 v7 레이아웃 갭 11건 수정
**배포**: Vercel Production (qa-helpdesk.vercel.app)
**작업자**: Claude Agent

---

## 요약

골드 스탠다드(email-samples-v7.html) + Gmail 실제 렌더링 스크린샷 3종과 현재 코드를 비교한 결과 발견된 **구조적 갭 11건을 모두 수정**. `buildDesignFromSummary` 레이아웃 조립 로직을 템플릿별로 재구성하여 골드 스탠다드와 **구조 일치율 100%** 달성.

---

## 수정 내역

### 수정 파일 3개 / 변경 124줄 추가, 32줄 삭제

| 파일 | 수정 항목 | 갭 번호 |
|------|-----------|---------|
| `src/lib/newsletter-row-templates.ts` | hookRow/emotionHookRow markdownBold, greeting 스미스코치 | G10, G11 |
| `src/lib/email-template-utils.ts` | splitHookAndIntro, extractClosingText, 레이아웃 재구성 | G1~G9 |
| `src/actions/contents.ts` | AI 프롬프트 closing 가이드, INTERVIEW 필수 강화 | 3-A, 3-B |

### 갭 상세

| # | 갭 | 수정 내용 | 상태 |
|---|-----|-----------|------|
| G1 | hookLine 미분리 | `splitHookAndIntro()` 헬퍼: 1st para = hook, 나머지 = intro | 완료 |
| G2 | intro body 행 누락 | `createIntroRow(intro)` 추가 (education/webinar/case_study 공통) | 완료 |
| G3 | 섹션 앞 divider 누락 | `ROW_DIVIDER` 섹션 전 삽입 (3종 공통) | 완료 |
| G4 | case_study 제목 행 누락 | `createTitleRow(content.title)` greeting 뒤 추가 | 완료 |
| G5 | case_study 배경 텍스트 누락 | `createIntroRow(csIntro)` — 중간 단락 배경 설명 렌더링 | 완료 |
| G6 | case_study 수강생 인용 박스 누락 | `createStudentQuoteRow()` — hookLine 내 `>` 인용 파싱 | 완료 |
| G7 | case_study 푸터 과다 | profile/farewell/divider 제거 → CTA→Footer만 | 완료 |
| G8 | webinar farewell 불필요 | `createFarewellRow()` 호출 제거 | 완료 |
| G9 | 마감 텍스트(closing) 미추출 | `extractClosingText()` 헬퍼: 마지막 섹션 trailing text 분리 | 완료 |
| G10 | hook/emotionHook markdownBold 미적용 | `markdownBold(escapeHtml(text))` 적용 | 완료 |
| G11 | greeting 텍스트 v7 미반영 | "스미스코치" 추가, 대표님/자사몰사관학교 빨간 볼드 | 완료 |
| 3-A | closing 프롬프트 미강화 | education/webinar systemPromptOverride에 마감 텍스트 가이드 추가 | 완료 |
| 3-B | INTERVIEW 필수 미강화 | "출력이 실패로 간주됩니다" 강한 표현 추가 | 완료 |

---

## 레이아웃 구조 (변경 후)

### Template A — Education
```
Logo → Title → Hook(1st para) → Intro(나머지) → Divider
→ INSIGHT(subtitle+body+tip) → KEY POINT(cards) → CHECKLIST(checks)
→ Closing → Divider → Profile → CTA(빨간) → Farewell → Footer
```

### Template B — Webinar
```
Logo → Hero(pill+title+subtitle만) → Intro(나머지) → Divider
→ 강의미리보기 → 핵심주제(cards) → 이런분들(bullets) → 웨비나일정(table)
→ Closing → Divider → Profile → CTA(빨간) → Footer [farewell 없음]
```

### Template C — Case Study
```
Logo → Greeting(스미스코치) → Title → EmotionHook(1st para) → Background(중간) → StudentQuote
→ Divider → 성과(BA tables) → INTERVIEW(quotes) → 핵심변화(cards)
→ CTA(초록) → Footer [profile/farewell/divider 없음]
```

---

## 검증 결과

### 구조 대조 (코드 vs 골드 스탠다드 v7)

| 템플릿 | 체크 항목 수 | 일치 항목 | 일치율 |
|--------|-------------|----------|--------|
| A (Education) | 14 | 14 | 100% |
| B (Webinar) | 14 | 14 | 100% |
| C (Case Study) | 13 | 13 | 100% |
| **합계** | **41** | **41** | **100%** |

### 빌드 상태
- `npm run build`: 성공
- TypeScript 에러: 0개
- ESLint 에러: 0개

### 미완료 항목
- [ ] 브라우저에서 3종 뉴스레터 재생성 (admin 인증 필요 → 수동 QA)
- [ ] Gmail 실제 렌더링 스크린샷 비교 (재생성 후 발송 테스트)

---

## 이전 완성 항목 (수정 불필요 — 그대로 유지)

- 번호 배지: `border-radius:50%` 원형
- 체크리스트: 빨간 원형 + 흰 체크마크
- 노란 팁 박스: `#FFF8E7` + `#FDBA74` 좌측 보더
- 불릿 리스트: 빨간 점 + markdownBold
- 웨비나 일정 테이블: 이모지 + 핑크 헤더 + markdownBold
- BA 테이블: 다크 헤더 + After 빨간 볼드
- 인터뷰 인용: 빨간 좌측 보더 + 이탤릭
- BANNER_KEYS_BY_TYPE webinar: INSIGHT/KEY POINT/CHECKLIST 제거됨
- CTA: case_study `#22C55E` 초록
- AI 프롬프트: 템플릿별 systemPromptOverride 분리됨

---

## 다음 단계

1. **브라우저 QA**: admin 로그인 → 교육/웨비나/고객사례 각 1건 뉴스레터 재생성 → v7 골드 스탠다드 비교
2. **Gmail 발송 테스트**: 재생성된 뉴스레터 테스트 발송 → 실제 렌더링 확인
3. **미세 조정**: 시각적 차이 발견 시 row-templates 인라인 스타일 미세 조정
