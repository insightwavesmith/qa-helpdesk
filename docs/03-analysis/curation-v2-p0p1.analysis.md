# 큐레이션 v2 Phase 0 + Phase 1 Gap 분석

## Match Rate: 95%

## 일치 항목

### Phase 0: 데이터 백필
| 설계 항목 | 구현 여부 | 비고 |
|-----------|:---------:|------|
| backfillAiSummary 서버 액션 | O | generateFlashText 사용, 1초 간격 rate limit |
| backfillImportanceScore 서버 액션 | O | blueprint/lecture=5 고정, 나머지 AI 1~5 |
| 백필 API 엔드포인트 | O | POST /api/admin/curation/backfill |
| 빈 응답 체크 | O | 빈 문자열 시 스킵+failed 카운트 |
| 중복 레코드 제거 (null + 0) | O | Set 기반 중복 필터 |

### Phase 1: UI
| 설계 항목 | 구현 여부 | 비고 |
|-----------|:---------:|------|
| PipelineSidebar 섹션 분리 | O | 커리큘럼/큐레이션/통계 3섹션 |
| getCurriculumContents 서버 액션 | O | source_type 필터 + created_at 정렬 |
| getCurationSummaryStats 서버 액션 | O | 전체/AI요약완료/미처리 |
| CurriculumView 컴포넌트 | O | 레벨 파싱, 진행률 바, 확장/축소 |
| 듀얼모드 스위칭 | O | blueprint/lecture -> CurriculumView, 나머지 -> CurationTab |
| 반응형 (모바일 탭) | O | md: 미만에서 수평 스크롤 탭 |
| npm run build 성공 | O | tsc + build 에러 0 |
| 기존 CurationTab 정상 유지 | O | 변경 없음 |

## 불일치 항목
| 설계 항목 | 차이 | 사유 |
|-----------|------|------|
| 통계 섹션 기본 접힘 | 접이식으로 구현 (설계에는 항상 펼침) | 사이드바 공간 효율 |

## 수정 필요: 없음

## 빌드 검증
- `npx tsc --noEmit`: 에러 0
- `npm run build`: 성공
