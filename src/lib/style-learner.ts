// style-learner.ts — 승인된 답변에서 말투 패턴을 분석하고 QA_SYSTEM_PROMPT에 반영
// 필요 테이블: style_profiles (id uuid PK, profile jsonb, style_text text, answer_count int, created_at timestamptz)
//
// CREATE TABLE IF NOT EXISTS style_profiles (
//   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
//   profile jsonb NOT NULL DEFAULT '{}',
//   style_text text NOT NULL DEFAULT '',
//   answer_count int NOT NULL DEFAULT 0,
//   created_at timestamptz DEFAULT now()
// );

import { createServiceClient } from "@/lib/db";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANALYSIS_MODEL = "claude-sonnet-4-6";

// ─── 타입 ──────────────────────────────────────────────────

export interface StyleProfile {
  endings: Record<string, number>;
  toneRules: string[];
  examples: string[];
  analyzedAt: string;
  answerCount: number;
}

interface WeightedAnswer {
  content: string;
  weight: number;
  authorId: string | null;
  isAi: boolean;
}

// ─── 1. 승인된 답변 수집 ──────────────────────────────────

export async function analyzeApprovedAnswers(
  limit = 50,
): Promise<WeightedAnswer[]> {
  const svc = createServiceClient();

  // admin 사용자 ID 조회 (Smith님)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: admins } = await (svc as any)
    .from("profiles")
    .select("id")
    .eq("role", "admin");
  const adminIds = new Set((admins || []).map((a: { id: string }) => a.id));

  // 최근 승인 답변 조회 (최신순)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: answers, error } = await (svc as any)
    .from("answers")
    .select("content, author_id, is_ai, updated_at")
    .eq("is_approved", true)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[StyleLearner] 답변 조회 실패:", error);
    return [];
  }

  if (!answers || answers.length === 0) return [];

  return answers.map(
    (a: {
      content: string;
      author_id: string | null;
      is_ai: boolean | null;
    }) => {
      // 가중치: admin 직접 작성 > admin 수정 후 승인 > 일반 승인
      let weight = 1;
      if (a.author_id && adminIds.has(a.author_id)) {
        weight = a.is_ai ? 2 : 3; // AI가 아니면 직접 작성 (최고), AI면 수정 후 승인
      }
      return {
        content: a.content,
        weight,
        authorId: a.author_id,
        isAi: !!a.is_ai,
      };
    },
  );
}

// ─── 2. Claude로 말투 프로필 생성 ──────────────────────────

export async function generateStyleProfile(
  answers: WeightedAnswer[],
): Promise<StyleProfile> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY 미설정");

  // 가중치 순 정렬, 상위 30개만 분석
  const sorted = [...answers].sort((a, b) => b.weight - a.weight).slice(0, 30);

  const samplesText = sorted
    .map(
      (a, i) =>
        `[가중치 ${a.weight}] 답변 ${i + 1}:\n${a.content.slice(0, 500)}`,
    )
    .join("\n\n---\n\n");

  const prompt = `아래는 "Smith"라는 사람이 작성하거나 승인한 답변 샘플이다.
가중치가 높을수록 Smith 본인이 직접 쓴 답변이다.

이 답변들에서 말투 패턴을 분석해서 JSON으로 응답해라.

분석 항목:
1. endings: 어미 패턴별 빈도 (예: "~요": 35, "~합니다": 20, "~죠": 15, "~거든요": 10)
2. toneRules: 이 사람의 말투를 재현하기 위한 규칙 5-7개 (구체적으로)
3. examples: 이 사람의 말투가 가장 잘 드러나는 문장 5개 (원문에서 발췌)

JSON만 응답해라. 다른 텍스트 없이.

${samplesText}`;

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANALYSIS_MODEL,
      max_tokens: 2048,
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`StyleLearner API 에러: ${response.status} ${err}`);
  }

  const data = await response.json();
  const text: string = data.content?.[0]?.text || "{}";

  // JSON 파싱 (코드블록 감싸기 대응)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

  return {
    endings: parsed.endings || {},
    toneRules: parsed.toneRules || [],
    examples: parsed.examples || [],
    analyzedAt: new Date().toISOString(),
    answerCount: answers.length,
  };
}

// ─── 3. 프로필 → [말투] 섹션 텍스트 생성 ──────────────────

export function buildStyleText(profile: StyleProfile): string {
  const rules = profile.toneRules.map((r) => `- ${r}`).join("\n");

  // 어미 빈도 상위 5개
  const topEndings = Object.entries(profile.endings)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([ending, freq]) => `${ending}(${freq}%)`)
    .join(", ");

  const examples = profile.examples
    .slice(0, 3)
    .map((e) => `- "${e}"`)
    .join("\n");

  return `[말투] (${profile.analyzedAt.slice(0, 10)} 학습 기준)
- 요체(~요, ~거든요, ~이에요)를 기본으로 하되, 합니다체(~합니다, ~됩니다)를 자연스럽게 섞어라.
- 설명/해설 부분은 요체, 결론/강조/팩트 전달은 합니다체. 이게 Smith 말투의 핵심이다.
- "~입니다"가 딱딱하게 느껴질 수 있지만, Smith는 실제로 중요한 팩트를 전달할 때 "~합니다"를 쓴다.
- 한다체(~한다, ~된다)도 가끔 섞어라. "구매 신호가 분산되는 거죠." 이런 식.
- "~죠" 어미를 적극 활용. "~거든요"와 함께 대화 느낌을 살려라.
- "안녕하세요!", "도움이 되셨길 바랍니다" 같은 챗봇 인사 금지
- 이모지 금지
${rules ? `\n학습된 추가 규칙:\n${rules}` : ""}
${topEndings ? `\n어미 빈도 분포: ${topEndings}` : ""}
${examples ? `\n톤 레퍼런스 (실제 답변에서 발췌):\n${examples}` : ""}`;
}

// ─── 4. DB에 프로필 저장 ──────────────────────────────────

export async function saveStyleProfile(
  profile: StyleProfile,
  styleText: string,
): Promise<void> {
  const svc = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (svc as any).from("style_profiles").insert({
    profile,
    style_text: styleText,
    answer_count: profile.answerCount,
  });

  if (error) {
    console.error("[StyleLearner] 프로필 저장 실패:", error);
    throw new Error(`프로필 저장 실패: ${error.message}`);
  }
}

// ─── 5. 최신 프로필 조회 ──────────────────────────────────

export async function getLatestStyleText(): Promise<string | null> {
  const svc = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (svc as any)
    .from("style_profiles")
    .select("style_text")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return data.style_text;
}

// ─── 6. 전체 파이프라인 실행 ──────────────────────────────

export async function runStyleLearning(): Promise<{
  profile: StyleProfile;
  styleText: string;
  answerCount: number;
}> {
  // 1. 승인된 답변 수집
  const answers = await analyzeApprovedAnswers(50);
  if (answers.length === 0) {
    throw new Error("분석할 승인된 답변이 없습니다.");
  }

  // 2. Claude로 프로필 생성
  const profile = await generateStyleProfile(answers);

  // 3. [말투] 섹션 텍스트 생성
  const styleText = buildStyleText(profile);

  // 4. DB 저장
  await saveStyleProfile(profile, styleText);

  return { profile, styleText, answerCount: answers.length };
}
