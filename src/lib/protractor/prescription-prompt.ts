/**
 * Gemini 처방 프롬프트 구성 모듈 (STEP 10)
 * 4섹션 구조: 문제정의 → 증거 → 3축 근거 → 참조
 */

import { PRESCRIPTION_GUIDE_TEXT } from './prescription-guide';
import type {
  AnalysisJsonV3,
  PerformanceBacktrackInput,
  PrescriptionPattern,
  PrescriptionBenchmark,
  AndromedaResult,
  SimilarBenchmark,
  EarAnalysis,
  GeminiPromptParts,
} from '@/types/prescription';

// ── 시스템 프롬프트 (금지 규칙 포함) ────────────────────────────────

export const PRESCRIPTION_SYSTEM_PROMPT = `
당신은 메타 광고 소재 전문 컨설턴트입니다.
수강생에게 1:1 코칭하듯 실전적이고 구체적으로 답변하세요.

절대 금지:
1. CTA 버튼 추가 처방 금지 (메타가 제공하는 것)
2. 세이프티존 밖 배치 처방 금지
3. 타겟팅 변경 처방 금지 (소재 관련만)
4. "더 좋게 하세요" 같은 추상적 처방 금지
5. 입력 데이터에 없는 수치 인용 금지
6. 광고비/예산 관련 처방 금지

추가 분석 지시:
1. ad_axis: 5축 분석 결과를 바탕으로 광고 소재의 카테고리를 분류하세요. format(포맷), hook_type(훅 유형), messaging_strategy(메시징 전략), target_persona(타겟 페르소나+인식 단계), category(카테고리 배열), structure(영상 구조 → 연결), persuasion(설득 전략), offer(오퍼), andromeda_code(속성 조합 코드), pda_code(persona×desire×awareness).
2. scene_journey: 영상 소재는 3초 단위로 씬을 나눠 시청자가 "봤다/들었다/느꼈다"를 1인칭 묘사하세요. 이미지 소재는 전체를 1개 씬으로. 각 씬에 cognitive_load(high/medium/low), subtitle_position(자막 위치), subtitle_safety_zone(세이프티존 내 여부)를 반드시 포함하세요.
3. audio_analysis: 나레이션 톤은 비유로 묘사하고, BGM 장르와 감정 흐름을 화살표(→)로 연결하세요. 감정 흐름은 "공감(문제)→신뢰(승무원)→감탄(물광)→유익(꿀팁)→제안(할인)" 형태로 구체적으로 작성하세요.
4. customer_journey_detail: 감각→사고→클릭→구매 4단계를 각각 summary(한줄) + detail/metric으로 분석하고, core_insight에 가장 중요한 발견 1줄을 쓰세요.
5. 씬별 prescription.target은 반드시 "👁감각", "🧠사고", "🖱행동" 중 하나로 지정하세요.

출력은 반드시 지정된 JSON 스키마를 따르세요.
`.trim();

// ── JSON 출력 스키마 ─────────────────────────────────────────────────

export const PRESCRIPTION_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    five_axis: {
      type: 'object',
      description: '5축 분석 결과 (visual, text, psychology, quality, hook)',
    },
    scores: {
      type: 'object',
      properties: {
        visual_impact: { type: 'number', minimum: 0, maximum: 100 },
        message_clarity: { type: 'number', minimum: 0, maximum: 100 },
        cta_effectiveness: { type: 'number', minimum: 0, maximum: 100 },
        social_proof_score: { type: 'number', minimum: 0, maximum: 100 },
        overall: { type: 'number', minimum: 0, maximum: 100 },
      },
    },
    top3_prescriptions: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        properties: {
          rank: { type: 'integer', minimum: 1, maximum: 3 },
          title: { type: 'string', description: '처방 제목 (한국어, 10자 이내)' },
          action: { type: 'string', description: '구체적 실행 방법 (한국어)' },
          journey_stage: { type: 'string', enum: ['감각', '사고', '행동(클릭)', '행동(구매)'] },
          expected_impact: { type: 'string', description: '예상 개선 효과 (한국어, 구체적 수치 포함)' },
          evidence_axis1: { type: 'string', description: '레퍼런스 원론 근거' },
          evidence_axis2: { type: 'string', description: '내부 데이터 패턴 근거 (없으면 "데이터 부족")' },
          evidence_axis3: { type: 'string', description: 'Motion 글로벌 벤치마크 근거 (없으면 "데이터 부족")' },
          difficulty: { type: 'string', enum: ['쉬움', '보통', '어려움'] },
          difficulty_reason: { type: 'string', description: '난이도 이유' },
          performance_driven: { type: 'boolean' },
          attribute: { type: 'string', description: '관련 소재 속성 (예: hook.hook_type)' },
        },
        required: ['rank', 'title', 'action', 'journey_stage', 'expected_impact',
          'evidence_axis1', 'evidence_axis2', 'evidence_axis3', 'difficulty',
          'difficulty_reason', 'performance_driven'],
      },
    },
    performance_backtrack: {
      type: ['object', 'null'],
      properties: {
        worst_metrics: { type: 'array' },
        affected_attributes: { type: 'array', items: { type: 'string' } },
        focus_stage: { type: 'string' },
        journey_breakdown: {
          type: 'object',
          properties: {
            감각: { type: 'object', properties: { status: { type: 'string' }, deviation: { type: 'string' } } },
            사고: { type: 'object', properties: { status: { type: 'string' }, deviation: { type: 'string' } } },
            행동_클릭: { type: 'object', properties: { status: { type: 'string' }, deviation: { type: 'string' } } },
            행동_구매: { type: 'object', properties: { status: { type: 'string' }, deviation: { type: 'string' } } },
          },
        },
      },
    },
    customer_journey_summary: {
      type: 'object',
      properties: {
        sensation: { type: 'string', description: '감각 단계 평가 (한국어)' },
        thinking: { type: 'string', description: '사고 단계 평가 (한국어)' },
        action_click: { type: 'string', description: '클릭 단계 평가 (한국어)' },
        action_purchase: { type: 'string', description: '구매 단계 평가 (한국어)' },
      },
      required: ['sensation', 'thinking', 'action_click', 'action_purchase'],
    },
    weakness_analysis: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          attribute: { type: 'string' },
          issue: { type: 'string', description: '문제점 설명 (한국어)' },
          benchmark_comparison: { type: 'string', description: '벤치마크 대비 설명 (한국어)' },
        },
      },
    },
    ad_axis: {
      type: 'object',
      description: '광고축 카테고리 분류 (5축 분석 기반)',
      properties: {
        format: { type: 'string', description: '소재 포맷 (예: "UGC/셀프촬영", "세로 영상 31초")' },
        hook_type: { type: 'string', enum: ['problem', 'benefit', 'curiosity', 'social_proof', 'authority'], description: '훅 유형' },
        messaging_strategy: { type: 'string', description: '메시징 전략 (예: "권위+혜택")' },
        target_persona: { type: 'string', description: '타겟 페르소나 (예: "직장인 여성 (solution_aware)")' },
        category: { type: 'array', items: { type: 'string' }, description: '카테고리 (예: ["beauty", "skincare"])' },
        structure: { type: 'string', description: '영상 구조 (예: "훅→데모→결과→CTA")' },
        persuasion: { type: 'string', description: '설득 전략 (예: "authority")' },
        offer: { type: 'string', description: '오퍼 (예: "discount 40%")' },
        andromeda_code: { type: 'string', description: 'Andromeda 소재 코드 (예: "skincare-demo-ugc-text-overlay-glowy-skin")' },
        pda_code: { type: 'string', description: 'P.D.A 코드: persona × desire × awareness (예: "office_worker × beauty × solution_aware")' },
      },
      required: ['format', 'hook_type', 'messaging_strategy', 'target_persona', 'category', 'structure', 'persuasion', 'offer', 'andromeda_code', 'pda_code'],
    },
    scene_journey: {
      type: 'array',
      description: '씬별 시청자 여정 분석 (영상 소재만 해당, 이미지는 빈 배열)',
      items: {
        type: 'object',
        properties: {
          time: { type: 'string', description: '시간 구간 (예: "0-3초")' },
          type: { type: 'string', enum: ['hook', 'demo', 'result', 'tip', 'cta'], description: '씬 유형' },
          watched: { type: 'string', description: '👁 봤다 — 시청자가 본 구체적 시각 요소' },
          heard: { type: 'string', description: '👂 들었다 — 나레이션, BGM, 효과음 등' },
          felt: { type: 'string', description: '🧠 느꼈다 — 시청자의 심리적 반응/감정' },
          gaze_point: { type: 'string', description: '📍 시선 집중 포인트 (화면 위치/요소) + 인지부하 수준' },
          subtitle_text: { type: 'string', description: '📝 자막 원문 (없으면 빈 문자열)' },
          cognitive_load: { type: 'string', enum: ['high', 'medium', 'low'], description: '인지부하 수준' },
          subtitle_position: { type: 'string', description: '자막 위치 (예: "중앙+하단", "상단")' },
          subtitle_safety_zone: { type: 'boolean', description: '자막이 세이프티존 내에 있는지 여부' },
          prescription: {
            type: 'object',
            properties: {
              target: { type: 'string', description: '처방 대상: 👁감각 / 🧠사고 / 🖱행동' },
              action: { type: 'string', description: '구체적 개선 방법' },
              reasoning: { type: 'string', description: '이 처방의 근거' },
            },
            required: ['target', 'action', 'reasoning'],
          },
        },
        required: ['time', 'type', 'watched', 'heard', 'felt', 'gaze_point', 'subtitle_text', 'cognitive_load', 'subtitle_position', 'subtitle_safety_zone', 'prescription'],
      },
    },
    audio_analysis: {
      type: 'object',
      description: '오디오 분석 (나레이션 톤, BGM, 감정 흐름)',
      properties: {
        narration_tone: { type: 'string', description: '나레이션 톤 묘사 (예: "친한 친구가 꿀팁 알려주듯 편안하고 밝은 톤")' },
        bgm_genre: { type: 'string', description: 'BGM 장르/분위기 (예: "밝고 경쾌한 팝")' },
        emotion_flow: { type: 'string', description: '감정 흐름 (예: "공감→신뢰→감탄→행동")' },
      },
      required: ['narration_tone', 'bgm_genre', 'emotion_flow'],
    },
    customer_journey_detail: {
      type: 'object',
      description: '고객 여정 4단계 상세 분석 (감각→사고→클릭→구매)',
      properties: {
        sensation: {
          type: 'object',
          properties: {
            summary: { type: 'string', description: '감각 단계 한줄 요약' },
            detail: { type: 'string', description: '감각 단계 상세 분석 (시각+청각 자극이 주의를 끄는 방식)' },
          },
          required: ['summary', 'detail'],
        },
        thinking: {
          type: 'object',
          properties: {
            summary: { type: 'string', description: '사고 단계 한줄 요약' },
            detail: { type: 'string', description: '사고 단계 상세 분석 (메시지가 공감/신뢰를 만드는 방식)' },
          },
          required: ['summary', 'detail'],
        },
        action_click: {
          type: 'object',
          properties: {
            summary: { type: 'string', description: '클릭 행동 한줄 요약' },
            metric: { type: 'string', description: '관련 지표 언급 (CTR 등)' },
          },
          required: ['summary', 'metric'],
        },
        action_purchase: {
          type: 'object',
          properties: {
            summary: { type: 'string', description: '구매 행동 한줄 요약' },
            metric: { type: 'string', description: '관련 지표 언급 (전환율 등)' },
          },
          required: ['summary', 'metric'],
        },
        core_insight: { type: 'string', description: '핵심 인사이트 한줄 (이 소재의 여정에서 가장 중요한 발견)' },
      },
      required: ['sensation', 'thinking', 'action_click', 'action_purchase', 'core_insight'],
    },
  },
  required: ['five_axis', 'scores', 'top3_prescriptions', 'customer_journey_summary',
    'ad_axis', 'scene_journey', 'audio_analysis', 'customer_journey_detail'],
};

// ── 섹션 빌더 ────────────────────────────────────────────────────────

function buildSection1_ProblemDefinition(backtrack: PerformanceBacktrackInput): string {
  const lines: string[] = [
    '## [SECTION 1: 문제 정의]',
    '',
    '이 광고 소재의 성과 문제를 아래 데이터로 먼저 파악한 후 분석하세요:',
    '',
    '### 성과 역추적 (벤치마크 대비)',
  ];

  if (backtrack.worstMetrics.length > 0) {
    lines.push('**가장 심각한 지표 (worst 3):**');
    for (const wm of backtrack.worstMetrics) {
      lines.push(
        `- ${wm.label}: 실제 ${wm.actual.toFixed(2)} vs 벤치마크 ${wm.benchmark.toFixed(2)} ` +
        `(편차: ${wm.deviation.toFixed(1)}%, 단계: ${wm.group})`
      );
    }
    lines.push('');
  }

  if (backtrack.metaRankings.quality) {
    lines.push(`**Meta 품질 랭킹:** ${backtrack.metaRankings.quality}`);
    lines.push(`**Meta 참여 랭킹:** ${backtrack.metaRankings.engagement ?? '데이터 없음'}`);
    lines.push(`**Meta 전환 랭킹:** ${backtrack.metaRankings.conversion ?? '데이터 없음'}`);
    lines.push('');
  }

  if (backtrack.videoRaw) {
    lines.push('**영상 재생 이탈 곡선:**');
    lines.push(`- 3초: ${(backtrack.videoRaw.p3s * 100).toFixed(1)}%`);
    lines.push(`- 25%: ${(backtrack.videoRaw.p25 * 100).toFixed(1)}%`);
    lines.push(`- 50%: ${(backtrack.videoRaw.p50 * 100).toFixed(1)}%`);
    lines.push(`- 75%: ${(backtrack.videoRaw.p75 * 100).toFixed(1)}%`);
    lines.push(`- 완주: ${(backtrack.videoRaw.p100 * 100).toFixed(1)}%`);
    lines.push(`- 평균 시청 시간: ${backtrack.videoRaw.avg_time_sec.toFixed(1)}초`);
    lines.push('');
  }

  lines.push('**지시:** 아래 소재를 분석할 때, 위 데이터에서 드러난 성과 문제의 원인을 우선적으로 찾으세요.');
  lines.push('처방은 이 성과 약점을 해결하는 방향이어야 합니다.');

  return lines.join('\n');
}

function buildSection2_Evidence(input: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  media: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  saliency: any;
  hasPerformanceData: boolean;
}): string {
  const lines: string[] = [
    '## [SECTION 2: 증거 자료]',
    '',
  ];

  // 광고 카피
  if (input.media.ad_copy) {
    lines.push('### 광고 카피');
    lines.push(input.media.ad_copy);
    lines.push('');
  }

  // 미디어 타입
  lines.push(`### 소재 정보`);
  lines.push(`- 유형: ${input.media.media_type === 'VIDEO' ? '영상' : '이미지'}`);
  if (input.media.media_url) {
    lines.push(`- URL: ${input.media.media_url}`);
  }
  lines.push('');

  // DeepGaze 시선 데이터
  if (input.saliency) {
    lines.push('### DeepGaze 시선 분석');
    if (input.saliency.cta_attention_score !== undefined) {
      lines.push(`- CTA 주목도: ${(input.saliency.cta_attention_score * 100).toFixed(0)}%`);
    }
    if (input.saliency.cognitive_load !== undefined) {
      lines.push(`- 인지 부하: ${input.saliency.cognitive_load}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function buildSection3_PrescriptionBasis(input: {
  axis1Guide: string;
  axis2Patterns: PrescriptionPattern[];
  axis3Benchmarks: PrescriptionBenchmark[];
  earAnalysis: EarAnalysis;
}): string {
  const lines: string[] = [
    '## [SECTION 3: 처방 근거 — 3축 데이터]',
    '',
  ];

  // 축1: 레퍼런스 원론 (고정)
  lines.push('### 축1: 레퍼런스 원론');
  lines.push(input.axis1Guide);
  lines.push('');

  // EAR 분석 결과
  lines.push('### GEM/EAR 병목 분석');
  lines.push(`- 주요 병목: ${input.earAnalysis.primaryBottleneck}`);
  lines.push(`- 상세: ${input.earAnalysis.bottleneckDetail}`);
  lines.push(`- 개선 우선순위: ${input.earAnalysis.improvementPriority}`);
  lines.push('');

  // 축2: 내부 데이터 패턴 (동적)
  if (input.axis2Patterns.length > 0) {
    lines.push('### 축2: 내부 데이터 패턴');
    const highConfidence = input.axis2Patterns.filter(p => p.confidence === 'high' || p.confidence === 'medium');
    for (const p of highConfidence.slice(0, 10)) {
      if (p.lift_vs_average !== null && p.lift_vs_average !== undefined) {
        const liftSign = p.lift_vs_average >= 0 ? '+' : '';
        lines.push(
          `- ${p.attribute}=${p.value}: ${p.metric} ${liftSign}${p.lift_vs_average.toFixed(1)}% ` +
          `(N=${p.sample_count}, 신뢰도=${p.confidence})`
        );
      }
    }
    lines.push('');
  } else {
    lines.push('### 축2: 내부 데이터 패턴');
    lines.push('- 내부 패턴 데이터 부족 (축1 원론과 축3 글로벌 벤치마크를 우선 참조)');
    lines.push('');
  }

  // 축3: Motion 글로벌 벤치마크 (동적)
  if (input.axis3Benchmarks.length > 0) {
    lines.push('### 축3: Motion 글로벌 벤치마크 백분위');
    for (const b of input.axis3Benchmarks.slice(0, 8)) {
      lines.push(
        `- ${b.metric}: P25=${b.p25?.toFixed(3) ?? 'N/A'}, P50=${b.p50?.toFixed(3) ?? 'N/A'}, P75=${b.p75?.toFixed(3) ?? 'N/A'}`
      );
    }
    lines.push('');
  } else {
    lines.push('### 축3: Motion 글로벌 벤치마크');
    lines.push('- 글로벌 벤치마크 데이터 없음 (축1 + 축2로만 처방)');
    lines.push('');
  }

  return lines.join('\n');
}

function buildSection4_References(input: {
  andromeda: AndromedaResult;
  similarBenchmarks: SimilarBenchmark[];
}): string {
  const lines: string[] = [
    '## [SECTION 4: 참조 — 다양성 경고 + 유사 벤치마크]',
    '',
  ];

  // Andromeda 다양성 경고
  if (input.andromeda.warningLevel !== 'low') {
    lines.push('### Andromeda 다양성 경고');
    lines.push(`- 경고 레벨: ${input.andromeda.warningLevel}`);
    lines.push(`- 다양성 점수: ${input.andromeda.diversityScore}/100`);
    if (input.andromeda.similarPairs.length > 0) {
      lines.push(`- 유사 소재 ${input.andromeda.similarPairs.length}개 발견`);
      for (const pair of input.andromeda.similarPairs.slice(0, 3)) {
        lines.push(`  * 소재 ${pair.creative_id.slice(0, 8)}: ${(pair.similarity * 100).toFixed(0)}% 유사 (겹치는 축: ${pair.overlap_axes.join(', ')})`);
      }
    }
    lines.push('**지시:** 처방 시 소재 다양성 문제도 반드시 언급하세요.');
    lines.push('');
  }

  // 유사 벤치마크 소재
  if (input.similarBenchmarks.length > 0) {
    lines.push('### 유사 고성과 벤치마크 소재 참조');
    for (const bench of input.similarBenchmarks.slice(0, 3)) {
      lines.push(`- 유사도 ${(bench.similarity * 100).toFixed(0)}%: 이 소재의 속성 패턴을 참조`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * 소재 멀티모달 파트 구성
 */
async function buildMediaPart(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  media: any
): Promise<object | null> {
  const url = media.media_url || media.storage_url;
  if (!url) return null;

  try {
    const mediaType = media.media_type === 'VIDEO' ? 'video/mp4' : null;

    // 이미지만 inline_data로 전송 (영상은 URL 참조)
    if (!mediaType) {
      const res = await fetch(url);
      if (!res.ok) return null;
      const contentType = res.headers.get('content-type') || 'image/jpeg';
      const mimeType = contentType.startsWith('image/') ? contentType.split(';')[0] : 'image/jpeg';
      const arrayBuffer = await res.arrayBuffer();
      const base64Data = Buffer.from(arrayBuffer).toString('base64');
      return { inline_data: { mime_type: mimeType, data: base64Data } };
    }

    // 영상: URL 텍스트로 전달
    return { text: `[영상 소재 URL: ${url}]` };
  } catch {
    return null;
  }
}

// ── STEP 10 메인 프롬프트 빌더 ────────────────────────────────────────

export async function buildPrescriptionPrompt(input: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  media: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  saliency: any;
  performanceBacktrack: PerformanceBacktrackInput | null;
  patterns: PrescriptionPattern[];
  globalBenchmarks: PrescriptionBenchmark[];
  andromedaResult: AndromedaResult;
  similarBenchmarks: SimilarBenchmark[];
  earAnalysis: EarAnalysis;
  hasPerformanceData: boolean;
}): Promise<GeminiPromptParts> {
  const sections: string[] = [];

  // SECTION 1: 문제 정의 (성과 데이터 있는 경우만)
  if (input.hasPerformanceData && input.performanceBacktrack) {
    sections.push(buildSection1_ProblemDefinition(input.performanceBacktrack));
  }

  // SECTION 2: 증거 자료
  sections.push(buildSection2_Evidence({
    media: input.media,
    saliency: input.saliency,
    hasPerformanceData: input.hasPerformanceData,
  }));

  // SECTION 3: 처방 근거 (3축)
  sections.push(buildSection3_PrescriptionBasis({
    axis1Guide: PRESCRIPTION_GUIDE_TEXT,
    axis2Patterns: input.patterns,
    axis3Benchmarks: input.globalBenchmarks,
    earAnalysis: input.earAnalysis,
  }));

  // SECTION 4: 참조
  sections.push(buildSection4_References({
    andromeda: input.andromedaResult,
    similarBenchmarks: input.similarBenchmarks,
  }));

  // 미디어 파트
  const mediaPart = await buildMediaPart(input.media);

  return {
    systemPrompt: PRESCRIPTION_SYSTEM_PROMPT,
    textParts: sections,
    mediaPart,
  };
}
