# 뉴스레터 템플릿 디자인 고도화 — Plan

## 1. 목표
BS_CAMP_TEMPLATE_A/B/C를 `email-mockup-all.html` 목업 수준의 풍부한 디자인으로 재구축.
현재 기본 구조(헤더+제목+본문+CTA)를 섹션 배너, 인용구, 목차, 불릿 리스트, 인포그래픽 등 포함한 완성형 이메일로 업그레이드.

## 2. 범위
- Template A (정보공유형/교육): 빨간 테마 #F75D5D — 섹션 배너, TOC, 인용 블록, 불릿 리스트
- Template B (공지/홍보형): 초록 테마 #059669 — 히어로, 일정 블록, 프로그램 리스트
- Template C (고객사례형): 주황 테마 #F97316 — Before/After, 프로필 카드, 인용구
- buildDesignFromSummary() 호환성 업데이트 (색상 분기, 새 블록 매핑)
- (선택) 파일 분리 리팩토링

## 3. 범위 외
- Unlayer 에디터 컴포넌트 수정 (unlayer-editor.tsx)
- newsletter-edit-panel.tsx 수정
- DB 스키마 변경
- 이메일 발송 로직 수정
- infographic-templates.html의 실제 이미지 생성 (placeholder만)

## 4. 제약 사항
- Unlayer JSON 형식: body.rows[].columns[].contents[]
- 기존 블록 id 유지: content-title, content-hook-quote, content-body-text-1, content-body-text-2, content-cta-button
- findContentById() 호환성 100%
- 600px 고정폭
- linear-gradient 미지원 → 단색 배경 대체
- Unlayer projectId: 284274

## 5. 성공 기준
- [ ] npm run build 성공
- [ ] Template A: 교육 콘텐츠 선택 시 목업과 유사한 디자인 렌더링
- [ ] Template B: 공지 콘텐츠 선택 시 초록 테마 렌더링
- [ ] Template C: 고객사례 콘텐츠 선택 시 주황 테마 렌더링
- [ ] buildDesignFromSummary() 3개 type 모두 정상 동작
- [ ] 기존 기능 깨지지 않음

## 6. 태스크 의존성
```
T1 (Template A) ──┐
T2 (Template B) ──┼── T4 (호환성) ── T5 (파일 분리, 선택)
T3 (Template C) ──┘
```

## 7. 리스크
| 리스크 | 대응 |
|--------|------|
| 파일 크기 2500줄+ | T5에서 파일 분리 검토 |
| gradient 배경 미지원 | 단색 배경 + 배경 이미지로 대체 |
| 새 블록 id 충돌 | findContentById() 기존 id 유지, 신규 블록은 별도 네이밍 |
| 2컬럼 레이아웃 깨짐 | Unlayer columns 기능 (cells: [1,1]) 활용 |
