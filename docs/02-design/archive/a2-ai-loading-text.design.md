# A2. 정보공유 AI 생성 로딩 문구 변경 — 설계서

> 작성: 2026-03-02

## 1. 데이터 모델
- 해당 없음 (DB 변경 없음)

## 2. API 설계
- 해당 없음 (API 변경 없음)
- 백엔드 `src/app/api/admin/curation/generate/route.ts`의 모델명(`claude-sonnet-4-6`)은 서버 내부용이며 사용자에게 노출되지 않으므로 변경 불필요

## 3. 컴포넌트 구조

### 수정 대상

**파일**: `src/components/curation/generate-preview-modal.tsx`

**변경 1 — 주석 (line 46)**:
```diff
- // Sonnet 호출
+ // AI 호출
```

**변경 2 — 로딩 텍스트 (line 108)**:
```diff
  <p className="text-sm text-gray-500">
-   Sonnet이 정보공유를 생성하고 있습니다...
+   AI가 글을 생성중입니다.
  </p>
```

### 변경하지 않는 파일

| 파일 | 이유 |
|------|------|
| `src/app/api/admin/curation/generate/route.ts` | 모델명은 서버 내부용, 사용자 비노출 |
| `src/components/email/ai-write-dialog.tsx` | "생성 중..." 문구는 모델명 미포함, 변경 불필요 |
| `src/components/content/new-content-modal.tsx` | "생성 중..." 문구는 모델명 미포함, 변경 불필요 |

## 4. 에러 처리
- 해당 없음 (정적 텍스트 변경만)
- 에러 메시지(`"정보공유 생성에 실패했습니다."`)는 모델명 미포함 → 변경 불필요

## 5. 구현 순서
- [ ] `src/components/curation/generate-preview-modal.tsx` line 46 주석 수정
- [ ] `src/components/curation/generate-preview-modal.tsx` line 108 로딩 텍스트 수정
- [ ] `npm run build` 성공 확인
