# 콘텐츠 파이프라인 Gap 분석

## Match Rate: 85%

## 일치 항목
- [x] contents 테이블 확장 (email_summary, email_subject, thumbnail_url 등)
- [x] 콘텐츠 관리 페이지 (목록 + 상태 카드 + 필터)
- [x] 이메일 발송 페이지 (TipTap 에디터 + React Email 미리보기 + 발송)
- [x] 구독/수신거부 API
- [x] React Email 템플릿 (최신정보 + 공지)
- [x] 배치 발송 (50건/초)
- [x] Google Workspace SMTP 연동
- [x] content_id 기반 콘텐츠→이메일 연동

## 불일치 항목
- [ ] 콘텐츠 관리 행 클릭 → 원문 소스 다이얼로그 (설계: 편집 가능한 UI)
- [ ] 정보공유 전용 관리 화면 없음 (설계: 에디터+미리보기+게시)
- [ ] excerpt에 raw HTML 태그 노출 (getExcerpt 함수 HTML 미처리)
- [ ] TipTap 에디터 마크다운 포맷 손실 (테이블/넘버링/인용문)

## 수정 필요
1. 콘텐츠 관리 UX 전면 개편 → content-hub-redesign으로 분리
2. MDXEditor 교체 → content-hub-redesign에 포함
3. excerpt HTML 처리 → content-hub-redesign에 포함
