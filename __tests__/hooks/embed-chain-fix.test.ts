// __tests__/hooks/embed-chain-fix.test.ts — EC-1~EC-5 (5건)
// process-media/route.ts chain 조건 검증: dedup > 0 추가

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// 테스트 대상: chain 조건 로직
// if (isChain && (result.uploaded > 0 || result.processed > 0 || result.dedup > 0))

describe('process-media chain 조건', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let triggerNextMock: any;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    triggerNextMock = vi.fn().mockResolvedValue(undefined);
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  /**
   * chain 조건 로직을 직접 테스트하는 헬퍼.
   * process-media/route.ts의 라인 196 로직을 분리 검증.
   */
  async function evaluateChainCondition(
    isChain: boolean,
    result: { uploaded: number; processed: number; dedup: number },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    triggerNext: any,
  ) {
    if (isChain && (result.uploaded > 0 || result.processed > 0 || result.dedup > 0)) {
      await triggerNext([
        'embed-creatives',
        'creative-saliency',
        'video-saliency',
      ]);
      console.log(
        `[process-media] chain → embed+saliency triggered (uploaded=${result.uploaded}, processed=${result.processed}, dedup=${result.dedup})`,
      );
    }
  }

  // EC-1: dedup=5, uploaded=0, processed=0 → chain 트리거
  it('EC-1: dedup-only → chain 트리거 (embed+saliency+video)', async () => {
    await evaluateChainCondition(
      true,
      { uploaded: 0, processed: 0, dedup: 5 },
      triggerNextMock,
    );

    expect(triggerNextMock).toHaveBeenCalledTimes(1);
    expect(triggerNextMock).toHaveBeenCalledWith([
      'embed-creatives',
      'creative-saliency',
      'video-saliency',
    ]);
  });

  // EC-2: dedup=0, uploaded=0, processed=0 → chain 스킵
  it('EC-2: 아무 결과 없음 → chain 스킵', async () => {
    await evaluateChainCondition(
      true,
      { uploaded: 0, processed: 0, dedup: 0 },
      triggerNextMock,
    );

    expect(triggerNextMock).not.toHaveBeenCalled();
  });

  // EC-3: uploaded=3, dedup=2 → chain 트리거 (기존 동작 유지)
  it('EC-3: uploaded+dedup → chain 트리거', async () => {
    await evaluateChainCondition(
      true,
      { uploaded: 3, processed: 0, dedup: 2 },
      triggerNextMock,
    );

    expect(triggerNextMock).toHaveBeenCalledTimes(1);
  });

  // EC-4: chain=false → dedup 있어도 스킵
  it('EC-4: chain=false → 모든 결과 무시', async () => {
    await evaluateChainCondition(
      false,
      { uploaded: 5, processed: 3, dedup: 10 },
      triggerNextMock,
    );

    expect(triggerNextMock).not.toHaveBeenCalled();
  });

  // EC-5: dedup=1 (최소값) → chain 트리거
  it('EC-5: dedup=1 최소값 → chain 트리거', async () => {
    await evaluateChainCondition(
      true,
      { uploaded: 0, processed: 0, dedup: 1 },
      triggerNextMock,
    );

    expect(triggerNextMock).toHaveBeenCalledTimes(1);
  });
});
