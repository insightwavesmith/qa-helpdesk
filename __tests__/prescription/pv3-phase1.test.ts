import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  buildPrescriptionPrompt,
  PRESCRIPTION_SYSTEM_PROMPT,
} from '@/lib/protractor/prescription-prompt';
import type { SceneAnalysisData } from '@/types/prescription';
import type { AnalysisJsonV3 } from '@/types/prescription';

// ── 테스트 픽스처 ──────────────────────────────────────────────────

const mockSceneAnalysis: SceneAnalysisData = {
  scenes: [
    {
      time: '0-3초',
      type: 'hook',
      desc: '제품 클로즈업',
      deepgaze: {
        avg_fixation_x: 0.5,
        avg_fixation_y: 0.3,
        dominant_region: '중앙 상단',
        cta_visible: true,
        fixation_count: 5,
        avg_intensity: 0.8,
      },
      analysis: {
        hook_strength: 0.85,
        attention_quality: 'high',
        message_clarity: 'medium',
        viewer_action: '시선 집중',
        improvement: '텍스트 크기 키우기',
      },
    },
  ],
  overall: {
    total_scenes: 3,
    hook_effective: true,
    cta_reached: true,
    analyzed_at: '2026-04-01T00:00:00Z',
    model: 'gemini-3-pro',
  },
};

const baseBuildInput = {
  media: { media_type: 'VIDEO', ad_copy: '테스트 카피', media_url: 'https://example.com/video.mp4' },
  saliency: { cta_attention_score: 0.7, cognitive_load: 'medium' },
  sceneAnalysis: mockSceneAnalysis,
  performanceBacktrack: null,
  patterns: [],
  globalBenchmarks: [],
  andromedaResult: { diversityScore: 100, warningLevel: 'low' as const, similarPairs: [], diversificationSuggestion: null },
  similarBenchmarks: [],
  earAnalysis: { primaryBottleneck: 'foundation' as const, bottleneckDetail: '테스트', improvementPriority: '테스트' },
  hasPerformanceData: false,
};

// ── PV3-001: step2가 analysis_json.scene_analysis에서 씬 데이터 읽기 ──

describe('PV3 Phase 1: 씬분석 주입 + 버그 수정', () => {
  const engineSrc = fs.readFileSync(
    path.resolve(__dirname, '../../src/lib/protractor/prescription-engine.ts'),
    'utf-8'
  );

  it('pv3001_step2가 analysis_json.scene_analysis에서 씬 데이터 읽기', () => {
    // analysisJson?.scene_analysis 패턴이 존재해야 함
    expect(engineSrc).toContain('analysisJson?.scene_analysis');
  });

  it('pv3002_step2가 video_analysis 컬럼 참조하지 않음', () => {
    // step2 함수 내에서 video_analysis select 쿼리가 제거되었는지 확인
    // 'video_analysis?.scene_analysis' 패턴이 없어야 함
    expect(engineSrc).not.toContain('video_analysis?.scene_analysis');
    // step2 내부에서 .select('video_analysis') 쿼리가 없어야 함
    const step2Match = engineSrc.match(/step2_fetchSaliencyData[\s\S]*?^}/m);
    if (step2Match) {
      expect(step2Match[0]).not.toContain("select('video_analysis')");
    }
  });

  it('pv3003_buildPrescriptionPrompt에 sceneAnalysis 파라미터 전달', async () => {
    // sceneAnalysis를 전달해서 에러 없이 호출되는지 확인
    const result = await buildPrescriptionPrompt(baseBuildInput);
    expect(result).toBeDefined();
    expect(result.textParts).toBeDefined();
    expect(result.textParts.length).toBeGreaterThan(0);
  });

  it('pv3004_SECTION2에 씬분석 데이터 포함', async () => {
    const result = await buildPrescriptionPrompt(baseBuildInput);
    const section2 = result.textParts.find(s => s.includes('SECTION 2'));
    expect(section2).toBeDefined();
    expect(section2).toContain('사전 분석된 씬 데이터');
    expect(section2).toContain('0-3초');
    expect(section2).toContain('hook');
  });

  it('pv3005_SECTION2에 씬 없으면 씬 서브섹션 생략', async () => {
    const inputNoScene = { ...baseBuildInput, sceneAnalysis: null };
    const result = await buildPrescriptionPrompt(inputNoScene);
    const section2 = result.textParts.find(s => s.includes('SECTION 2'));
    expect(section2).toBeDefined();
    expect(section2).not.toContain('사전 분석된 씬 데이터');
  });

  it('pv3006_씬분석 내 hook_strength와 attention_quality 출력', async () => {
    const result = await buildPrescriptionPrompt(baseBuildInput);
    const section2 = result.textParts.find(s => s.includes('SECTION 2'))!;
    // hook_strength: 0.85 → 85%
    expect(section2).toContain('훅 강도: 85%');
    expect(section2).toContain('주목도: high');
  });

  it('pv3007_씬분석 내 deepgaze dominant_region과 cta_visible 출력', async () => {
    const result = await buildPrescriptionPrompt(baseBuildInput);
    const section2 = result.textParts.find(s => s.includes('SECTION 2'))!;
    expect(section2).toContain('중앙 상단');
    expect(section2).toContain('고정점 5개');
    expect(section2).toContain('CTA 가시: 예');
  });

  it('pv3008_씬분석 overall 정보 출력', async () => {
    const result = await buildPrescriptionPrompt(baseBuildInput);
    const section2 = result.textParts.find(s => s.includes('SECTION 2'))!;
    expect(section2).toContain('3개 씬');
    expect(section2).toContain('훅 효과=유효');
    expect(section2).toContain('CTA 도달=도달');
  });

  it('pv3009_step2가 step1 결과를 재사용하여 DB 쿼리 절약', () => {
    // step2 시그니처에 analysisJson 파라미터가 추가되었는지 확인
    expect(engineSrc).toContain('analysisJson: AnalysisJsonV3 | null');
    // generatePrescription에서 step2 호출 시 analysisJson 전달하는지 확인
    expect(engineSrc).toContain('media.media_type, analysisJson');
  });

  it('pv3010_이미지 소재에는 씬분석 서브섹션 미포함', async () => {
    const imageInput = {
      ...baseBuildInput,
      media: { media_type: 'IMAGE', ad_copy: '이미지 카피', media_url: 'https://example.com/img.jpg' },
      sceneAnalysis: null, // 이미지는 씬분석 없음
    };
    const result = await buildPrescriptionPrompt(imageInput);
    const section2 = result.textParts.find(s => s.includes('SECTION 2'))!;
    expect(section2).not.toContain('사전 분석된 씬 데이터');
  });

  it('pv3011_SceneAnalysisData 타입이 AnalysisJsonV3.scene_analysis와 일치', () => {
    // TypeScript 컴파일 타임 검증: SceneAnalysisData가 AnalysisJsonV3['scene_analysis']의 NonNullable과 호환되는지
    const testAnalysis: AnalysisJsonV3 = {
      visual: { color_scheme: 'warm', product_visibility: 'high', color: { contrast: 'high' } },
      text: { headline: '', headline_type: 'benefit', cta_text: '', key_message: '', readability: 'high', social_proof: { review_shown: false, before_after: false, testimonial: false, numbers: false } },
      psychology: { emotion: 'neutral', social_proof_type: 'none', urgency: 'none', authority: 'none' },
      quality: { production_quality: 'professional', brand_consistency: 'high', readability: 'high' },
      hook: { hook_type: 'benefit', visual_style: 'professional', composition: 'center' },
      scene_analysis: mockSceneAnalysis,
    };
    // scene_analysis가 SceneAnalysisData에 할당 가능한지 런타임 검증
    const sceneData: SceneAnalysisData = testAnalysis.scene_analysis!;
    expect(sceneData.scenes).toBeDefined();
    expect(sceneData.overall).toBeDefined();
  });

  it('pv3012_시스템 프롬프트에 사전 분석 씬 데이터 참조 지시 포함', () => {
    expect(PRESCRIPTION_SYSTEM_PROMPT).toContain('사전 분석된 씬 데이터가 있으면 이를 참조');
    expect(PRESCRIPTION_SYSTEM_PROMPT).toContain('직접 시청 결과를 우선');
  });
});
