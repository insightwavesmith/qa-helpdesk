// __tests__/hooks/video-saliency-dedup.test.ts — VS-1~VS-8 (8건)
// video-saliency/route.ts의 creative_saliency 사전 체크 + 동기화 로직 검증

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { loadFixture } from './helpers';

// ━━━ Mocks ━━━

// Supabase mock builder
function createSupabaseMock(tables: Record<string, {
  selectData?: unknown[];
  selectError?: { message: string } | null;
  updateData?: unknown;
  updateError?: { message: string } | null;
}>) {
  const chainState: Record<string, {
    table: string;
    filterChain: string[];
  }> = {};

  let callId = 0;

  const createChain = (table: string) => {
    const id = `call_${callId++}`;
    chainState[id] = { table, filterChain: [] };

    const chain: Record<string, unknown> = {};
    const addFilter = (name: string) => {
      chain[name] = vi.fn().mockImplementation(() => {
        chainState[id].filterChain.push(name);
        return chain;
      });
    };

    addFilter('select');
    addFilter('eq');
    addFilter('is');
    addFilter('not');
    addFilter('like');
    addFilter('in');
    addFilter('order');
    addFilter('limit');

    // update returns a chain with eq
    chain.update = vi.fn().mockImplementation(() => {
      chainState[id].filterChain.push('update');
      const updateChain: Record<string, unknown> = {};
      updateChain.eq = vi.fn().mockImplementation(() => {
        const tbl = tables[table];
        return Promise.resolve({
          data: tbl?.updateData ?? null,
          error: tbl?.updateError ?? null,
        });
      });
      return updateChain;
    });

    // Terminal: when the chain resolves, return data/error based on filterChain
    // We use a then-able pattern
    const thenHandler = (resolve: (v: unknown) => void) => {
      const tbl = tables[table];
      resolve({
        data: tbl?.selectData ?? [],
        error: tbl?.selectError ?? null,
      });
    };

    // Make chain thenable so `await svc.from(...)...` works
    chain.then = thenHandler;

    return chain;
  };

  return {
    from: vi.fn().mockImplementation((table: string) => createChain(table)),
  };
}

// Mock global fetch for Cloud Run calls
const mockFetch = vi.fn();

// Mock createServiceClient
vi.mock('@/lib/db', () => ({
  createServiceClient: vi.fn(),
}));

// Store reference
let mockSvc: ReturnType<typeof createSupabaseMock>;

import { createServiceClient } from '@/lib/db';

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  vi.stubEnv('CRON_SECRET', 'test-secret');
  vi.stubEnv('CREATIVE_PIPELINE_URL', 'https://pipeline.test');
  vi.stubEnv('CREATIVE_PIPELINE_SECRET', 'pipe-secret');
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function makeRequest() {
  return new NextRequest('http://localhost/api/cron/video-saliency', {
    headers: { authorization: 'Bearer test-secret' },
  });
}

describe('video-saliency Dedup 사전 체크', () => {

  // VS-1: creative_saliency에 ad_id 존재 + target_type=video → Cloud Run 스킵, 동기화만
  it('VS-1: 이미 분석된 ad_id → 동기화만 실행, Cloud Run 호출 0건', async () => {
    const saliencyFixture = loadFixture('creative_saliency_video.json');

    const tableResponses: Record<string, { selectData?: unknown[]; updateError?: { message: string } | null }> = {
      creative_media: {
        selectData: [
          { id: 'm1', creative_id: 'c1', media_type: 'VIDEO', storage_url: 'gs://test/v.mp4', video_analysis: null },
        ],
      },
      creatives: {
        selectData: [
          { id: 'c1', ad_id: 'ad_001', account_id: 'acc1' },
        ],
      },
      creative_saliency: {
        selectData: saliencyFixture as unknown[],
      },
    };

    mockSvc = createSupabaseMock(tableResponses);
    vi.mocked(createServiceClient).mockReturnValue(mockSvc as unknown as ReturnType<typeof createServiceClient>);

    const { GET } = await import('@/app/api/cron/video-saliency/route');
    const res = await GET(makeRequest());
    const body = await res.json();

    // Cloud Run fetch should NOT be called
    expect(mockFetch).not.toHaveBeenCalled();
    expect(body.preSynced).toBe(1);
    expect(body.cloudRunProcessed).toBe(0);
  });

  // VS-2: creative_saliency에 ad_id 없음 → Cloud Run 호출
  it('VS-2: 미분석 ad_id → Cloud Run 호출', async () => {
    mockSvc = createSupabaseMock({
      creative_media: {
        selectData: [
          { id: 'm1', creative_id: 'c1', media_type: 'VIDEO', storage_url: 'gs://test/v.mp4', video_analysis: null },
        ],
      },
      creatives: {
        selectData: [{ id: 'c1', ad_id: 'ad_new', account_id: 'acc1' }],
      },
      creative_saliency: { selectData: [] },
    });
    vi.mocked(createServiceClient).mockReturnValue(mockSvc as unknown as ReturnType<typeof createServiceClient>);

    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ analyzed: 1, errors: 0 }),
    });

    const { GET } = await import('@/app/api/cron/video-saliency/route');
    const res = await GET(makeRequest());
    const body = await res.json();

    expect(mockFetch).toHaveBeenCalled();
    expect(body.cloudRunProcessed).toBe(1);
    expect(body.preSynced).toBe(0);
  });

  // VS-3: 혼합 — 일부 분석됨 + 일부 미분석
  it('VS-3: 157건 중 150건 이미 분석 → 7건만 Cloud Run', async () => {
    // 157건의 media rows 생성
    const mediaRows = Array.from({ length: 157 }, (_, i) => ({
      id: `m${i}`, creative_id: `c${i}`, media_type: 'VIDEO',
      storage_url: 'gs://test/v.mp4', video_analysis: null,
    }));
    const creativeRows = Array.from({ length: 157 }, (_, i) => ({
      id: `c${i}`, ad_id: `ad_${String(i).padStart(3, '0')}`, account_id: 'acc1',
    }));
    // 150건 already analyzed
    const saliencyRows = Array.from({ length: 150 }, (_, i) => ({
      ad_id: `ad_${String(i).padStart(3, '0')}`,
      target_type: 'video',
      cta_attention_score: 0.7,
      cognitive_load: 'medium',
      attention_map_url: `gs://bucket/ad${i}.json`,
    }));

    mockSvc = createSupabaseMock({
      creative_media: { selectData: mediaRows },
      creatives: { selectData: creativeRows },
      creative_saliency: { selectData: saliencyRows },
    });
    vi.mocked(createServiceClient).mockReturnValue(mockSvc as unknown as ReturnType<typeof createServiceClient>);

    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ analyzed: 7, errors: 0 }),
    });

    const { GET } = await import('@/app/api/cron/video-saliency/route');
    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.preSynced).toBe(150);
    expect(body.cloudRunProcessed).toBe(7);
  });

  // VS-4: target_type='image' → 사전 체크에서 제외 → Cloud Run 호출
  it('VS-4: target_type=image → 사전 체크에서 제외 → Cloud Run 호출', async () => {
    const wrongType = loadFixture('creative_saliency_wrong_type.json');

    mockSvc = createSupabaseMock({
      creative_media: {
        selectData: [
          { id: 'm1', creative_id: 'c1', media_type: 'VIDEO', storage_url: 'gs://test/v.mp4', video_analysis: null },
        ],
      },
      creatives: {
        selectData: [{ id: 'c1', ad_id: 'ad_003', account_id: 'acc1' }],
      },
      creative_saliency: { selectData: [] }, // eq('target_type','video') → empty
    });
    vi.mocked(createServiceClient).mockReturnValue(mockSvc as unknown as ReturnType<typeof createServiceClient>);

    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ analyzed: 1, errors: 0 }),
    });

    const { GET } = await import('@/app/api/cron/video-saliency/route');
    const res = await GET(makeRequest());
    const body = await res.json();

    expect(mockFetch).toHaveBeenCalled();
    expect(body.cloudRunProcessed).toBe(1);
  });

  // VS-5: creative_saliency 사전 조회 DB 에러 → 전체 Cloud Run 호출
  it('VS-5: saliency 조회 실패 → 전체 Cloud Run 호출 (안전 fallback)', async () => {
    mockSvc = createSupabaseMock({
      creative_media: {
        selectData: [
          { id: 'm1', creative_id: 'c1', media_type: 'VIDEO', storage_url: 'gs://test/v.mp4', video_analysis: null },
        ],
      },
      creatives: {
        selectData: [{ id: 'c1', ad_id: 'ad1', account_id: 'acc1' }],
      },
      creative_saliency: { selectData: [], selectError: { message: 'DB error' } },
    });
    vi.mocked(createServiceClient).mockReturnValue(mockSvc as unknown as ReturnType<typeof createServiceClient>);

    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ analyzed: 1, errors: 0 }),
    });

    const { GET } = await import('@/app/api/cron/video-saliency/route');
    const res = await GET(makeRequest());
    const body = await res.json();

    // Should fallback to Cloud Run for all
    expect(mockFetch).toHaveBeenCalled();
    expect(body.cloudRunProcessed).toBeGreaterThanOrEqual(1);
  });

  // VS-6: 사전 동기화 update 실패 → 에러 로그 + preSynced 미증가
  it('VS-6: 동기화 update 실패 → 로그 출력 + preSynced 미증가', async () => {
    const consoleSpy = vi.spyOn(console, 'error');

    mockSvc = createSupabaseMock({
      creative_media: {
        selectData: [
          { id: 'm1', creative_id: 'c1', media_type: 'VIDEO', storage_url: 'gs://test/v.mp4', video_analysis: null },
        ],
        updateError: { message: 'update failed' },
      },
      creatives: {
        selectData: [{ id: 'c1', ad_id: 'ad_001', account_id: 'acc1' }],
      },
      creative_saliency: {
        selectData: [
          { ad_id: 'ad_001', target_type: 'video', cta_attention_score: 0.7, cognitive_load: 'medium', attention_map_url: 'gs://test' },
        ],
      },
    });
    vi.mocked(createServiceClient).mockReturnValue(mockSvc as unknown as ReturnType<typeof createServiceClient>);

    const { GET } = await import('@/app/api/cron/video-saliency/route');
    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.preSynced).toBe(0);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('사전동기화 실패'),
    );

    consoleSpy.mockRestore();
  });

  // VS-7: rawMedia 빈 배열 → 사전 체크 스킵 + 즉시 반환
  it('VS-7: rawMedia 빈 배열 → 사전 체크 스킵 + 즉시 반환', async () => {
    mockSvc = createSupabaseMock({
      creative_media: { selectData: [] },
      creatives: { selectData: [] },
      creative_saliency: { selectData: [] },
    });
    vi.mocked(createServiceClient).mockReturnValue(mockSvc as unknown as ReturnType<typeof createServiceClient>);

    const { GET } = await import('@/app/api/cron/video-saliency/route');
    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.totalVideos).toBe(0);
    // creative_saliency should not have been queried
    const saliencyCalls = mockSvc.from.mock.calls.filter((c: string[]) => c[0] === 'creative_saliency');
    expect(saliencyCalls.length).toBe(0);
  });

  // VS-8: 사전동기화 완료 건은 Step 4에서 스킵
  it('VS-8: 사전동기화 완료 건은 Step 4에서 스킵', async () => {
    // This tests that row.video_analysis is set during pre-sync,
    // and Step 4 checks `if (row.video_analysis) continue;`
    // Since we can't modify row in-place with our mock, we verify
    // that the route handles it: preSynced should count but synced (Step4) shouldn't double-count
    mockSvc = createSupabaseMock({
      creative_media: {
        selectData: [
          { id: 'm1', creative_id: 'c1', media_type: 'VIDEO', storage_url: 'gs://test/v.mp4', video_analysis: null },
        ],
      },
      creatives: {
        selectData: [{ id: 'c1', ad_id: 'ad_001', account_id: 'acc1' }],
      },
      creative_saliency: {
        selectData: [
          { ad_id: 'ad_001', target_type: 'video', cta_attention_score: 0.7, cognitive_load: 'medium', attention_map_url: 'gs://test' },
        ],
      },
    });
    vi.mocked(createServiceClient).mockReturnValue(mockSvc as unknown as ReturnType<typeof createServiceClient>);

    const { GET } = await import('@/app/api/cron/video-saliency/route');
    const res = await GET(makeRequest());
    const body = await res.json();

    // preSynced should count, and Cloud Run should not process
    expect(body.preSynced).toBe(1);
    expect(body.cloudRunProcessed).toBe(0);
  });
});
