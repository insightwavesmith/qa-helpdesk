# TASK: Phase 1 — 콘텐츠 허브 인프라

> 설계 문서: `docs/02-design/content-hub-architecture.md`
> Supabase URL: https://symvlrsmkjlztoopbnht.supabase.co
> Supabase Service Key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5bXZscnNta2psenRvb3Bibmh0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTYwODYyMiwiZXhwIjoyMDgxMTg0NjIyfQ.FJLi7AiKw98JqUqPdkj2MBj9fDW6ZSsfgzUDVSFKc8Q

## 주의사항 (매우 중요)
- **기존 파일 수정 최소화** — 새 파일 추가 위주로 작업
- **기존 기능 절대 깨뜨리지 않기** — posts, email, protractor 등 다 정상 동작해야 함
- **빌드 + lint 통과 필수**
- 한국어 UI, #F75D5D primary, Pretendard 폰트

## 작업 순서

### 1. DB 테이블 생성 (curl로 Supabase SQL 실행)

```sql
-- 콘텐츠 허브 테이블
CREATE TABLE IF NOT EXISTS contents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  body_md text NOT NULL,
  summary text,
  thumbnail_url text,
  category text NOT NULL DEFAULT 'general',
  tags text[] DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft',
  source_type text,
  source_ref text,
  source_hash text,
  author_id uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contents_category ON contents(category);
CREATE INDEX IF NOT EXISTS idx_contents_status ON contents(status);
CREATE INDEX IF NOT EXISTS idx_contents_tags ON contents USING GIN(tags);

ALTER TABLE contents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON contents FOR ALL USING (true);

-- 배포 기록 테이블
CREATE TABLE IF NOT EXISTS distributions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  content_id uuid REFERENCES contents(id) ON DELETE CASCADE,
  channel text NOT NULL,
  channel_ref text,
  rendered_title text,
  rendered_body text,
  status text NOT NULL DEFAULT 'pending',
  distributed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_distributions_content ON distributions(content_id);
CREATE INDEX IF NOT EXISTS idx_distributions_channel ON distributions(channel);

ALTER TABLE distributions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON distributions FOR ALL USING (true);

-- 이메일 발송 이력 테이블
CREATE TABLE IF NOT EXISTS email_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  content_id uuid REFERENCES contents(id),
  subject text NOT NULL,
  template text NOT NULL DEFAULT 'newsletter',
  html_body text NOT NULL,
  recipient_count integer DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  sent_at timestamptz,
  created_at timestamptz DEFAULT now(),
  attachments jsonb DEFAULT '[]'
);

ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON email_logs FOR ALL USING (true);

-- posts 테이블에 content_id 컬럼 추가 (기존 데이터 호환)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS content_id uuid REFERENCES contents(id);
```

SQL은 curl로 Supabase REST API를 통해 실행:
```bash
curl -X POST 'https://symvlrsmkjlztoopbnht.supabase.co/rest/v1/rpc/exec_sql' \
  -H 'apikey: SERVICE_KEY' \
  -H 'Authorization: Bearer SERVICE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"query": "SQL_HERE"}'
```

만약 rpc/exec_sql이 없으면, 개별 SQL 문을 Supabase Dashboard SQL Editor에서 실행하거나, `psql`로 직접 실행.

### 2. TypeScript 타입 정의
`src/types/content.ts` (새 파일):
```typescript
export interface Content {
  id: string;
  title: string;
  body_md: string;
  summary: string | null;
  thumbnail_url: string | null;
  category: string;
  tags: string[];
  status: 'draft' | 'review' | 'ready' | 'archived';
  source_type: string | null;
  source_ref: string | null;
  source_hash: string | null;
  author_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Distribution {
  id: string;
  content_id: string;
  channel: string;
  channel_ref: string | null;
  rendered_title: string | null;
  rendered_body: string | null;
  status: 'pending' | 'published' | 'sent' | 'failed';
  distributed_at: string | null;
  created_at: string;
}

export interface EmailLog {
  id: string;
  content_id: string | null;
  subject: string;
  template: string;
  html_body: string;
  recipient_count: number;
  status: 'draft' | 'sent' | 'failed';
  sent_at: string | null;
  created_at: string;
  attachments: { filename: string; url: string; size: number }[];
}
```

### 3. 콘텐츠 서버 액션 (새 파일)
`src/actions/contents.ts`:
- `getContents({ category, status, page, pageSize })` — 콘텐츠 목록 조회
- `getContentById(id)` — 단일 콘텐츠 조회
- `createContent(data)` — 콘텐츠 생성
- `updateContent(id, data)` — 콘텐츠 수정
- `deleteContent(id)` — 콘텐츠 삭제
- `publishToPost(contentId)` — 콘텐츠 → 정보공유 게시 (posts에 insert + distributions 기록)
- `generateNewsletterFromContents(contentIds)` — 여러 콘텐츠 → 뉴스레터 HTML 생성

모두 `createServiceClient()` 사용 (service role).

### 4. 콘텐츠 동기화 스크립트 (새 파일)
`scripts/sync-contents.ts`:
- `/Users/smith/Library/Mobile Documents/com~apple~CloudDocs/claude/brand-school/marketing/knowledge/` 하위 .md 파일 스캔
- 각 파일을 contents 테이블에 upsert (source_hash로 변경 감지)
- 카테고리는 디렉토리명으로 결정:
  - blueprint/ → 'blueprint'
  - blogs/ → 'trend'
  - 기타 → 'general'
- 실행: `npx tsx scripts/sync-contents.ts`

### 5. AI 작성 API 수정 (기존 파일 수정 — 최소)
`src/app/api/admin/email/ai-write/route.ts`:
- 기존 로컬 파일 읽기 로직 → contents DB 조회로 변경
- 카테고리 필터링 유지
- fallback: DB에 없으면 기본 템플릿 반환

### 6. 파일 첨부 API (새 파일)
`src/app/api/admin/email/upload/route.ts`:
- multipart/form-data로 파일 받기
- Supabase Storage `email-attachments` 버킷에 업로드
- 10MB 제한, MIME 타입 검증
- public URL 반환

`src/app/api/admin/email/send/route.ts` (기존 파일 수정 — 최소):
- request body에 `attachments` 배열 추가 처리
- nodemailer에 attachments 전달

## 완료 조건
- [ ] `npm run build` 성공
- [ ] tsc 타입체크 통과
- [ ] lint 에러 없음
- [ ] 기존 페이지들 정상 동작 (기존 기능 깨지면 안 됨)
- [ ] `git add -A && git commit -m "feat: 콘텐츠 허브 인프라 (Phase 1)" && git push`
- [ ] 완료 후: `openclaw gateway wake --text "Done: Phase 1 콘텐츠 허브 인프라 완료" --mode now`
