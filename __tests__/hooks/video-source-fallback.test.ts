// __tests__/hooks/video-source-fallback.test.ts — VF-1~VF-7 (7건)
// fetchVideoSourceUrls 개별 fallback 로직 검증

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// fetchVideoSourceUrls 내부에서 fetchMetaWithRetry를 사용하지만 non-exported.
// fetch를 global mock하여 Meta API 응답을 제어한다.
// 주의: fetchMetaWithRetry는 response.ok를 체크하므로 ok: true 필수

const mockFetch = vi.fn();

function okResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    headers: new Headers(),
  };
}

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  vi.stubEnv('META_ACCESS_TOKEN', 'test-token');
  mockFetch.mockReset();
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('fetchVideoSourceUrls 개별 fallback', () => {

  // VF-1: 계정 리스팅에서 전부 발견 → 개별 조회 안 함
  it('VF-1: 계정 리스팅 전부 hit → 개별 조회 스킵', async () => {
    mockFetch.mockResolvedValueOnce(okResponse({
      data: [
        { id: 'vid_001', source: 'https://video.xx.fbcdn.net/v/vid_001.mp4' },
        { id: 'vid_002', source: 'https://video.xx.fbcdn.net/v/vid_002.mp4' },
      ],
      paging: { cursors: { before: 'abc', after: null } },
    }));

    const { fetchVideoSourceUrls } = await import('@/lib/protractor/creative-image-fetcher');
    const result = await fetchVideoSourceUrls('act_123', ['vid_001', 'vid_002']);

    expect(result.size).toBe(2);
    expect(result.get('vid_001')).toBe('https://video.xx.fbcdn.net/v/vid_001.mp4');
    // Only 1 fetch call (account listing)
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  // VF-2: 계정 리스팅 부분 hit → 미발견 건 개별 조회 → 성공
  it('VF-2: 리스팅 2/3 hit → 1건 개별 조회 성공', async () => {
    // 1st call: account listing returns only vid_001, vid_002
    mockFetch.mockResolvedValueOnce(okResponse({
      data: [
        { id: 'vid_001', source: 'https://video.xx.fbcdn.net/v/vid_001.mp4' },
        { id: 'vid_002', source: 'https://video.xx.fbcdn.net/v/vid_002.mp4' },
      ],
      paging: { cursors: { before: 'abc', after: null } },
    }));

    // 2nd call: individual GET /vid_003
    mockFetch.mockResolvedValueOnce(okResponse({
      id: 'vid_003',
      source: 'https://video.xx.fbcdn.net/v/vid_003.mp4',
    }));

    const { fetchVideoSourceUrls } = await import('@/lib/protractor/creative-image-fetcher');
    const result = await fetchVideoSourceUrls('act_123', ['vid_001', 'vid_002', 'vid_003']);

    expect(result.size).toBe(3);
    expect(result.get('vid_003')).toBe('https://video.xx.fbcdn.net/v/vid_003.mp4');
    // 2 fetch calls: listing + individual
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  // VF-3: 개별 조회도 실패 (source null) → 최종 경고
  it('VF-3: 개별 조회 source=null → 최종 미발견 경고', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    // Account listing: no results
    mockFetch.mockResolvedValueOnce(okResponse({
      data: [],
      paging: { cursors: { before: null, after: null } },
    }));

    // Individual GET: no source field
    mockFetch.mockResolvedValueOnce(okResponse({ id: 'vid_missing' }));

    const { fetchVideoSourceUrls } = await import('@/lib/protractor/creative-image-fetcher');
    const result = await fetchVideoSourceUrls('act_123', ['vid_missing']);

    expect(result.size).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('최종 미발견'),
    );

    warnSpy.mockRestore();
  });

  // VF-4: 계정 리스팅 권한 에러 → 조기 반환 (개별 조회 안 함)
  it('VF-4: 리스팅 권한 에러 (#10) → 즉시 반환, 개별 미시도', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mockFetch.mockResolvedValueOnce(okResponse({
      error: { message: 'Unsupported request - method type GET is not supported for this endpoint (#10)' },
    }));

    const { fetchVideoSourceUrls } = await import('@/lib/protractor/creative-image-fetcher');
    const result = await fetchVideoSourceUrls('act_123', ['vid_001', 'vid_002']);

    expect(result.size).toBe(0);
    // Only 1 call (listing), no individual calls
    expect(mockFetch).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });

  // VF-5: 개별 조회 권한 에러 → 해당 건 스킵, 나머지 진행
  it('VF-5: 개별 조회 권한 에러 → 스킵 + 나머지 성공', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    // Account listing: empty
    mockFetch.mockResolvedValueOnce(okResponse({
      data: [],
      paging: { cursors: { before: null, after: null } },
    }));

    // Individual GET /vid_perm: permission error
    mockFetch.mockResolvedValueOnce(okResponse({
      error: { message: 'This endpoint is not supported for this content (#283)' },
    }));

    // Individual GET /vid_ok: success
    mockFetch.mockResolvedValueOnce(okResponse({
      id: 'vid_ok',
      source: 'https://video.xx.fbcdn.net/v/vid_ok.mp4',
    }));

    const { fetchVideoSourceUrls } = await import('@/lib/protractor/creative-image-fetcher');
    const result = await fetchVideoSourceUrls('act_123', ['vid_perm', 'vid_ok']);

    expect(result.size).toBe(1);
    expect(result.has('vid_ok')).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('vid_perm'),
    );

    warnSpy.mockRestore();
  });

  // VF-6: 개별 조회 네트워크 에러 → catch + 계속
  it('VF-6: 개별 조회 네트워크 실패 → 스킵 + 나머지 진행', async () => {
    vi.useFakeTimers();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    // Account listing: empty
    mockFetch.mockResolvedValueOnce(okResponse({
      data: [],
      paging: { cursors: { before: null, after: null } },
    }));

    // Individual vid_timeout: network error (3 retries: attempt 0,1,2)
    mockFetch.mockRejectedValueOnce(new Error('timeout'));
    mockFetch.mockRejectedValueOnce(new Error('timeout'));
    mockFetch.mockRejectedValueOnce(new Error('timeout'));

    // Individual vid_ok2: success
    mockFetch.mockResolvedValueOnce(okResponse({
      id: 'vid_ok2',
      source: 'https://video.xx.fbcdn.net/v/vid_ok2.mp4',
    }));

    const { fetchVideoSourceUrls } = await import('@/lib/protractor/creative-image-fetcher');
    const resultPromise = fetchVideoSourceUrls('act_123', ['vid_timeout', 'vid_ok2']);

    // Advance timers to skip fetchMetaWithRetry delays
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(10_000);
    }

    const result = await resultPromise;

    expect(result.size).toBe(1);
    expect(result.has('vid_ok2')).toBe(true);

    warnSpy.mockRestore();
    vi.useRealTimers();
  });

  // VF-7: 배치 5개씩 처리 확인 (6개 입력 → 2 배치)
  it('VF-7: 6개 미발견 → 5+1 배치로 개별 조회', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});

    // Account listing: empty
    mockFetch.mockResolvedValueOnce(okResponse({
      data: [],
      paging: { cursors: { before: null, after: null } },
    }));

    // 6 individual calls, all succeed
    for (let i = 1; i <= 6; i++) {
      mockFetch.mockResolvedValueOnce(okResponse({
        id: `v${i}`,
        source: `https://video.xx.fbcdn.net/v/v${i}.mp4`,
      }));
    }

    const { fetchVideoSourceUrls } = await import('@/lib/protractor/creative-image-fetcher');
    const result = await fetchVideoSourceUrls('act_123', ['v1', 'v2', 'v3', 'v4', 'v5', 'v6']);

    expect(result.size).toBe(6);
    // 1 listing + 6 individual = 7 calls
    expect(mockFetch).toHaveBeenCalledTimes(7);
  });
});
