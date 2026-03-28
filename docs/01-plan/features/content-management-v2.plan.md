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

---

## TDD 보완 (테스트 주도 개발 지원)

### T1. 단위 테스트 시나리오

| 대상 함수/API | 입력 | 기대 출력 | 비고 |
|---------------|------|-----------|------|
| `archiveContent(contentId)` | 유효한 content ID | `{ status: "archived" }` | 상태 변경만, 데이터 유지 |
| `deleteContent(contentId)` | FK 참조 있는 content ID | 참조 정리 후 삭제 성공 | knowledge_chunks, email_logs 등 선삭제 |
| `getContents({ sourceFilter })` | `"info_share,manual"` | 정보공유 + 직접 작성 콘텐츠 목록 | archived 제외 |
| `getContents({ sourceFilter })` | `"all"` | 전체 소스 (큐레이션 제외) | crawl/youtube/blueprint/lecture 제외 유지 |

### T2. 엣지 케이스 정의

| 시나리오 | 입력/상황 | 기대 동작 |
|----------|-----------|-----------|
| 이미 archived 콘텐츠 재아카이브 | status="archived"인 항목 | 무변경, 성공 반환 |
| FK 참조 6개 테이블 모두 있는 콘텐츠 삭제 | knowledge_chunks + email_logs + email_sends + knowledge_usage + posts + distributions | 순서대로 정리 후 삭제 성공 |
| 존재하지 않는 contentId 삭제 | 삭제된 ID | 404 에러 |
| archived 콘텐츠가 목록에 노출 | getContents 호출 | archived 항목 미포함 확인 |
| 공지사항 소스 필터링 | sourceFilter 미지정 | 기본값 "info_share,manual" 적용 |

### T3. 모킹 데이터 (Fixture)

```json
// fixtures/content-management-v2/content-with-refs.json
{
  "id": "cnt_001",
  "title": "Meta 광고 초보 가이드",
  "body_md": "# 시작하기\n광고 관리자에서...",
  "source_type": "info_share",
  "status": "published",
  "category": "guide",
  "created_at": "2026-03-01T00:00:00Z",
  "_refs": {
    "knowledge_chunks": 5,
    "email_logs": 2,
    "email_sends": 1,
    "knowledge_usage": 3,
    "posts": 1
  }
}

// fixtures/content-management-v2/archived-content.json
{
  "id": "cnt_002",
  "title": "구버전 뉴스레터",
  "source_type": "manual",
  "status": "archived",
  "created_at": "2026-01-15T00:00:00Z"
}
```

### T4. 테스트 파일 경로 규약

| 테스트 파일 | 테스트 대상 | 프레임워크 |
|-------------|-------------|------------|
| `__tests__/content-management-v2/archive.test.ts` | 아카이브 기능 + 목록 제외 | vitest |
| `__tests__/content-management-v2/delete-with-fk.test.ts` | FK 참조 정리 + 삭제 | vitest |
| `__tests__/content-management-v2/source-filter.test.ts` | 소스 필터 (공지 통합) | vitest |
| `__tests__/content-management-v2/fixtures/` | JSON fixture 파일 | - |
