# 콘텐츠 관리 v2 — 아카이브/삭제 + 공지 통합

## 배경
- 콘텐츠 하드 삭제 시 FK 위반으로 실패 (6개 참조 테이블)
- 콘텐츠 탭에서 공지사항이 필터에서 빠져 있음
- 아카이브 버튼이 편집 다이얼로그에만 있고 상세 설정 패널에는 없음

## 범위

### T1. 아카이브 기능 (content-settings-panel)
- 상세 설정 패널의 삭제 버튼 옆에 "아카이브" 버튼 추가
- status를 "archived"로 변경
- 기존 getContents()의 archived 제외 로직은 이미 동작 중

### T2. 삭제 기능 수정 (deleteContent)
- FK 참조 테이블 정리 후 삭제
- 대상: knowledge_chunks, email_logs/email_sends, knowledge_usage, posts
- distributions, content_relations은 CASCADE 설정됨 (자동 정리)

### T3. 콘텐츠 탭 공지 통합
- sourceFilter 기본값을 "info_share,manual"로 변경
- 소스 필터에 "전체(정보공유+직접)" 옵션 추가
- 큐레이션 원본(crawl, youtube, blueprint, lecture)은 제외 유지

### T4. 썸네일 삭제 — 이미 완료
- detail-sidebar.tsx에 handleThumbnailDelete + UI 구현 확인됨

## 성공 기준
- 아카이브 클릭 → 목록에서 사라짐
- 삭제 클릭 → FK 에러 없이 완전 삭제
- 콘텐츠 탭에서 공지 + 정보공유 모두 표시
- `npm run build` 성공

## 하지 말 것
- DB 스키마/FK CASCADE 변경 금지
- 큐레이션 탭 건드리지 않음
- Storage 버킷 설정 변경 금지
