export enum Verdict {
  GOOD = '🟢',
  NORMAL = '🟡',
  POOR = '🔴',
  UNKNOWN = '⚪',
}

export interface MetricResult {
  metricName: string;
  myValue: number | null;
  aboveAvg: number | null;
  verdict: Verdict;
  isReverse: boolean;
}

export interface PartResult {
  partNum: number;
  partName: string;
  metrics: MetricResult[];
  verdict: Verdict;
}

export interface DiagnosisResult {
  adId: string;
  adName: string;
  parts: PartResult[];
  overallVerdict: Verdict;
  oneLineDiagnosis: string;
}

export interface MetricDef {
  key: string;
  label: string;
  reverse: boolean;
  /** 파트의 benchmarkSource를 덮어씀 (예: Part0의 ctr → conversion 기준) */
  benchmarkSourceOverride?: 'engagement' | 'conversion';
}

export interface PartConfig {
  name: string;
  benchmarkSource: 'engagement' | 'conversion';
  metrics: MetricDef[];
}
