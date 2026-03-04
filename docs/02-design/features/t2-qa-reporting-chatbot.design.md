# T2. QA 리포팅 챗봇 (채널톡 스타일) — 설계서

## 1. 데이터 모델

### 1.1 qa_reports 테이블 (신규)

```sql
CREATE TABLE public.qa_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  -- 작성자
  author_id UUID REFERENCES public.profiles(id) NOT NULL,

  -- AI 구조화 결과
  title TEXT NOT NULL,                    -- QA 항목 제목 (Sonnet 추출)
  description TEXT NOT NULL,              -- QA 항목 설명 (Sonnet 추출)
  severity TEXT NOT NULL DEFAULT 'medium' -- 심각도: critical / high / medium / low
    CHECK (severity IN ('critical', 'high', 'medium', 'low')),

  -- 원본 입력
  raw_message TEXT NOT NULL,              -- 사용자 원본 메시지
  image_urls TEXT[] DEFAULT '{}',         -- 스크린샷 URL 배열 (Supabase Storage)

  -- 상태 관리
  status TEXT NOT NULL DEFAULT 'open'     -- open / in_progress / resolved / closed
    CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),

  -- 메타
  page_url TEXT,                          -- 이슈 발견 페이지 URL (선택)
  ai_raw_response JSONB                   -- Sonnet 원본 응답 (디버깅용)
);

-- 인덱스
CREATE INDEX idx_qa_reports_status ON public.qa_reports(status);
CREATE INDEX idx_qa_reports_created_at ON public.qa_reports(created_at DESC);
CREATE INDEX idx_qa_reports_author_id ON public.qa_reports(author_id);

-- RLS
ALTER TABLE public.qa_reports ENABLE ROW LEVEL SECURITY;

-- 관리자만 접근
CREATE POLICY "qa_reports_admin_all" ON public.qa_reports
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'assistant')
    )
  );

-- updated_at 트리거
CREATE OR REPLACE FUNCTION update_qa_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

CREATE TRIGGER qa_reports_updated_at
  BEFORE UPDATE ON public.qa_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_qa_reports_updated_at();
```

### 1.2 Supabase Storage

기존 `question-images` 버킷 패턴 재사용:
- 버킷명: `qa-screenshots`
- 경로: `{author_id}/{timestamp}-{filename}`
- MIME: `image/png`, `image/jpeg`, `image/webp`
- 최대 크기: 5MB

## 2. API 설계

### 2.1 QA 챗봇 AI 처리 — POST `/api/qa-chatbot`

Sonnet 모델로 사용자 입력을 구조화된 QA 항목으로 변환.

**요청**:
```typescript
{
  message: string;       // 사용자 원본 메시지
  imageUrls?: string[];  // 첨부 스크린샷 URL
  pageUrl?: string;      // 현재 페이지 URL
}
```

**응답** (200):
```typescript
{
  title: string;           // 추출된 QA 제목
  description: string;     // 구조화된 설명
  severity: "critical" | "high" | "medium" | "low";
}
```

**Sonnet 프롬프트**:
```
당신은 QA 리포트 정리 도우미입니다.
사용자가 보내는 버그/이슈 내용을 구조화된 QA 항목으로 정리하세요.

응답 JSON 형식:
{
  "title": "간결한 이슈 제목 (20자 이내)",
  "description": "이슈 설명. 재현 조건, 기대 동작, 실제 동작 포함",
  "severity": "critical|high|medium|low"
}

심각도 기준:
- critical: 서비스 이용 불가, 데이터 손실
- high: 주요 기능 오동작, 보안 이슈
- medium: UI 깨짐, 사소한 기능 이슈
- low: 오타, 미세한 스타일 이슈
```

**인증**: admin/assistant 역할 확인 (서버사이드)

### 2.2 Server Actions — `src/actions/qa-reports.ts`

```typescript
"use server";

// QA 리포트 생성
export async function createQaReport(data: {
  rawMessage: string;
  title: string;
  description: string;
  severity: string;
  imageUrls: string[];
  pageUrl?: string;
  aiRawResponse?: Record<string, unknown>;
}): Promise<{ id: string } | { error: string }>

// QA 리포트 목록 조회 (최신순, 페이지네이션)
export async function getQaReports(options?: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<QaReport[]>

// QA 리포트 상태 변경
export async function updateQaReportStatus(
  reportId: string,
  status: "open" | "in_progress" | "resolved" | "closed"
): Promise<{ success: boolean } | { error: string }>
```

### 2.3 이미지 업로드

기존 질문 이미지 업로드 패턴 재사용 (`src/actions/questions.ts`의 `uploadQuestionImage` 참고):
- Supabase Storage `qa-screenshots` 버킷에 업로드
- 클라이언트에서 직접 업로드 (signed URL 또는 public bucket)

## 3. 컴포넌트 구조

### 3.1 컴포넌트 트리

```
src/app/(main)/layout.tsx
  └── {role === 'admin' || role === 'assistant' ? <QaChatButton /> : null}

src/components/qa-chatbot/
  ├── QaChatButton.tsx          — 플로팅 버튼 (우하단)
  ├── QaChatPanel.tsx           — 채팅 패널 (슬라이드업)
  │   ├── ChatMessageInput.tsx  — 텍스트 입력 + 이미지 첨부
  │   ├── ChatMessage.tsx       — 메시지 버블 (사용자/AI)
  │   └── QaReportCard.tsx      — AI가 정리한 QA 항목 카드
  └── QaReportList.tsx          — QA 목록 탭 (패널 내)
```

### 3.2 QaChatButton

```typescript
// 플로팅 버튼 — 우하단 고정
interface QaChatButtonProps {
  // 없음 — 내부 상태로 패널 토글
}

// 상태: isOpen (패널 열림/닫힘)
// 위치: fixed bottom-6 right-6 z-50
// 스타일: 원형 56px, Primary #F75D5D, 흰색 아이콘
// 애니메이션: pulse (새 리포트 미확인 시)
// 모바일: bottom-4 right-4, 48px
```

### 3.3 QaChatPanel

```typescript
interface QaChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

// 패널 구조:
// ┌─────────────────────────┐
// │ QA 리포팅        [목록] [X] │  ← 헤더 (탭 전환: 채팅/목록)
// ├─────────────────────────┤
// │                         │
// │  [사용자 메시지 버블]     │  ← 채팅 영역 (스크롤)
// │  [AI 정리 카드]          │
// │  [확인/수정/재입력]       │
// │                         │
// ├─────────────────────────┤
// │ [📎] [메시지 입력...]  [→] │  ← 입력 영역
// └─────────────────────────┘

// 위치: fixed bottom-20 right-6, w-[380px] h-[520px]
// 모바일: bottom-0 right-0 left-0, full-width, h-[70vh]
// 애니메이션: slide-up + fade-in
// z-index: 50
```

### 3.4 채팅 플로우

```
1. 사용자가 텍스트 입력 (+ 선택적 이미지 첨부)
2. "전송" 클릭
3. 사용자 메시지 버블 표시
4. "AI 분석 중..." 로딩 표시
5. POST /api/qa-chatbot 호출 (Sonnet)
6. AI 응답 → QaReportCard로 표시:
   ┌─────────────────────┐
   │ 🔴 [severity]        │
   │ 제목: ...            │
   │ 설명: ...            │
   │                     │
   │ [제출] [수정] [취소]  │
   └─────────────────────┘
7. "제출" 클릭 → createQaReport() → DB 저장
8. "수정" 클릭 → description 인라인 편집 모드
9. 저장 성공 → "저장되었습니다" 확인 메시지
```

### 3.5 QaReportList

```typescript
// 패널 내 "목록" 탭 전환 시 표시
// 최신순 리스트, 각 항목:
// - 날짜 (상대 시간)
// - 제목
// - 심각도 뱃지 (색상 코딩)
// - 상태 뱃지 (open/in_progress/resolved/closed)
// - 클릭 시 상세 보기 (패널 내)
```

### 3.6 상태 관리

```typescript
// QaChatButton 내부 상태
const [isOpen, setIsOpen] = useState(false);

// QaChatPanel 내부 상태
const [activeTab, setActiveTab] = useState<"chat" | "list">("chat");
const [messages, setMessages] = useState<ChatMessage[]>([]);
const [isLoading, setIsLoading] = useState(false);
const [pendingReport, setPendingReport] = useState<PendingQaReport | null>(null);

// 타입
interface ChatMessage {
  id: string;
  role: "user" | "ai";
  content: string;
  imageUrls?: string[];
  timestamp: Date;
}

interface PendingQaReport {
  title: string;
  description: string;
  severity: string;
  rawMessage: string;
  imageUrls: string[];
}
```

## 4. 에러 처리

| 에러 상황 | 에러 코드 | 사용자 메시지 |
|-----------|-----------|---------------|
| 인증 실패 (비관리자) | 403 | 챗봇 버튼 미표시 (에러 메시지 없음) |
| Sonnet API 실패 | 500 | "AI 분석에 실패했습니다. 다시 시도해주세요." |
| Sonnet 응답 파싱 실패 | 422 | "AI 응답을 처리할 수 없습니다. 직접 제출하시겠습니까?" → 수동 폼 전환 |
| 이미지 업로드 실패 | 500 | "이미지 업로드에 실패했습니다. 텍스트만 전송하시겠습니까?" |
| DB 저장 실패 | 500 | "저장에 실패했습니다. 다시 시도해주세요." |
| Sonnet 타임아웃 (10초) | 408 | "AI 응답 시간이 초과되었습니다. 다시 시도해주세요." |

## 5. 구현 순서

### Phase 1: DB + API (백엔드)
- [ ] 1. Supabase `qa_reports` 테이블 생성 (마이그레이션 SQL)
- [ ] 2. Supabase Storage `qa-screenshots` 버킷 생성
- [ ] 3. `src/actions/qa-reports.ts` — Server Actions (createQaReport, getQaReports, updateQaReportStatus)
- [ ] 4. `src/app/api/qa-chatbot/route.ts` — Sonnet API 엔드포인트

### Phase 2: UI 컴포넌트 (프론트엔드)
- [ ] 5. `src/components/qa-chatbot/QaChatButton.tsx` — 플로팅 버튼
- [ ] 6. `src/components/qa-chatbot/QaChatPanel.tsx` — 채팅 패널 + 메시지 입력
- [ ] 7. `src/components/qa-chatbot/QaReportList.tsx` — QA 목록 뷰
- [ ] 8. `src/app/(main)/layout.tsx` — 챗봇 버튼 삽입 (admin/assistant 조건)

### Phase 3: QA
- [ ] 9. `npm run build` 성공 확인
- [ ] 10. 관리자 로그인 → 챗봇 동작 검증
- [ ] 11. 수강생 로그인 → 챗봇 미표시 확인
- [ ] 12. 스크린샷 QA (데스크탑 + 모바일)
