-- T2: QA 리포팅 챗봇 — qa_reports 테이블 생성

CREATE TABLE public.qa_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  -- 작성자
  author_id UUID REFERENCES public.profiles(id) NOT NULL,

  -- AI 구조화 결과
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('critical', 'high', 'medium', 'low')),

  -- 원본 입력
  raw_message TEXT NOT NULL,
  image_urls TEXT[] DEFAULT '{}',

  -- 상태 관리
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),

  -- 메타
  page_url TEXT,
  ai_raw_response JSONB
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
