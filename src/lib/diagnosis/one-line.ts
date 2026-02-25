import { Verdict } from './types';

/** 한줄 진단 생성 (3파트 기준, V4: creative_type 지원) */
export function generateOneLineDiagnosis(
  partVerdicts: Record<number, Verdict>,
  creativeType: string = 'VIDEO',
): string {
  const p0 = partVerdicts[0] ?? Verdict.UNKNOWN;
  const p1 = partVerdicts[1] ?? Verdict.UNKNOWN;
  const p2 = partVerdicts[2] ?? Verdict.UNKNOWN;

  // SHARE 타입: 파트0 없으므로 파트1(참여율)부터 진단
  if (creativeType === 'SHARE') {
    // 우선순위 1: 파트1 (참여율) 🔴
    if (p1 === Verdict.POOR) {
      return '광고가 눈에 안 띄어요. 반응을 이끌어내는 요소가 필요해요.';
    }

    // 우선순위 2: 파트2 (전환율) 🔴
    if (
      [Verdict.GOOD, Verdict.NORMAL, Verdict.UNKNOWN].includes(p1) &&
      p2 === Verdict.POOR
    ) {
      return '관심은 있는데 안 사요. 제품/가격/혜택을 점검하세요.';
    }

    // 전체 OK
    const activeVerdicts = [p1, p2];
    if (
      activeVerdicts.every((v) =>
        [Verdict.GOOD, Verdict.NORMAL, Verdict.UNKNOWN].includes(v),
      )
    ) {
      if (
        activeVerdicts
          .filter((v) => v !== Verdict.UNKNOWN)
          .every((v) => v === Verdict.GOOD)
      ) {
        return '잘 하고 있어요! 예산 늘려보세요.';
      }
      return '전반적으로 괜찮아요. 🟡인 부분을 개선하면 더 좋아질 거예요.';
    }

    return '데이터를 더 쌓으면 정확한 진단이 가능해요.';
  }

  // VIDEO 타입: 3파트 (기반점수 → 참여율 → 전환율)
  // 우선순위 1: 파트0 (기반점수) 🔴
  if (p0 === Verdict.POOR) {
    return '영상을 먼저 바꿔야 해요. 3초 훅이 약해요.';
  }

  // 우선순위 2: 파트0 🟢/🟡 + 파트1 (참여율) 🔴
  if ([Verdict.GOOD, Verdict.NORMAL].includes(p0) && p1 === Verdict.POOR) {
    return '광고가 눈에 안 띄어요. 반응을 이끌어내는 요소가 필요해요.';
  }

  // 우선순위 3: 파트0,1 🟢/🟡 + 파트2 (전환율) 🔴
  if (
    [Verdict.GOOD, Verdict.NORMAL].includes(p0) &&
    [Verdict.GOOD, Verdict.NORMAL].includes(p1) &&
    p2 === Verdict.POOR
  ) {
    return '관심은 있는데 안 사요. 제품/가격/혜택을 점검하세요.';
  }

  // 전체 🟢/🟡
  if (
    [Verdict.GOOD, Verdict.NORMAL].includes(p0) &&
    [Verdict.GOOD, Verdict.NORMAL].includes(p1) &&
    [Verdict.GOOD, Verdict.NORMAL].includes(p2)
  ) {
    if ([p0, p1, p2].every((v) => v === Verdict.GOOD)) {
      return '잘 하고 있어요! 예산 늘려보세요.';
    }
    return '전반적으로 괜찮아요. 🟡인 부분을 개선하면 더 좋아질 거예요.';
  }

  // 기본
  return '데이터를 더 쌓으면 정확한 진단이 가능해요.';
}
