# 큐레이션 v2 Phase 0 + Phase 1 설계서

## 1. 데이터 모델

기존 contents 테이블 활용 (스키마 변경 없음).
레벨 구분은 title 파싱으로 처리:
```typescript
function parseLevel(title: string): string {
  if (/초급|기초|입문/i.test(title)) return "초급";
  if (/중급|심화/i.test(title)) return "중급";
  if (/고급|전문/i.test(title)) return "고급";
  return "전체";
}
```

## 2. API 설계

### 백필 API
| Method | Endpoint | 요청 | 응답 |
|--------|----------|------|------|
| POST | `/api/admin/curation/backfill` | `{ type: "ai_summary" \| "importance_score" }` | `{ processed, failed, errors[] }` |

### 서버 액션 추가 (curation.ts)
- `getCurriculumContents(sourceType)` -> contents 전체 조회 (source_type 필터, created_at 정렬)
- `backfillAiSummary()` -> ai_summary IS NULL 레코드 백필
- `backfillImportanceScore()` -> importance_score = 0 레코드 백필

## 3. 컴포넌트 구조

```
content/page.tsx
  TabsContent[curation]
    PipelineSidebar (수정: 섹션 분리)
    조건부:
      blueprint|lecture -> CurriculumView
      그 외 -> CurationTab (기존)
```

### PipelineSidebar
```
[커리큘럼 소스]
  블루프린트 (N건)
  자사몰사관학교 (N건)
[큐레이션 소스]
  전체 (N건)
  블로그 / YouTube / 마케팅원론 / 웨비나 / 논문 / 파일
[통계]
  전체 N건 / AI요약 N건 / 미처리 N건
```

### CurriculumView
```typescript
interface CurriculumViewProps {
  sourceType: string;
}
```
- 레벨별 그룹핑 (초급/중급/고급 or 전체)
- 진행률 바 = ai_summary 완료건 / 전체건
- 각 아이템: 번호 + 제목 + ai_summary (항상 표시)
- 클릭시 body_md 미리보기 확장

### 반응형
- md 이상: flex (사이드바 + 메인)
- md 미만: 사이드바 숨김, 상단 수평 스크롤 탭

## 4. 에러 처리
| 상황 | 처리 |
|------|------|
| Gemini 실패 (빈문자열) | 스킵, failed 카운트 |
| Gemini 429 | generateFlashText 내부 2초 재시도 |
| DB 에러 | console.error + 에러 반환 |

## 5. 구현 순서
- [ ] curation.ts: backfillAiSummary, backfillImportanceScore, getCurriculumContents
- [ ] backfill/route.ts 생성
- [ ] pipeline-sidebar.tsx 섹션 분리
- [ ] curriculum-view.tsx 생성
- [ ] content/page.tsx 듀얼모드 분기
- [ ] 반응형 처리
- [ ] npm run build 성공
