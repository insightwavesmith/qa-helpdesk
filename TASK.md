# TASK.md — 콘텐츠 파이프라인 정비 + UI 확장 v2

> 2026-02-22 | 큐레이션 대시보드 카테고리 전면 재구성, 블루프린트 분리, 정보공유 품질 향상, 파이프라인 현황 UI 추가

## 목표
1. 큐레이션 탭이 blueprint, lecture, marketing_theory 등 모든 source_type을 소스 필터로 표시한다.
2. 정보공유 생성 시 RAG로 강의/블루프린트 chunks를 비교하여 충돌·보완 섹션을 추가한다.
3. 큐레이션 좌측에 소스별 파이프라인 현황 패널을 표시하고, 카드 클릭으로 필터가 자동 적용된다.
4. YouTube 10분 이하 영상은 DB에서 삭제되고, 크론도 동일 기준으로 수집을 차단한다.
5. 콘텐츠 탭에는 info_share만 표시된다.

## 레퍼런스
- 참고 패턴 파일: `src/actions/curation.ts` — getCurationContents() 소스 필터 패턴
- 참고 패턴 파일: `src/lib/knowledge.ts` — ConsumerConfig / searchKnowledge() RAG 패턴
- 참고 패턴 파일: `src/components/curation/curation-tab.tsx` — 현재 필터 Select UI 구조
- DB 현황 쿼리: `SELECT source_type, COUNT(*) FROM contents GROUP BY source_type`
- dev.md 규격: `/Users/smith/.openclaw/workspace/rules/dev.md`

## 현재 코드

### `src/actions/curation.ts` — getCurationContents(), getCurationCount()
```ts
// getCurationContents() — source=all일 때도 crawl, youtube만 허용 (← 문제)
export async function getCurationContents({
  source, minScore, period, showDismissed = false, page = 1, pageSize = 100,
}: {
  source?: string; minScore?: number; period?: string;
  showDismissed?: boolean; page?: number; pageSize?: number;
} = {}) {
  // ...
  if (source && source !== "all") {
    query = query.eq("source_type", source);
  } else {
    query = query.in("source_type", ["crawl", "youtube"]); // ← 하드코딩 화이트리스트
  }
  // ...
}

// getCurationCount() — 동일 화이트리스트
export async function getCurationCount() {
  const { count } = await supabase.from("contents")
    .select("id", { count: "exact", head: true })
    .in("curation_status", ["new", "selected"])
    .in("source_type", ["crawl", "youtube"]); // ← blueprint 등 차단됨
}
```

### `src/components/curation/curation-tab.tsx` — sourceFilter SelectContent
```tsx
// 현재 소스 Select — crawl, youtube 두 가지만 있음 (T3 대상)
<SelectContent>
  <SelectItem value="all">전체 소스</SelectItem>
  <SelectItem value="crawl">블로그</SelectItem>
  <SelectItem value="youtube">YouTube</SelectItem>
  {/* blueprint, lecture, marketing_theory 등 없음 */}
</SelectContent>
```

### `src/components/curation/curation-card.tsx` — CurationCardProps
```ts
interface CurationCardProps {
  id: string; title: string; aiSummary: string | null;
  importanceScore: number; keyTopics: string[];
  sourceType: string | null; sourceRef: string | null;
  createdAt: string; selected: boolean;
  onToggle: (id: string) => void;
  // expanded / onToggleExpand 없음 (T5 추가 대상)
}
```

### `src/app/api/admin/curation/generate/route.ts` — 정보공유 생성 로직
```ts
// RAG 없음. body_md 앞 8,000자만 잘라 Claude 직접 호출 (T6 대상)
const contentBlocks = contents.map((c, i) =>
  `### 콘텐츠 ${i+1}: ${c.title}\n${(c.body_md || "").substring(0, 8000)}`
).join("\n\n---\n\n");

// 강의/블루프린트 비교 섹션 없음 (T6 추가 대상)
const response = await fetch(ANTHROPIC_API_URL, {
  body: JSON.stringify({
    model: "claude-sonnet-4-6", max_tokens: 4096,
    system: systemPrompt, messages: [{ role: "user", content: userPrompt }],
  }),
});
```

### `src/lib/knowledge.ts` — ConsumerConfig, sourceTypes
```ts
export type SourceType =
  | "lecture" | "blueprint" | "papers" | "qa" | "qa_question"
  | "qa_answer" | "crawl" | "meeting" | "marketing_theory"
  | "webinar" | "youtube" | "assignment" | "feedback";

// qa consumer — crawl, youtube 제외됨 (현재 상태)
qa: {
  sourceTypes: ["lecture", "blueprint", "papers", "qa", "qa_answer"],
  limit: 5, threshold: 0.4, tokenBudget: 3000, temperature: 0.3,
  enableReranking: true, enableExpansion: true,
  model: "claude-sonnet-4-6", enableThinking: true, thinkingBudget: 5000,
},
// T6에서 정보공유 생성 시 "lecture", "blueprint" sourceTypes로 searchKnowledge() 호출 예정
```

### `src/app/(main)/admin/content/page.tsx` — getContents() 현재 필터
```ts
// 현재: type, status 필터만 있음. source_type 필터 없음 (T8 대상)
const params: { type?: string; status?: string; pageSize?: number } = { pageSize: 100 };
if (typeFilter !== "all") params.type = typeFilter;
if (statusFilter !== "all" && statusFilter !== "sent") params.status = statusFilter;
const { data, count } = await getContents(params);
// info_share 외 다른 source_type도 모두 표시됨 ← T8에서 필터 추가
```

### `scripts/youtube_subtitle_collector.mjs` — 수집 로직
```js
// 현재: getRecentVideos()에서 duration 체크 없음 (T2 대상)
for (const item of data.results || []) {
  const pubDate = new Date(item.published);
  if (pubDate >= cutoff) {
    videos.push({
      videoId: item.videoId, title: item.title,
      published: item.published, channelName,
      // duration 필드 없음
    });
  }
}
// item.duration (초 단위)이 API 응답에 포함되면 600초 이하 스킵 로직 추가 필요
```

## 제약
- **변경 금지**: `src/lib/knowledge.ts`의 qa, newsletter, education 등 기존 consumerConfig — T6에서 새 consumer 추가만 허용
- **변경 금지**: contents 테이블 스키마 — 새 컬럼 추가 없이 기존 컬럼만 사용
- **변경 금지**: RLS 정책 — 수정 없이 기존 requireAdmin() 패턴 유지
- **유지**: getCurationContents()의 showDismissed, page, pageSize, minScore, period 파라미터 동작
- **유지**: CurationCard의 Checkbox 선택, 최대 4개 선택 제한, batchUpdateCurationStatus 연동
- **유지**: 정보공유 생성 API의 기존 출력 형식 (title + body_md) — 비교 섹션은 body_md 내부에 추가
- **유지**: T4(블루프린트 EP 분리)는 Smith님 검토 후 별도 진행. 이 TASK.md에서 실행 금지.
- **임베딩 모델**: gemini-embedding-001 (768차원), Next.js 서버에서 Gemini API 직접 호출
- **DB 삭제 주의**: T1 실행 전 반드시 SELECT로 대상 건수 확인 후 진행

---

## 코드 레벨 파악 결과 (2026-02-22)
- 큐레이션 getCurationContents(): `source_type IN ('crawl', 'youtube')` 하드코딩 → blueprint 등 원천 차단
- 임베딩 모델: gemini-embedding-001 (768차원), Next.js 서버에서 Gemini API 직접 호출
- 정보공유 생성: RAG 미적용, body_md 최대 8,000자 잘라서 Claude 직접 호출
- QA 검색 sourceTypes: lecture, blueprint, papers, qa만 포함 (crawl, youtube 제외)

## 현재 DB 상태
- contents: crawl 55, blueprint 16, youtube 13, file 9, info_share 3, webinar 1 (총 97건)
- knowledge_chunks: lecture 547, crawl 396, blueprint 320, file 140, marketing_theory 122, youtube 112, webinar 98, papers 35, meeting 12, info_share 7, qa 2 (총 1,791)

---

## 태스크

### T1. YouTube 10분 이하 영상 DB 삭제
- 파일: Supabase SQL (run_sql.mjs 또는 직접 실행)
- 의존: 없음 (독립 실행)
- contents에서 source_type='youtube'이고 영상 길이 10분 이하인 항목 삭제
- 해당 contents의 knowledge_chunks도 함께 삭제
- 영상 길이 정보가 DB에 없으면 body_md 길이로 추정 (10분 영상 ≈ 1500단어 이상)
- 삭제 전 대상 건수 확인 후 실행
- 완료 기준:
  - [ ] SELECT로 삭제 대상 건수 확인 (10분 이하 youtube 항목)
  - [ ] 해당 contents.id에 연결된 knowledge_chunks 먼저 삭제
  - [ ] contents 삭제 실행
  - [ ] 삭제 후 SELECT로 남은 youtube 건수 확인

### T2. YouTube 크론 10분 이상 필터
- 파일: `/Users/smith/.openclaw/workspace/scripts/youtube_subtitle_collector.mjs`
- 의존: T1 완료 후 (DB 정리 이후 크론 적용)
- TranscriptAPI 응답 item.duration 확인
- 10분(600초) 이하 영상은 스킵
- 로그: `[스킵] 영상길이 ${duration}초 — ${title}`
- 완료 기준:
  - [ ] getRecentVideos() 내 duration 필드 파싱 코드 추가
  - [ ] 600초 이하 영상 push 건너뜀
  - [ ] duration 없는 경우 fallback 처리 (스킵 or 수집 — 명시)
  - [ ] 스킵 로그 형식 `[스킵] 영상길이 ${duration}초 — ${title}` 정확히 출력

### T3. 큐레이션 카테고리 전면 재구성
- 파일: `src/actions/curation.ts`, `src/components/curation/curation-tab.tsx`
- 의존: 없음 (T1과 병렬 가능)
- **현재 문제**: getCurationContents()에 `source_type IN ('crawl', 'youtube')`가 하드코딩 → blueprint 등 전부 차단
- 변경: 모든 source_type을 허용하되 필터 Select로 선택 가능하게
  - 전체 / 블루프린트 (blueprint) / 자사몰사관학교 (lecture) / 유튜브 (youtube) / 블로그 (crawl) / 마케팅원론 (marketing_theory) / 웨비나 (webinar) / 논문 (papers) / 파일 (file)
- `getCurationContents()` 쿼리에서 source_type 화이트리스트 제거 또는 전체 허용으로 변경
- `getCurationCount()`도 동일하게 수정
- 완료 기준:
  - [ ] getCurationContents()에서 source=all일 때 모든 source_type 반환
  - [ ] getCurationCount()에서 모든 source_type 카운트 포함
  - [ ] curation-tab.tsx Select에 blueprint, lecture, marketing_theory, webinar, papers, file 항목 추가
  - [ ] 각 소스 필터 선택 시 해당 source_type만 표시됨

### T4. 블루프린트 EP별 분리 + 임베딩
- 파일: `src/actions/embed-pipeline.ts`, Supabase contents 테이블
- ⏸ T3 완료 후 진행 (큐레이션에서 blueprint 필터 먼저 활성화) + Smith님 검토 후 별도 추가
- **현재 상태**: blueprint 12건은 Meta 인증 자격증별 덩어리로 저장됨 (EP별 아님)
  - 목차만 있는 4건 삭제 완료 (비즈니스 마케팅전략, AI 퍼포먼스, 기술구현, 미디어측정)
  - 남은 12건: 실제 학습 가이드 (92K~180K자) + 시험 개요
- **목표**: 각 학습 가이드를 EP 커리큘럼(Level 1~4) 매핑에 맞게 섹션별 분리
  - Level 1 (EP 01~10): 디지털 마케팅 어소시에이트 학습 가이드
  - Level 2 (EP 11~20): 미디어바잉 + 크리에이티브 + 미디어플래닝 학습 가이드
  - Level 3 (EP 21~26): 마케팅 사이언스 학습 가이드
  - Level 4 (EP 27~30): 학습 가이드 없음 → lecture(강의) + crawl 기술 블로그로 보완
- **작업 내용**:
  1. 각 학습 가이드 body_md를 섹션 헤딩 기준으로 파싱
  2. EP 커리큘럼과 AI 매핑 (어떤 섹션이 어떤 EP에 해당하는지)
  3. EP별 contents 새 행 생성 (source_type='blueprint', ep_number 태그 포함)
  4. 기존 덩어리 contents는 archive 처리 또는 삭제
  5. 새로 생성된 EP별 contents 임베딩 실행 (POST /api/admin/embed)
- 완료 기준:
  - [ ] Smith님 검토 완료 및 승인 후 시작
  - [ ] EP별 분리 완료 (각 EP별 contents 행 생성)
  - [ ] 기존 덩어리 blueprint archived 처리
  - [ ] 신규 EP별 chunks 임베딩 완료

### T5. 큐레이션 요약 확장 (토글형)
- 파일: `src/components/curation/curation-card.tsx` 또는 `curation-tab.tsx`
- 의존: T3 완료 후 (소스 확장 후 카드 UI 개선)
- **현재 문제**: 큐레이션 목록에서 요약이 너무 짧아 내용 파악 불가
- 변경: 각 큐레이션 항목에 토글 버튼 추가
  - 기본: 제목 + 1~2줄 요약만 표시
  - 토글 시: 핵심 내용 3~5개 포인트 또는 ai_summary 전체 표시
- ai_summary 컬럼 활용 (없으면 body_md 앞 500자)
- 완료 기준:
  - [ ] CurationCard에 expanded state + onToggleExpand prop 추가
  - [ ] 기본 상태: aiSummary 1~2줄(line-clamp-2)만 표시
  - [ ] 토글 시: aiSummary 전체 또는 body_md 앞 500자 표시
  - [ ] ai_summary 없는 경우 body_md fallback 처리

### T6. 정보공유 생성 시 강의/블루프린트 비교 기능
- 파일: `src/app/api/admin/curation/generate/route.ts`, `src/lib/knowledge.ts`
- 의존: T3 완료 후 (blueprint가 큐레이션에 표시된 후)
- **현재 문제**: 원문 8,000자를 그대로 Claude에 넣어 단순 요약만 생성
- 변경: RAG로 강의(lecture) + 블루프린트(blueprint) 관련 chunks 검색 → 원문과 비교
- 생성 결과물에 두 섹션 추가:
  1. 정보공유 본문 (기존)
  2. "강의 내용과 비교" 섹션: 충돌하거나 보완할 내용이 있으면 "💡 이건 수정하면 좋을 듯: [내용]" 형태로 표기
  3. 비교할 내용이 없으면 섹션 생략
- 완료 기준:
  - [ ] generate/route.ts에서 knowledge.ts의 searchKnowledge() 또는 유사 함수 호출
  - [ ] sourceTypes: ["lecture", "blueprint"]로 RAG 검색 실행
  - [ ] 검색된 chunks가 있을 때만 비교 섹션 프롬프트에 포함
  - [ ] 비교 결과가 있으면 body_md 하단에 "## 강의 내용과 비교" 섹션 추가
  - [ ] 비교 결과 없으면 섹션 생략 (기존 출력만)

### T7. 콘텐츠 파이프라인 UI (큐레이션 좌측 패널)
- 파일: 신규 `src/components/curation/pipeline-sidebar.tsx`
- 의존: T3 완료 후 (소스 목록 확정 후)
- 위치: 큐레이션 탭 왼쪽에 사이드 패널로 추가 (별도 탭 아님)
- 내용:
  - 수집 소스별 분류 카드 (블루프린트, 마케팅원론, 유튜브, 블로그 등)
  - 각 소스별 콘텐츠 수 + chunks 수 표시
  - 신규 업데이트 노티 (24시간 내 추가된 것은 "NEW" 뱃지)
  - 카드 클릭 시 해당 source_type으로 큐레이션 필터 자동 적용
- API: source_type별 count 조회 서버 액션 필요
- 완료 기준:
  - [ ] pipeline-sidebar.tsx 신규 생성
  - [ ] source_type별 contents 수 + knowledge_chunks 수 서버 액션 추가
  - [ ] 24시간 내 신규 콘텐츠 "NEW" 뱃지 표시
  - [ ] 카드 클릭 시 부모(CurationTab) sourceFilter 상태 변경
  - [ ] 큐레이션 탭 레이아웃에 좌측 패널 추가

### T8. 콘텐츠 탭 프로세스 정리
- 파일: `src/app/(main)/admin/content/page.tsx`
- 의존: 없음 (독립 실행)
- 콘텐츠 탭에는 info_share(정보공유 가공본)만 표시되도록 필터 추가
- DB 삭제 없이 UI 필터링만 (기존 데이터 보존)
- 완료 기준:
  - [ ] getContents() 호출 시 source_type='info_share' 필터 추가
  - [ ] 필터링 후 기존 type/status 필터도 정상 동작
  - [ ] 다른 source_type(lecture, crawl 등) 콘텐츠는 콘텐츠 탭에 미표시

---

## 작업 순서
T1(DB삭제) → T2(크론) → T3(큐레이션 카테고리) → T5(요약 토글) → T6(정보공유 비교) → T7(파이프라인 UI) → T8(콘텐츠탭)
※ T4(블루프린트 분리)는 Smith님 검토 후 별도 추가

## 수정 대상 파일
- `scripts/youtube_subtitle_collector.mjs` (T2)
- `src/actions/curation.ts` (T3, T4, T7)
- `src/components/curation/curation-tab.tsx` (T3, T5)
- `src/components/curation/curation-card.tsx` (T5) — 존재함 (신규 아님)
- `src/app/api/admin/curation/generate/route.ts` (T6)
- `src/lib/knowledge.ts` (T6)
- `src/app/(main)/admin/content/page.tsx` (T8)
- 신규: `src/components/curation/pipeline-sidebar.tsx` (T7)

## 체크리스트
- [ ] T1: YouTube 10분 이하 삭제 완료
- [ ] T2: 크론에 10분 필터 추가
- [ ] T3: 큐레이션 필터가 모든 source_type 지원
- [ ] T4: 블루프린트가 큐레이션에 개별 항목으로 표시됨
- [ ] T5: 큐레이션 항목에 토글로 핵심 내용 표시
- [ ] T6: 정보공유 생성 결과에 강의 비교 섹션 포함
- [ ] T7: 큐레이션 좌측에 파이프라인 현황 패널 표시
- [ ] T8: 콘텐츠 탭에 info_share만 표시
- [ ] 전체 빌드 성공
- [ ] Vercel 배포 + QA 통과

---

## 엣지 케이스

### T1/T2 — YouTube 길이 필터

| 상황 | 기대 동작 |
|------|-----------|
| TranscriptAPI 응답에 duration 필드가 없음 (null/undefined) | 해당 영상을 스킵하지 않고 수집 (보수적) + 로그 `[duration 없음] 수집 진행 — ${title}` |
| duration이 정확히 600초 (10분) | 경계값 포함 스킵 (`duration <= 600` 조건) |
| body_md 길이로 10분 추정 시 기준값 부재 (단어 수 불명) | 1500 단어(영어 기준) or 7500자(한국어) 미만을 10분 이하로 간주, 확인 후 삭제 |
| YouTube 영상이 DB에 있지만 knowledge_chunks가 없음 | contents만 삭제 (chunks DELETE 실행해도 0건 삭제로 정상 처리) |

### T3 — 큐레이션 소스 필터

| 상황 | 기대 동작 |
|------|-----------|
| source_type이 info_share인 contents가 curation_status='new' | 큐레이션 탭에서 "전체 소스"로 조회 시 표시됨 (필터 제거 후 info_share도 포함) |
| 특정 source_type의 contents가 0건 | 해당 Select 항목은 표시되되 선택 시 빈 목록 + "결과 없음" 메시지 |
| getCurationCount() 변경 후 배지 숫자 급증 | 의도된 결과 (기존엔 crawl+youtube만 카운트, 변경 후 전체 카운트) |

### T5 — 큐레이션 카드 토글

| 상황 | 기대 동작 |
|------|-----------|
| ai_summary가 null이고 body_md도 null | 토글 시 "요약 없음" 텍스트 표시 |
| ai_summary가 50자 미만 (이미 짧음) | 토글 버튼 비활성화 또는 숨김 처리 |
| 여러 카드를 동시에 토글 | 각 카드 독립적으로 expanded 상태 유지 (서로 영향 없음) |

### T6 — 정보공유 생성 RAG 비교

| 상황 | 기대 동작 |
|------|-----------|
| RAG 검색 결과가 0건 (관련 강의/블루프린트 없음) | 비교 섹션 생략, 기존 정보공유 본문만 반환 |
| RAG 검색 시 지연으로 60초 maxDuration 초과 우려 | RAG timeout 10초 설정, timeout 시 비교 없이 기존 생성만 반환 |
| 콘텐츠 4개 선택 + RAG 컨텍스트 추가로 토큰 초과 | 원문 8,000자 → 4,000자로 줄이고 RAG chunks 추가 |

### T8 — 콘텐츠 탭 필터

| 상황 | 기대 동작 |
|------|-----------|
| info_share 콘텐츠가 0건 | 빈 테이블 + "정보공유 가공본이 없습니다" 메시지 |
| type 필터 + info_share 필터 동시 적용 | AND 조건으로 type AND source_type='info_share' 필터링 |

---

## 리뷰 보고서
[에이전트팀 리더가 작성한 리뷰 보고서. 리뷰 전에는 비워두고, 리뷰 후 채움.]
- 보고서 파일: `mozzi-reports/public/reports/review/2026-02-22-content-pipeline-v2.html`
- 리뷰 일시: (리뷰 후 기재)
- 변경 유형: 혼합 (백엔드 구조 + UI/UX + DB)
- 피드백 요약: (에이전트팀이 이해한 내용 + 지적 사항 기재)
- 반영 여부: (반영함 / 미반영 사유 기재)

---

## 검증

☐ `npm run build` 성공 (tsc 오류 0, 린트 경고 0)
☐ 기존 기능 안 깨짐 (QA 답변 생성, 콘텐츠 발행 흐름 정상)

### T2 — YouTube 크론 필터
☐ `node scripts/youtube_subtitle_collector.mjs` 실행 → 10분 이하 영상에 `[스킵] 영상길이 X초 — 제목` 로그 출력됨

### T3 — 큐레이션 소스 필터
☐ `https://qa-helpdesk.vercel.app/admin/content` 접속 → 큐레이션 탭 → "소스" Select에 "블루프린트", "자사몰사관학교", "마케팅원론" 항목 표시됨
☐ "블루프린트" 선택 → source_type='blueprint' 콘텐츠 목록만 표시됨
☐ "전체 소스" 선택 → 모든 source_type 콘텐츠 표시됨 (crawl+youtube만 아님)

### T5 — 큐레이션 카드 토글
☐ 큐레이션 탭에서 카드 토글 버튼 클릭 → ai_summary 전체 내용 펼쳐짐
☐ 다시 클릭 → 1~2줄으로 접힘
☐ ai_summary 없는 카드 → 토글 시 body_md 앞 500자 또는 "요약 없음" 표시됨

### T6 — 정보공유 생성 RAG 비교
☐ 큐레이션 탭에서 콘텐츠 1~4개 선택 → "정보공유 생성" 클릭 → 생성 결과 미리보기에 "## 강의 내용과 비교" 섹션 포함됨 (관련 강의 있을 때)
☐ 관련 강의/블루프린트 chunks가 없는 콘텐츠만 선택 시 → "## 강의 내용과 비교" 섹션 없이 본문만 반환됨

### T7 — 파이프라인 현황 패널
☐ 큐레이션 탭 좌측에 소스별 카드 패널 표시됨 (블루프린트, 유튜브, 블로그 등)
☐ 각 소스 카드에 "콘텐츠 N개 / chunks M개" 표시됨
☐ 24시간 내 추가된 소스 카드에 "NEW" 뱃지 표시됨
☐ 소스 카드 클릭 → 우측 큐레이션 목록이 해당 source_type으로 자동 필터링됨

### T8 — 콘텐츠 탭 필터
☐ 콘텐츠 탭 접속 → source_type='info_share'인 항목만 테이블에 표시됨
☐ lecture, crawl, blueprint 등 다른 source_type 항목은 표시 안 됨
☐ type/status 필터 조작 시 여전히 info_share 내에서만 필터링됨
