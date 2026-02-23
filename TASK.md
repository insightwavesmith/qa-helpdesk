# TASK.md — 뉴스레터 성과 추적 UI 목업
> 2026-02-23 | 발송 성과(열람/클릭) 확인 UI가 없음 → 목업 설계

## 타입
목업

## 목표
뉴스레터 성과 추적 관리자 UI가 어떻게 보일지 HTML 목업을 제작한다.
코드 구현은 하지 않음. 목업만.

## 현재 상태 (코드 확인 완료)
- DB에는 이미 추적 데이터 존재: `email_logs.total_opens`, `email_logs.total_clicks`
- 추적 엔드포인트 존재: `/api/email/track`
- **없는 것**: 이 데이터를 보여주는 관리자 UI

## 현재 뉴스레터 관련 파일
```
src/app/api/admin/email/send/route.ts          # 발송 API
src/app/api/email/track/route.ts               # 열람/클릭 추적
src/components/content/newsletter-edit-panel.tsx    # 현재 편집 패널
src/components/admin/SubscriberTab.tsx          # 수신자 관리
supabase/migrations/00012_email_tracking.sql    # email_sends, email_logs 스키마
```

## 목업 요구사항
관리자가 뉴스레터 발송 후 성과를 확인하는 UI.

포함해야 할 요소:
1. **발송 목록**: 발송한 뉴스레터 리스트 (제목, 발송일, 수신자 수)
2. **성과 지표**: 발송 건당 열람율(%), 클릭율(%), 수신거부 수
3. **상세 보기**: 클릭 시 개별 발송 건 상세 (열람자 목록, 클릭 링크별 집계)
4. **UI 위치**: 기존 관리자 페이지 내 "뉴스레터" 탭 또는 별도 섹션

## 목업 작성 규칙
- HTML 파일로 작성 (실제 동작 없음, 시각적 설계만)
- 기존 서비스 디자인 시스템 참고 (Tailwind, 다크 사이드바 + 화이트 컨텐츠 영역)
- 데스크탑 기준
- 실제 데이터처럼 보이는 더미 데이터 포함

## 산출물
- 파일: `docs/mockups/newsletter-analytics-ui.html`
- mozzi-reports 배포: `mozzi-reports/public/reports/task/2026-02-23-newsletter-analytics-mockup.html`
- 배포 후 링크 보고

## 완료 후 QA
☐ HTML이 브라우저에서 정상 렌더링되는지 확인
☐ 목업이 요구사항 4개 항목을 모두 포함하는지 확인
☐ 모찌에게 결과 보고
