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
