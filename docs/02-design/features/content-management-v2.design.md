# 콘텐츠 관리 v2 설계서

## 1. 데이터 모델
- 변경 없음. 기존 contents 테이블의 status 필드("archived") 활용.

## 2. API 설계

### 2-1. deleteContent(id) 수정
```
순서:
1. knowledge_chunks WHERE content_id = id → DELETE
2. knowledge_usage WHERE content_id = id → DELETE (존재 시)
3. email_logs WHERE content_id = id → DELETE (존재 시)
4. email_sends WHERE content_id = id → DELETE (존재 시)
5. posts WHERE content_id = id → UPDATE content_id = null (연결 해제)
6. contents WHERE id = id → DELETE (distributions, content_relations은 CASCADE)
```

### 2-2. archiveContent — 기존 updateContent 활용
- `updateContent(id, { status: "archived" })` 호출 — 신규 액션 불필요

## 3. 컴포넌트 구조

### 3-1. content-settings-panel.tsx 변경
- 위험 영역에 아카이브 버튼 추가 (삭제 버튼 왼쪽)
- `Archive` 아이콘 + "아카이브" 텍스트
- confirm 다이얼로그 → updateContent(id, { status: "archived" }) → 목록으로 이동

### 3-2. admin/content/page.tsx (콘텐츠 탭) 변경
- sourceFilter 기본값: `"info_share,manual"` → 정보공유 + 직접작성 모두 표시
- 소스 필터 옵션 수정:
  - "전체" (value: "info_share,manual") — 기본
  - "정보공유" (value: "info_share")
  - "직접 작성" (value: "manual")
- getContents 호출 시 sourceType이 "info_share,manual"이면 두 값을 in 필터로 전달 (이미 지원됨)

## 4. 에러 처리
- deleteContent FK 정리 실패 시 → 개별 에러 로그 + 계속 진행 (best-effort)
- 최종 contents DELETE 실패 시만 사용자에게 에러 반환

## 5. 구현 순서
- [x] T4: 썸네일 삭제 (이미 완료)
- [ ] T2: deleteContent FK 정리 (backend-dev)
- [ ] T1: content-settings-panel 아카이브 버튼 (frontend-dev)
- [ ] T3: 콘텐츠 탭 소스 필터 확장 (frontend-dev)

---

## TDD 보완 (테스트 주도 개발 지원)

### T1. 단위 테스트 시나리오

| 함수 | 입력 | 기대 출력 | 검증 포인트 |
|------|------|----------|------------|
| `deleteContent(id)` | 유효한 content_id | `{ success: true }` | FK 정리 순서 (knowledge_chunks → knowledge_usage → email_logs → email_sends → posts 연결 해제 → contents 삭제) |
| `deleteContent(id)` | 존재하지 않는 content_id | 에러 (content 미존재) | 삭제 대상 없을 때 에러 처리 |
| `updateContent(id, { status: "archived" })` | 유효한 content_id | `{ status: "archived" }` | 아카이브 상태 전환 |
| `getContents({ sourceType: "info_share,manual" })` | sourceType="info_share,manual" | 정보공유 + 직접작성 콘텐츠 배열 | 복수 sourceType in 필터 동작 |
| `getContents({ sourceType: "info_share" })` | sourceType="info_share" | 정보공유 콘텐츠만 | 단일 sourceType 필터 |

### T2. 엣지 케이스 정의

| # | 엣지 케이스 | 입력 조건 | 기대 동작 | 우선순위 |
|---|-----------|---------|---------|---------|
| E1 | FK 정리 중 중간 실패 | knowledge_chunks 삭제 후 email_logs 삭제 실패 | 에러 로그 + 계속 진행 (best-effort) | P0 |
| E2 | 최종 contents DELETE 실패 | FK는 정리됐지만 contents 삭제 실패 | 사용자에게 에러 반환 | P0 |
| E3 | posts 연결 해제 | content_id를 참조하는 posts 존재 | posts.content_id = null로 업데이트 (삭제 아님) | P1 |
| E4 | 아카이브된 콘텐츠 재아카이브 | 이미 status="archived"인 콘텐츠 | 정상 처리 (idempotent) | P2 |
| E5 | FK 자식 레코드 0건 | knowledge_chunks, email_logs 등 관련 레코드 없음 | 에러 없이 정상 삭제 | P1 |

### T3. 모킹 데이터 (Fixture)

```json
// fixture: content_with_fk_relations — FK 관계가 있는 콘텐츠
{
  "content": {
    "id": "content-uuid-001",
    "title": "메타 광고 A/B 테스트 가이드",
    "body_md": "# A/B 테스트\n...",
    "status": "published",
    "source_type": "info_share"
  },
  "related_knowledge_chunks": [
    { "id": "chunk-001", "content_id": "content-uuid-001", "content": "A/B 테스트란..." },
    { "id": "chunk-002", "content_id": "content-uuid-001", "content": "메타 광고에서..." }
  ],
  "related_posts": [
    { "id": "post-001", "content_id": "content-uuid-001", "title": "이번 주 A/B 테스트 결과" }
  ]
}
```

### T4. 테스트 파일 경로 규약

| 테스트 대상 | 테스트 파일 경로 | 테스트 프레임워크 |
|-----------|---------------|----------------|
| `deleteContent` (FK 정리 로직) | `__tests__/content-management-v2/delete-content.test.ts` | vitest |
| `updateContent` (아카이브) | `__tests__/content-management-v2/archive-content.test.ts` | vitest |
| `getContents` (소스 필터) | `__tests__/content-management-v2/get-contents-filter.test.ts` | vitest |

### T5. 통합 테스트 시나리오

| 시나리오 | Method | Endpoint | 요청 Body | 기대 응답 | 상태 코드 |
|---------|--------|----------|----------|---------|---------|
| 콘텐츠 삭제 (FK 정리 포함) | Server Action | `deleteContent(id)` | `id="content-uuid-001"` | FK 자식 모두 정리 + contents 삭제 성공 | 200 |
| 콘텐츠 아카이브 | Server Action | `updateContent(id, data)` | `{ status: "archived" }` | 상태 "archived"로 변경 | 200 |
| 소스 필터 (info_share + manual) | Server Action | `getContents(filters)` | `{ sourceType: "info_share,manual" }` | 두 타입 콘텐츠 합산 반환 | 200 |
