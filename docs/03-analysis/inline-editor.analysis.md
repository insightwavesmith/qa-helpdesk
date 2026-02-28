# 인라인 편집기 Gap 분석

## Match Rate: 70%

## 일치 항목
- [x] PostDetailClient에 편집 모드 통합
- [x] TipTap InlineEditor 초기 구현
- [x] PublishBar (발행/발송 버튼)
- [x] 이미지 업로드 가능
- [x] 제목/카테고리/태그 편집

## 불일치 항목
- [ ] TipTap → 마크다운 포맷 전면 손실 (테이블, 넘버링, 인용문, HR)
- [ ] published 글 편집 시 "초안"으로 상태 변경되는 버그
- [ ] 뉴스레터 인라인 편집 미구현 (별도 admin 페이지에서만 가능)
- [ ] MDXEditor 교체 미완료

## 수정 필요
1. MDXEditor 교체 → content-hub-redesign으로 통합
2. 상태 버그 수정
3. 뉴스레터 편집 → 콘텐츠 상세 페이지 뉴스레터 탭으로 통합
