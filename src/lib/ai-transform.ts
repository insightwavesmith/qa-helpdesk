/**
 * ai-transform.ts — AI 콘텐츠 변환 엔진
 *
 * Anthropic Claude API(REST 직접 호출)를 사용하여 원본 콘텐츠를 채널별 포맷으로 변환합니다.
 * 지원 채널: 네이버 블로그, 네이버 카페, 뉴스레터, 유튜브 스크립트, 인스타 카드뉴스, 구글 SEO
 *
 * @note @anthropic-ai/sdk가 미설치 환경이므로 REST API 직접 호출 방식 사용
 */

import type { TransformChannel } from "@/types/distribution";

// Anthropic API 설정
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_VERSION = "2023-06-01";
const MODEL = "claude-sonnet-4-5-20250514";
const MAX_TOKENS = 4096;

// 공통 역할 프롬프트
const SYSTEM_ROLE =
  "당신은 자사몰사관학교(bscamp)의 콘텐츠 마케터입니다. " +
  "자사몰사관학교는 메타 광고와 자사몰 운영을 가르치는 전문 교육 기관입니다. " +
  "원본 콘텐츠를 각 채널의 특성에 맞게 최적화된 형태로 변환하세요.";

/** AI 변환 입력 */
export interface TransformInput {
  title: string;
  content: string;   // 원본 마크다운
  keywords?: string[];
}

/** AI 변환 출력 */
export interface TransformOutput {
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  wordCount: number;
}

// ----------------------------------------------------------------
// Anthropic REST API 호출
// ----------------------------------------------------------------

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

interface AnthropicContentBlock {
  type: string;
  text?: string;
}

interface AnthropicResponse {
  content: AnthropicContentBlock[];
  error?: { message: string };
}

/**
 * Anthropic Messages API 직접 호출
 */
async function callClaude(userPrompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.");
  }

  const messages: AnthropicMessage[] = [
    { role: "user", content: userPrompt },
  ];

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_API_VERSION,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_ROLE,
      messages,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API 호출 실패: ${response.status} ${response.statusText} — ${errorText}`);
  }

  const data = (await response.json()) as AnthropicResponse;

  // 에러 응답 처리
  if (data.error) {
    throw new Error(`Anthropic API 오류: ${data.error.message}`);
  }

  // 텍스트 블록만 추출
  const textBlock = data.content.find((block) => block.type === "text");
  if (!textBlock || !textBlock.text) {
    throw new Error("API 응답에서 텍스트 블록을 찾을 수 없습니다.");
  }
  return textBlock.text;
}

/**
 * 글자 수 계산 (공백 포함)
 */
function countWords(text: string): number {
  return text.replace(/\s+/g, " ").trim().length;
}

/**
 * 에러 발생 시 기본 출력 반환
 */
function errorOutput(title: string, error: unknown): TransformOutput {
  const message = error instanceof Error ? error.message : "변환 중 오류가 발생했습니다.";
  return {
    title,
    body: `[변환 오류] ${message}`,
    metadata: { error: message },
    wordCount: 0,
  };
}

// ----------------------------------------------------------------
// 채널별 변환 함수
// ----------------------------------------------------------------

/**
 * 1. 네이버 블로그 변환
 * - 2,000자 이상
 * - 이모지 소제목 사용
 * - 키워드 3~5회 자연스럽게 포함
 */
export async function transformForBlog(input: TransformInput): Promise<TransformOutput> {
  const keywordsText = input.keywords?.length
    ? `\n핵심 키워드 (3~5회 자연스럽게 포함): ${input.keywords.join(", ")}`
    : "";

  const prompt = `다음 원본 콘텐츠를 네이버 블로그 포스팅 형식으로 변환해주세요.

원본 제목: ${input.title}
원본 내용:
${input.content}
${keywordsText}

요구사항:
- 2,000자 이상으로 작성
- 각 소제목에 이모지 1개 포함 (예: 📌 핵심 포인트, 💡 실전 활용법)
- 소제목은 최소 4개 이상
- 마케터, 사업자 독자를 대상으로 한 실용적인 톤
- 본문 첫 단락에서 독자의 공감을 이끌어내는 도입부 작성
- 실제 사례나 수치 예시 포함 (없으면 일반적인 예시 활용)
- 마지막에 자사몰사관학교 관련 자연스러운 마무리 멘트 포함

출력 형식:
제목: [제목]
---
[본문]`;

  try {
    const rawText = await callClaude(prompt);

    // 제목과 본문 분리
    const titleMatch = rawText.match(/^제목:\s*(.+)/m);
    const separatorIndex = rawText.indexOf("---");
    const body = separatorIndex !== -1
      ? rawText.slice(separatorIndex + 3).trim()
      : rawText.replace(/^제목:.+\n?/m, "").trim();
    const title = titleMatch ? titleMatch[1].trim() : input.title;

    return {
      title,
      body,
      metadata: {
        channel: "naver_blog",
        keywords: input.keywords ?? [],
        minLength: 2000,
      },
      wordCount: countWords(body),
    };
  } catch (error) {
    return errorOutput(input.title, error);
  }
}

/**
 * 2. 네이버 카페 변환
 * - 800~1,200자
 * - 구어체 (친근한 말투)
 * - "여러분은 어떠세요?" 식의 마무리로 참여 유도
 */
export async function transformForCafe(input: TransformInput): Promise<TransformOutput> {
  const prompt = `다음 원본 콘텐츠를 네이버 카페 게시글 형식으로 변환해주세요.

원본 제목: ${input.title}
원본 내용:
${input.content}

요구사항:
- 800~1,200자 분량
- 구어체, 친근한 말투 사용 (예: "~해요", "~거든요", "~잖아요")
- 카페 커뮤니티 분위기에 맞는 자연스러운 이야기체
- 핵심 인사이트를 쉽게 풀어서 설명
- 마지막 문장은 "여러분은 어떠세요?" 또는 "여러분의 경험은 어떠신가요?" 형식으로 마무리
- 소제목 없이 자연스럽게 흘러가는 단락 구성

출력 형식:
제목: [제목]
---
[본문]`;

  try {
    const rawText = await callClaude(prompt);

    const titleMatch = rawText.match(/^제목:\s*(.+)/m);
    const separatorIndex = rawText.indexOf("---");
    const body = separatorIndex !== -1
      ? rawText.slice(separatorIndex + 3).trim()
      : rawText.replace(/^제목:.+\n?/m, "").trim();
    const title = titleMatch ? titleMatch[1].trim() : input.title;

    return {
      title,
      body,
      metadata: {
        channel: "naver_cafe",
        tone: "conversational",
        targetLength: "800-1200",
      },
      wordCount: countWords(body),
    };
  } catch (error) {
    return errorOutput(input.title, error);
  }
}

/**
 * 3. 뉴스레터 변환
 * - 500~800자
 * - 핵심 요약 중심
 * - CTA(Call To Action) 텍스트 포함
 */
export async function transformForNewsletter(input: TransformInput): Promise<TransformOutput> {
  const prompt = `다음 원본 콘텐츠를 이메일 뉴스레터 형식으로 변환해주세요.

원본 제목: ${input.title}
원본 내용:
${input.content}

요구사항:
- 500~800자 분량
- 바쁜 독자를 위한 핵심 요약 중심
- 임팩트 있는 첫 문장으로 시작
- 3~4개의 핵심 포인트를 간결하게 정리
- 마지막에 행동을 유도하는 CTA 텍스트 포함
- 전문적이면서도 따뜻한 톤

출력 형식:
제목: [이메일 제목]
CTA텍스트: [버튼에 표시될 짧은 텍스트 (예: "자세히 알아보기", "지금 시작하기")]
---
[본문]`;

  try {
    const rawText = await callClaude(prompt);

    const titleMatch = rawText.match(/^제목:\s*(.+)/m);
    const ctaMatch = rawText.match(/^CTA텍스트:\s*(.+)/m);
    const separatorIndex = rawText.indexOf("---");
    const body = separatorIndex !== -1
      ? rawText.slice(separatorIndex + 3).trim()
      : rawText.replace(/^제목:.+\n?/m, "").replace(/^CTA텍스트:.+\n?/m, "").trim();
    const title = titleMatch ? titleMatch[1].trim() : input.title;
    const ctaText = ctaMatch ? ctaMatch[1].trim() : "자세히 알아보기";

    return {
      title,
      body,
      metadata: {
        channel: "newsletter",
        ctaText,
        targetLength: "500-800",
      },
      wordCount: countWords(body),
    };
  } catch (error) {
    return errorOutput(input.title, error);
  }
}

/**
 * 4. 유튜브 스크립트 변환
 * - 8~15분 분량 (한국어 기준 약 1,200~2,200자)
 * - 대화체
 * - 오프닝 후크 15초 포함
 */
export async function transformForYoutube(input: TransformInput): Promise<TransformOutput> {
  const prompt = `다음 원본 콘텐츠를 유튜브 영상 스크립트 형식으로 변환해주세요.

원본 제목: ${input.title}
원본 내용:
${input.content}

요구사항:
- 8~15분 분량 스크립트 (약 1,200~2,200자)
- 오프닝 후크: 처음 15초 안에 시청자 관심을 끄는 강렬한 문장으로 시작
  예: "오늘 이 영상 하나로 [결과]를 얻을 수 있습니다." 또는 충격적인 통계/질문으로 시작
- 대화체 (말하듯 자연스럽게, "~하거든요", "~해요", "지금 바로")
- 중간중간 "잠깐, 여기서 중요한 포인트!" 같은 강조 마커 사용
- 영상 구조: [후크] → [자기소개/채널소개] → [본론] → [핵심 정리] → [CTA: 구독/좋아요 유도]
- 자막에 표시될 것을 고려한 짧은 문장 위주
- 화면에 보여줄 내용은 [화면: ...]으로 표시

출력 형식:
제목: [유튜브 영상 제목 (클릭 유도)]
썸네일텍스트: [썸네일에 들어갈 짧은 텍스트]
---
[스크립트]`;

  try {
    const rawText = await callClaude(prompt);

    const titleMatch = rawText.match(/^제목:\s*(.+)/m);
    const thumbnailMatch = rawText.match(/^썸네일텍스트:\s*(.+)/m);
    const separatorIndex = rawText.indexOf("---");
    const body = separatorIndex !== -1
      ? rawText.slice(separatorIndex + 3).trim()
      : rawText.replace(/^제목:.+\n?/m, "").replace(/^썸네일텍스트:.+\n?/m, "").trim();
    const title = titleMatch ? titleMatch[1].trim() : input.title;
    const thumbnailText = thumbnailMatch ? thumbnailMatch[1].trim() : "";

    return {
      title,
      body,
      metadata: {
        channel: "youtube",
        thumbnailText,
        estimatedDuration: "8-15분",
      },
      wordCount: countWords(body),
    };
  } catch (error) {
    return errorOutput(input.title, error);
  }
}

/**
 * 5. 인스타그램 카드뉴스 변환
 * - 5~8장 카드
 * - 카드당 핵심 1가지
 */
export async function transformForInstagram(input: TransformInput): Promise<TransformOutput> {
  const prompt = `다음 원본 콘텐츠를 인스타그램 카드뉴스 형식으로 변환해주세요.

원본 제목: ${input.title}
원본 내용:
${input.content}

요구사항:
- 5~8장 카드 구성
- 카드 1장: 표지 (눈길을 끄는 제목 + 부제목)
- 카드 2~7장: 본문 (카드당 핵심 포인트 1개, 70자 이내)
- 마지막 카드: 마무리 + 팔로우/저장 유도 CTA
- 각 카드는 단독으로 봐도 의미가 전달되어야 함
- 짧고 임팩트 있는 문장 사용
- 숫자/통계 적극 활용 (없으면 일반적인 예시)

출력 형식 (JSON):
{
  "cards": [
    {"cardNumber": 1, "type": "cover", "headline": "표지 제목", "subtext": "부제목"},
    {"cardNumber": 2, "type": "content", "headline": "핵심 포인트 제목", "body": "본문 (70자 이내)", "emoji": "이모지"},
    {"cardNumber": N, "type": "cta", "headline": "마무리 문구", "cta": "팔로우하기"}
  ],
  "hashtags": ["#해시태그1", "#해시태그2", "#해시태그3", "#해시태그4", "#해시태그5"]
}`;

  try {
    const rawText = await callClaude(prompt);

    // JSON 파싱 시도
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    let metadata: Record<string, unknown> = { channel: "instagram" };
    let body = rawText;

    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]) as {
          cards?: Array<Record<string, unknown>>;
          hashtags?: string[];
        };
        metadata = {
          channel: "instagram",
          cards: parsed.cards ?? [],
          hashtags: parsed.hashtags ?? [],
        };
        // 카드를 읽기 쉬운 텍스트로 변환
        if (Array.isArray(parsed.cards)) {
          body = parsed.cards
            .map((card) => {
              const cardNum = card.cardNumber ? `[카드 ${card.cardNumber}]` : "";
              const headline = card.headline ? `제목: ${card.headline}` : "";
              const cardBody = card.body ? `내용: ${card.body}` : "";
              const subtext = card.subtext ? `부제목: ${card.subtext}` : "";
              return [cardNum, headline, subtext, cardBody].filter(Boolean).join("\n");
            })
            .join("\n\n");
          if (Array.isArray(parsed.hashtags)) {
            body += `\n\n${parsed.hashtags.join(" ")}`;
          }
        }
      } catch {
        // JSON 파싱 실패 시 원문 사용
        body = rawText;
      }
    }

    return {
      title: input.title,
      body,
      metadata,
      wordCount: countWords(body),
    };
  } catch (error) {
    return errorOutput(input.title, error);
  }
}

/**
 * 6. 구글 SEO 변환
 * - H1→H2→H3 계층 구조
 * - Schema.org JSON-LD 메타데이터 포함
 */
export async function transformForGoogleSEO(input: TransformInput): Promise<TransformOutput> {
  const keywordsText = input.keywords?.length
    ? `\n타겟 키워드: ${input.keywords.join(", ")}`
    : "";

  const prompt = `다음 원본 콘텐츠를 구글 SEO에 최적화된 블로그 아티클 형식으로 변환해주세요.

원본 제목: ${input.title}
원본 내용:
${input.content}
${keywordsText}

요구사항:
- H1(제목) → H2(대제목) → H3(소제목) 계층 구조 사용
- 마크다운 형식으로 헤딩 표시 (# H1, ## H2, ### H3)
- 메타 디스크립션 포함 (150~160자)
- 첫 단락에 핵심 키워드 자연스럽게 포함
- 2,500자 이상의 충분한 분량
- 내부 링크 앵커 텍스트 제안 [포함]
- FAQ 섹션 포함 (H2: 자주 묻는 질문, 3~5개)
- Schema.org Article JSON-LD 스키마 제공

출력 형식:
메타디스크립션: [150-160자 설명]
SCHEMA_JSON:
[JSON-LD 스키마]
END_SCHEMA
---
[마크다운 본문]`;

  try {
    const rawText = await callClaude(prompt);

    // 메타 디스크립션 추출
    const metaMatch = rawText.match(/^메타디스크립션:\s*(.+)/m);
    const metaDescription = metaMatch ? metaMatch[1].trim() : "";

    // Schema JSON-LD 추출
    const schemaMatch = rawText.match(/SCHEMA_JSON:\s*([\s\S]*?)END_SCHEMA/);
    let schemaJson: Record<string, unknown> = {};
    if (schemaMatch) {
      try {
        const jsonText = schemaMatch[1].trim();
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
        if (jsonMatch) schemaJson = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      } catch {
        // JSON-LD 파싱 실패 시 빈 객체 유지
      }
    }

    // 본문 추출 (마지막 --- 이후)
    const separatorIndex = rawText.lastIndexOf("---");
    const body = separatorIndex !== -1
      ? rawText.slice(separatorIndex + 3).trim()
      : rawText
          .replace(/^메타디스크립션:.+\n?/m, "")
          .replace(/SCHEMA_JSON:[\s\S]*?END_SCHEMA/m, "")
          .trim();

    return {
      title: input.title,
      body,
      metadata: {
        channel: "google_seo",
        metaDescription,
        schemaJson,
        keywords: input.keywords ?? [],
      },
      wordCount: countWords(body),
    };
  } catch (error) {
    return errorOutput(input.title, error);
  }
}

// ----------------------------------------------------------------
// 채널-함수 매핑 및 통합 호출
// ----------------------------------------------------------------

type TransformFn = (input: TransformInput) => Promise<TransformOutput>;

const CHANNEL_TRANSFORM_MAP: Record<TransformChannel, TransformFn> = {
  naver_blog: transformForBlog,
  naver_cafe: transformForCafe,
  newsletter: transformForNewsletter,
  youtube: transformForYoutube,
  instagram: transformForInstagram,
  google_seo: transformForGoogleSEO,
};

/**
 * 여러 채널 동시 변환 (Promise.allSettled 병렬 호출)
 *
 * @param input - 원본 콘텐츠
 * @param channels - 변환할 채널 목록
 * @returns 채널별 변환 결과 Map (실패한 채널도 에러 메시지로 포함)
 */
export async function transformForChannels(
  input: TransformInput,
  channels: TransformChannel[]
): Promise<Map<TransformChannel, TransformOutput>> {
  const results = await Promise.allSettled(
    channels.map(async (channel) => {
      const transformFn = CHANNEL_TRANSFORM_MAP[channel];
      if (!transformFn) {
        throw new Error(`지원하지 않는 채널입니다: ${channel}`);
      }
      const output = await transformFn(input);
      return { channel, output };
    })
  );

  const resultMap = new Map<TransformChannel, TransformOutput>();

  results.forEach((result, index) => {
    const channel = channels[index];
    if (result.status === "fulfilled") {
      resultMap.set(channel, result.value.output);
    } else {
      // 실패한 채널도 에러 메시지와 함께 포함
      resultMap.set(channel, errorOutput(input.title, result.reason));
    }
  });

  return resultMap;
}
