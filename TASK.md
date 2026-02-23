# TASK.md — 큐레이션 탭 전체 임베딩 버튼 추가
> 2026-02-23 | 콘텐츠 관리 > 큐레이션 탭에 "전체 임베딩" 버튼 추가

## 타입
개발

## 목표
관리자가 큐레이션 탭에서 전체 콘텐츠를 한 번에 임베딩할 수 있는 버튼 추가.

## 배경
- `/api/admin/embed` API 이미 존재 (`POST { all: true }` 지원)
- `embedAllPending()` 함수로 미임베딩 콘텐츠 일괄 처리 가능
- 현재 큐레이션 탭(`curation-tab.tsx`)에는 임베딩 버튼 없음

## 제약
- 기존 "정보공유 생성", "일괄 스킵" 버튼 동작에 영향 없어야 함
- 임베딩 중 중복 요청 방지 (버튼 비활성화)
- API 응답 타입: `{ processed: number, errors: number }`
- 기존 import 스타일 유지 (lucide-react 아이콘)

## 태스크

### T1. "전체 임베딩" 버튼 추가 (→ frontend-dev)
**대상 파일:** `src/components/curation/curation-tab.tsx`

1. `isEmbedding` state 추가 (`useState(false)`)
2. `handleEmbedAll` 함수 구현:
   - `POST /api/admin/embed` `{ all: true }` 호출
   - 로딩 시작/종료 처리
   - 완료: `toast.success("임베딩 완료: 처리 N건, 오류 M건")`
   - 실패: `toast.error("임베딩 실패: {에러메시지}")`
3. 버튼 위치: 필터 행 우측 (Select 컴포넌트 옆)
   - 선택 없을 때도 항상 표시 (선택 기반 버튼과 달리)
   - 라벨: "전체 임베딩"
   - 아이콘: `Database` (lucide-react)
   - 로딩 중: `Loader2` 스피너 + "임베딩 중..." 텍스트
   - variant: `outline`, size: `sm`

## 현재 코드

### curation-tab.tsx 버튼 영역 (170~195번째 줄 근처)
```tsx
// 필터 + 버튼 행
<div className="flex items-center justify-between gap-2 mb-4">
  <div className="flex gap-2">
    <Select value={sourceFilter} onValueChange={setSourceFilter}>...</Select>
    <Select value={periodFilter} onValueChange={setPeriodFilter}>...</Select>
  </div>

  {selectedIds.size > 0 && (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" onClick={handleDismiss} ...>
        <X className="h-3.5 w-3.5" />
        일괄 스킵 ({selectedIds.size})
      </Button>
      <Button size="sm" onClick={handleGenerate} className="bg-[#F75D5D] ...">
        <Sparkles className="h-3.5 w-3.5" />
        정보공유 생성 ({selectedIds.size})
      </Button>
    </div>
  )}
</div>
```

### embed API 응답 (route.ts)
```ts
// POST { all: true }
const result = await embedAllPending();
return NextResponse.json(result); // { processed: number, errors: number }
```

## 엣지 케이스
1. **임베딩할 콘텐츠 0건**: `processed: 0, errors: 0` → "임베딩 완료: 처리 0건, 오류 0건" 토스트 표시 (정상 처리)
2. **임베딩 중 버튼 재클릭**: `isEmbedding` 상태로 버튼 `disabled` → 중복 요청 차단
3. **API 500 에러**: `toast.error("임베딩 실패: {에러메시지}")` 표시, 버튼 다시 활성화

## 검증
☐ npm run build 성공
☐ 관리자 로그인 → 콘텐츠 관리 → 큐레이션 탭 → "전체 임베딩" 버튼 표시 확인
☐ 버튼 클릭 → 로딩 스피너 + "임베딩 중..." 표시 확인
☐ 임베딩 완료 → 결과 토스트 확인 (처리 건수 표시)
☐ 기존 필터/스킵/정보공유 생성 버튼 정상 동작 (회귀 없음)

## 완료 후 QA
☐ /bkit pdca check 실행
☐ bkit QA 결과 확인 (Match Rate 90%+, Critical 0)
☐ QA봇에게 결과 보고 (sessions_send → agent:qa-lead:main)

## 리뷰 보고서
- 보고서 파일: mozzi-reports/public/reports/review/2026-02-23-embed-all-button.html
- 리뷰 일시: 2026-02-23
- 변경 유형: UI 버튼 추가 (단순, API 연결)
- 피드백 요약: Smith님 직접 요청 — API 기존 존재, 버튼 연결만 필요
- 반영 여부: 스펙대로 구현
