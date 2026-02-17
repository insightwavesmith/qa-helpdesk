import { z } from "zod";

// ─── T1: Zod 스키마 정의 ───

export const EducationOutputSchema = z.object({
  hook: z.string(),
  intro: z.string(),
  insight: z.object({
    subtitle: z.string(),
    body: z.string(),
    tipBox: z.string(),
  }),
  keyPoint: z.object({
    items: z.array(z.object({ title: z.string(), desc: z.string() })).min(2).max(4),
  }),
  checklist: z.object({
    items: z.array(z.string()).min(3).max(7),
  }),
  closing: z.string(),
});

export const WebinarOutputSchema = z.object({
  hook: z.string(),
  intro: z.string(),
  lecturePreview: z.object({
    tags: z.array(z.string()).min(2),
  }),
  coreTopics: z.object({
    items: z.array(z.object({ title: z.string(), desc: z.string() })).min(2).max(4),
  }),
  targetAudience: z.object({
    items: z.array(z.string()).min(3).max(5),
  }),
  schedule: z.object({
    date: z.string(),
    format: z.string(),
    fee: z.string(),
    participation: z.string(),
  }),
  closing: z.string(),
});

export const CaseStudyOutputSchema = z.object({
  greeting: z.string().optional().default("안녕하세요 대표님, 자사몰사관학교입니다."),
  emotionHook: z.string(),
  background: z.string(),
  studentQuote: z.string(),
  performance: z.object({
    tables: z.array(z.object({
      title: z.string(),
      rows: z.array(z.object({
        metric: z.string(),
        before: z.string(),
        after: z.string(),
      })),
    })),
  }),
  interview: z.object({
    quotes: z.array(z.object({
      text: z.string(),
      author: z.string(),
    })).min(2).max(4),
  }),
  coreChanges: z.object({
    items: z.array(z.object({ title: z.string(), desc: z.string() })).min(2).max(4),
  }),
});

// ─── 타입 ───

export type EducationOutput = z.infer<typeof EducationOutputSchema>;
export type WebinarOutput = z.infer<typeof WebinarOutputSchema>;
export type CaseStudyOutput = z.infer<typeof CaseStudyOutputSchema>;

// ─── 유틸 함수 ───

export function getSchemaByType(contentType: string) {
  switch (contentType) {
    case "education": return EducationOutputSchema;
    case "webinar": return WebinarOutputSchema;
    case "case_study": return CaseStudyOutputSchema;
    default: return null;
  }
}

export function parseAIResponse(
  rawText: string,
  contentType: string
): { success: true; data: unknown } | { success: false; error: string } {
  // 1. JSON 코드블록 추출 (대소문자 무시)
  const jsonBlockMatch = rawText.match(/```(?:json|JSON)?\s*\n?([\s\S]*?)```/i);
  if (!jsonBlockMatch) {
    return {
      success: false,
      error: "JSON 코드블록을 찾을 수 없습니다. ```json으로 시작하고 ```으로 끝나는 코드블록으로 응답해주세요.",
    };
  }

  // 2. JSON.parse
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonBlockMatch[1].trim());
  } catch (e) {
    return {
      success: false,
      error: `JSON 파싱 실패: ${e instanceof Error ? e.message : "유효하지 않은 JSON"}`,
    };
  }

  // 3. Zod 검증
  const schema = getSchemaByType(contentType);
  if (!schema) {
    return { success: false, error: `알 수 없는 콘텐츠 타입: ${contentType}` };
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) =>
        `- ${String(issue.path.join("."))}: ${issue.message}`
      )
      .join("\n");
    return { success: false, error: `스키마 검증 실패:\n${issues}` };
  }

  return { success: true, data: result.data };
}

// ─── T4: JSON → 마크다운 변환 ───

export function convertJsonToEmailSummary(data: unknown, contentType: string): string {
  switch (contentType) {
    case "education":
      return convertEducation(data as EducationOutput);
    case "webinar":
      return convertWebinar(data as WebinarOutput);
    case "case_study":
      return convertCaseStudy(data as CaseStudyOutput);
    default:
      return convertEducation(data as EducationOutput);
  }
}

function convertEducation(d: EducationOutput): string {
  const lines: string[] = [];

  lines.push(d.hook);
  lines.push("");
  lines.push(d.intro);
  lines.push("");

  // INSIGHT
  lines.push("### INSIGHT");
  lines.push(`## ${d.insight.subtitle}`);
  lines.push(d.insight.body);
  lines.push(`> 💡 ${d.insight.tipBox}`);
  lines.push("");

  // KEY POINT
  lines.push("### KEY POINT");
  d.keyPoint.items.forEach((item, i) => {
    lines.push(`${String(i + 1).padStart(2, "0")}. ${item.title} | ${item.desc}`);
  });
  lines.push("");

  // CHECKLIST
  lines.push("### CHECKLIST");
  d.checklist.items.forEach((item) => {
    lines.push(`✅ ${item}`);
  });
  lines.push("");

  lines.push(d.closing);

  return lines.join("\n");
}

function convertWebinar(d: WebinarOutput): string {
  const lines: string[] = [];

  lines.push(d.hook);
  lines.push("");
  lines.push(d.intro);
  lines.push("");

  // 강의 미리보기
  lines.push("### 강의 미리보기");
  lines.push("강의 슬라이드 미리보기");
  lines.push(`${d.lecturePreview.tags.join(" · ")} 슬라이드`);
  lines.push("");

  // 핵심 주제
  lines.push("### 핵심 주제");
  d.coreTopics.items.forEach((item, i) => {
    lines.push(`${String(i + 1).padStart(2, "0")}. ${item.title} | ${item.desc}`);
  });
  lines.push("");

  // 이런 분들을 위해
  lines.push("### 이런 분들을 위해");
  d.targetAudience.items.forEach((item) => {
    lines.push(`- ${item}`);
  });
  lines.push("");

  // 웨비나 일정
  lines.push("### 웨비나 일정");
  lines.push("| 항목 | 내용 |");
  lines.push("| --- | --- |");
  lines.push(`| 📅 일시 | **${d.schedule.date}** |`);
  lines.push(`| 🔴 형식 | ${d.schedule.format} |`);
  lines.push(`| 👍 참가비 | **${d.schedule.fee}** |`);
  lines.push(`| 🔗 참여 | ${d.schedule.participation} |`);
  lines.push("");

  lines.push(d.closing);

  return lines.join("\n");
}

function convertCaseStudy(d: CaseStudyOutput): string {
  const lines: string[] = [];

  // hookLine — greeting 미포함 (buildDesignFromSummary가 createGreetingRow() 하드코딩)
  lines.push(d.emotionHook);
  lines.push("");
  lines.push(d.background);
  lines.push("");
  lines.push(`> "${d.studentQuote}"`);
  lines.push("");

  // 성과
  lines.push("### 성과");
  for (const table of d.performance.tables) {
    lines.push(`#### ${table.title}`);
    lines.push("| 지표 | Before | After |");
    lines.push("| --- | --- | --- |");
    for (const row of table.rows) {
      lines.push(`| ${row.metric} | ${row.before} | **${row.after}** |`);
    }
  }
  lines.push("");

  // INTERVIEW
  lines.push("### INTERVIEW");
  for (const quote of d.interview.quotes) {
    lines.push(`> "${quote.text}"`);
    lines.push(`> — ${quote.author}`);
    lines.push("");
  }

  // 핵심 변화
  lines.push("### 핵심 변화");
  d.coreChanges.items.forEach((item, i) => {
    lines.push(`${String(i + 1).padStart(2, "0")}. ${item.title} | ${item.desc}`);
  });

  return lines.join("\n");
}
