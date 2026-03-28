# T3. 회원 삭제 조건 수정 — Design

> 최종 갱신: 2026-03-01

## 1. 현행 구조

### member-detail-modal.tsx (239줄)
```typescript
const canDelete = profile.role === "lead" || profile.role === "member";
```

- `canDelete`가 true일 때만 삭제 버튼 활성화
- 현재 "inactive" 역할은 조건에 없어 삭제 불가

## 2. 변경 설계

### 단일 라인 변경

**Before**:
```typescript
const canDelete = profile.role === "lead" || profile.role === "member";
```

**After**:
```typescript
const canDelete = profile.role === "lead" || profile.role === "member" || profile.role === "inactive";
```

### 동작 매트릭스

| role | canDelete (Before) | canDelete (After) |
|------|--------------------|-------------------|
| admin | false | false |
| lead | true | true |
| member | true | true |
| inactive | **false** | **true** |
| student | false | false |
| alumni | false | false |

## 3. 영향 범위

| 파일 | 변경 유형 |
|------|----------|
| `src/app/(main)/admin/members/member-detail-modal.tsx` | canDelete 조건 1줄 수정 |

- handleDelete 함수: 변경 없음
- 삭제 API(server action): 변경 없음
- DB: 변경 없음

## 4. 에러 처리
- 기존 handleDelete의 에러 처리(toast.error)가 그대로 동작
- 삭제 성공 시 `onUpdated()` 콜백 호출도 기존과 동일
