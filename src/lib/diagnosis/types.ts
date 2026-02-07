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
  averageAvg: number | null;
  belowAvg: number | null;
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
  source?: 'ad' | 'lp';
}

export interface PartConfig {
  name: string;
  benchmarkSource: 'quality' | 'engagement' | 'conversion';
  metrics: MetricDef[];
}
