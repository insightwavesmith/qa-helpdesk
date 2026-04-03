import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  buildPrescriptionPrompt,
  PRESCRIPTION_SYSTEM_PROMPT,
} from '@/lib/protractor/prescription-prompt';

// ── 테스트 픽스처 ──────────────────────────────────────────────────

const baseBuildInput = {
  media: { media_type: 'VIDEO', ad_copy: '테스트 카피', media_url: 'https://example.com/video.mp4' },
  saliency: { cta_attention_score: 0.7, cognitive_load: 'medium' },
  sceneAnalysis: null,
  performanceBacktrack: null,
  patterns: [],
  globalBenchmarks: [],
  andromedaResult: { diversityScore: 100, warningLevel: 'low' as const, similarPairs: [], diversificationSuggestion: null },
  similarBenchmarks: [],
  earAnalysis: { primaryBottleneck: 'foundation' as const, bottleneckDetail: '테스트', improvementPriority: '테스트' },
  hasPerformanceData: false,
};

// ── PV3 Phase 2: NO_ANALYSIS 차단 제거 + 빈 analysisJson 방어 ──────

describe('PV3 Phase 2: NO_ANALYSIS 차단 제거 + 빈 analysisJson 방어', () => {
  const engineSrc = fs.readFileSync(
    path.resolve(__dirname, '../../src/lib/protractor/prescription-engine.ts'),
    'utf-8'
  );

  it('pv3013_analysis_json_null인 소재도 처방 생성 성공', () => {
    // NO_ANALYSIS throw 블록이 제거되었는지 확인
    expect(engineSrc).not.toContain("'NO_ANALYSIS'");
    expect(engineSrc).not.toContain('이 소재는 아직 분석되지 않았습니다');
  });

  it('pv3014_analysis_json_null이면 빈 객체로 진행', () => {
    // (media.analysis_json ?? {}) as AnalysisJsonV3 패턴 확인
    expect(engineSrc).toContain('(media.analysis_json ?? {}) as AnalysisJsonV3');
  });

  it('pv3015_step4_extractAttributes_빈 analysisJson이면 빈 배열', () => {
    // extractAttributes 함수가 빈 객체 입력 시 for loop에서 axisData가 undefined이므로 continue → 빈 배열 반환
    // 소스에서 extractAttributes 함수 로직 확인
    const extractFn = engineSrc.match(/function extractAttributes[\s\S]*?^}/m);
    expect(extractFn).toBeTruthy();
    const fnBody = extractFn![0];
    // axisData가 없으면 continue하는 가드 존재
    expect(fnBody).toContain('if (!axisData) continue');
  });

  it('pv3016_step5_Andromeda_빈 analysisJson이면 diversityScore 100', () => {
    // analyzeAccountDiversity 호출이 try-catch로 감싸져 있으므로
    // 빈 analysisJson으로 실패해도 기본값 diversityScore: 100 유지
    const andromedaDefault = engineSrc.match(/let andromedaResult[\s\S]*?diversityScore:\s*(\d+)/);
    expect(andromedaDefault).toBeTruthy();
    expect(andromedaDefault![1]).toBe('100');
    // try-catch로 감싸져 있는지 확인
    expect(engineSrc).toContain('} catch {\n    // Andromeda 실패 → 경고 없이 진행');
  });

  it('pv3017_hasPerformanceData_false이면 SECTION1 스킵하고 안내 메시지 포함', async () => {
    const result = await buildPrescriptionPrompt({
      ...baseBuildInput,
      hasPerformanceData: false,
    });
    const allText = result.textParts.join('\n');

    // SECTION 1이 없어야 함 (성과 데이터 없음)
    expect(allText).not.toContain('SECTION 1: 문제 정의');

    // 성과 없는 소재 안내 메시지 포함
    const section2 = result.textParts.find(s => s.includes('SECTION 2'))!;
    expect(section2).toContain('분석 안내');
    expect(section2).toContain('이 소재는 아직 성과 데이터가 없습니다');
  });

  it('pv3018_성과 없는 소재에서 축2 데이터 부족 표시', async () => {
    const result = await buildPrescriptionPrompt({
      ...baseBuildInput,
      hasPerformanceData: false,
      patterns: [], // 패턴 없음
    });
    const section3 = result.textParts.find(s => s.includes('SECTION 3'))!;
    expect(section3).toContain('내부 패턴 데이터 부족');
  });

  it('pv3019_meta_analysis_source_fresh_analysis_json 없을 때', () => {
    // analysis_source 할당 패턴 확인: analysis_json이 없으면 'fresh'
    expect(engineSrc).toContain("analysis_source: media.analysis_json ? 'existing' : 'fresh'");
  });

  it('pv3020_meta_analysis_source_existing_analysis_json 있을 때', () => {
    // 동일 라인에서 analysis_json이 있으면 'existing'
    const match = engineSrc.match(/analysis_source:\s*media\.analysis_json\s*\?\s*'existing'\s*:\s*'fresh'/);
    expect(match).toBeTruthy();
  });

  it('pv3021_캐시 체크_빈 analysisJson이면 캐시 미적용', () => {
    // 캐시 체크 로직: analysisJson.top3_prescriptions를 참조
    // 빈 객체({})에는 top3_prescriptions가 없으므로 캐시 분기 진입 안 함
    expect(engineSrc).toContain('analysisJson.top3_prescriptions && analysisJson.top3_prescriptions.length > 0');
  });

  it('pv3022_시스템 프롬프트에 성과 없는 신규 소재 분석 지시 포함', () => {
    expect(PRESCRIPTION_SYSTEM_PROMPT).toContain('성과 데이터가 없는 신규 소재도 분석 가능합니다');
    expect(PRESCRIPTION_SYSTEM_PROMPT).toContain('축1(원론)과 축3(글로벌 벤치마크) 기반으로 처방');
  });
});
