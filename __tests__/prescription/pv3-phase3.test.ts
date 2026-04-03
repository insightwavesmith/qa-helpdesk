import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// ── PV3-023~026: uploadVideoToGemini 직접 테스트 ───────────────────

describe('PV3 Phase 3: uploadVideoToGemini', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('pv3023_uploadVideoToGemini_resumable upload 시작 성공', async () => {
    const mockFetch = vi.fn()
      // 1. 영상 다운로드
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(1024)),
      })
      // 2. Resumable upload init — x-goog-upload-url 헤더 반환
      .mockResolvedValueOnce({
        headers: {
          get: (name: string) =>
            name === 'x-goog-upload-url'
              ? 'https://upload.example.com/resumable-session'
              : null,
        },
      })
      // 3. 영상 업로드 finalize
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            file: {
              name: 'files/test123',
              uri: 'gs://test/files/test123',
              state: 'ACTIVE',
              expirationTime: '2026-04-05T00:00:00Z',
            },
          }),
      });

    vi.stubGlobal('fetch', mockFetch);

    const { uploadVideoToGemini } = await import(
      '@/lib/protractor/gemini-file-uploader'
    );

    const result = await uploadVideoToGemini('https://storage.example.com/video.mp4');

    // initRes 호출 검증 (2번째 fetch)
    const initCall = mockFetch.mock.calls[1];
    expect(initCall[0]).toContain('/upload/v1beta/files');
    expect(initCall[1].headers['X-Goog-Upload-Protocol']).toBe('resumable');
    expect(initCall[1].headers['X-Goog-Upload-Command']).toBe('start');
    expect(result.name).toBe('files/test123');
  });

  it('pv3024_uploadVideoToGemini_영상 업로드 finalize 성공', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(2048)),
      })
      .mockResolvedValueOnce({
        headers: {
          get: (name: string) =>
            name === 'x-goog-upload-url'
              ? 'https://upload.example.com/session'
              : null,
        },
      })
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            file: {
              name: 'files/abc456',
              uri: 'gs://test/files/abc456',
              state: 'ACTIVE',
              expirationTime: '2026-04-05T12:00:00Z',
            },
          }),
      });

    vi.stubGlobal('fetch', mockFetch);

    const { uploadVideoToGemini } = await import(
      '@/lib/protractor/gemini-file-uploader'
    );

    const result = await uploadVideoToGemini('https://storage.example.com/v.mp4');

    expect(result).toEqual({
      name: 'files/abc456',
      uri: 'gs://test/files/abc456',
      mimeType: 'video/mp4',
      expiresAt: '2026-04-05T12:00:00Z',
    });

    // finalize 호출 검증 (3번째 fetch)
    const uploadCall = mockFetch.mock.calls[2];
    expect(uploadCall[1].method).toBe('PUT');
    expect(uploadCall[1].headers['X-Goog-Upload-Command']).toBe(
      'upload, finalize'
    );
  });

  it('pv3025_uploadVideoToGemini_PROCESSING에서 polling하여 ACTIVE 도달', async () => {
    const mockFetch = vi.fn()
      // 1. 영상 다운로드
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(512)),
      })
      // 2. init
      .mockResolvedValueOnce({
        headers: {
          get: (name: string) =>
            name === 'x-goog-upload-url'
              ? 'https://upload.example.com/sess'
              : null,
        },
      })
      // 3. finalize → PROCESSING
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            file: {
              name: 'files/poll1',
              uri: 'gs://test/files/poll1',
              state: 'PROCESSING',
              expirationTime: '2026-04-05T00:00:00Z',
            },
          }),
      })
      // 4. polling 1회차 → PROCESSING
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            name: 'files/poll1',
            uri: 'gs://test/files/poll1',
            state: 'PROCESSING',
            expirationTime: '2026-04-05T00:00:00Z',
          }),
      })
      // 5. polling 2회차 → ACTIVE
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            name: 'files/poll1',
            uri: 'gs://test/files/poll1',
            state: 'ACTIVE',
            expirationTime: '2026-04-05T00:00:00Z',
          }),
      });

    vi.stubGlobal('fetch', mockFetch);

    const { uploadVideoToGemini } = await import(
      '@/lib/protractor/gemini-file-uploader'
    );

    const result = await uploadVideoToGemini('https://storage.example.com/v.mp4');

    expect(result.name).toBe('files/poll1');
    expect(result.uri).toBe('gs://test/files/poll1');
    // 총 5회 fetch: download, init, finalize, poll1, poll2
    expect(mockFetch).toHaveBeenCalledTimes(5);
  });

  it('pv3026_uploadVideoToGemini_30회 polling 후 ACTIVE 안 되면 에러', async () => {
    vi.useFakeTimers();

    const mockFetch = vi.fn()
      // 1. 영상 다운로드
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(256)),
      })
      // 2. init
      .mockResolvedValueOnce({
        headers: {
          get: (name: string) =>
            name === 'x-goog-upload-url'
              ? 'https://upload.example.com/sess'
              : null,
        },
      })
      // 3. finalize → PROCESSING
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            file: {
              name: 'files/stuck',
              uri: 'gs://test/files/stuck',
              state: 'PROCESSING',
              expirationTime: '2026-04-05T00:00:00Z',
            },
          }),
      });

    // 30회 polling 모두 PROCESSING
    for (let i = 0; i < 31; i++) {
      mockFetch.mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            name: 'files/stuck',
            uri: 'gs://test/files/stuck',
            state: 'PROCESSING',
            expirationTime: '2026-04-05T00:00:00Z',
          }),
      });
    }

    vi.stubGlobal('fetch', mockFetch);

    const { uploadVideoToGemini } = await import(
      '@/lib/protractor/gemini-file-uploader'
    );

    let caughtError: Error | null = null;
    const promise = uploadVideoToGemini('https://storage.example.com/v.mp4')
      .catch((err: Error) => { caughtError = err; });

    // 30회 polling을 fake timer로 빠르게 소화
    for (let i = 0; i < 31; i++) {
      await vi.advanceTimersByTimeAsync(2000);
    }

    await promise;
    expect(caughtError).not.toBeNull();
    expect(caughtError!.message).toContain('영상 처리 실패');

    vi.useRealTimers();
  });
});

// ── PV3-027~029, 031~033: buildMediaPart 간접 테스트 ─────────────────

describe('PV3 Phase 3: buildMediaPart (via prescription-prompt)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('pv3027_buildMediaPart_VIDEO에서 file_data.file_uri 반환', async () => {
    // uploadVideoToGemini를 mock
    vi.doMock('@/lib/protractor/gemini-file-uploader', () => ({
      uploadVideoToGemini: vi.fn().mockResolvedValue({
        name: 'files/vid1',
        uri: 'gs://gemini/files/vid1',
        mimeType: 'video/mp4',
        expiresAt: '2026-04-05T00:00:00Z',
      }),
    }));

    const { buildPrescriptionPrompt } = await import(
      '@/lib/protractor/prescription-prompt'
    );

    const result = await buildPrescriptionPrompt({
      media: {
        media_type: 'VIDEO',
        storage_url: 'https://storage.example.com/video.mp4',
        ad_copy: '테스트',
      },
      saliency: null,
      sceneAnalysis: null,
      performanceBacktrack: null,
      patterns: [],
      globalBenchmarks: [],
      andromedaResult: {
        diversityScore: 100,
        warningLevel: 'low',
        similarPairs: [],
        diversificationSuggestion: null,
      },
      similarBenchmarks: [],
      earAnalysis: {
        primaryBottleneck: 'foundation',
        bottleneckDetail: '',
        improvementPriority: '',
      },
      hasPerformanceData: false,
    });

    // mediaPart가 file_data 구조인지 확인
    expect(result.mediaPart).toEqual({
      file_data: {
        mime_type: 'video/mp4',
        file_uri: 'gs://gemini/files/vid1',
      },
    });
  });

  it('pv3028_buildMediaPart_IMAGE에서 기존 inline_data 유지', async () => {
    // 이미지용 fetch mock
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: (name: string) =>
            name === 'content-type' ? 'image/png' : null,
        },
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(64)),
      })
    );

    // uploadVideoToGemini mock (호출 안 되어야 함)
    const mockUpload = vi.fn();
    vi.doMock('@/lib/protractor/gemini-file-uploader', () => ({
      uploadVideoToGemini: mockUpload,
    }));

    const { buildPrescriptionPrompt } = await import(
      '@/lib/protractor/prescription-prompt'
    );

    const result = await buildPrescriptionPrompt({
      media: {
        media_type: 'IMAGE',
        media_url: 'https://example.com/img.png',
        ad_copy: '이미지 테스트',
      },
      saliency: null,
      sceneAnalysis: null,
      performanceBacktrack: null,
      patterns: [],
      globalBenchmarks: [],
      andromedaResult: {
        diversityScore: 100,
        warningLevel: 'low',
        similarPairs: [],
        diversificationSuggestion: null,
      },
      similarBenchmarks: [],
      earAnalysis: {
        primaryBottleneck: 'foundation',
        bottleneckDetail: '',
        improvementPriority: '',
      },
      hasPerformanceData: false,
    });

    // inline_data 구조인지 확인
    const part = result.mediaPart as { inline_data?: { mime_type: string; data: string } };
    expect(part).toHaveProperty('inline_data');
    expect(part.inline_data?.mime_type).toBe('image/png');
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('pv3029_buildMediaPart_VIDEO 업로드 실패시 URL 텍스트 폴백', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.doMock('@/lib/protractor/gemini-file-uploader', () => ({
      uploadVideoToGemini: vi.fn().mockRejectedValue(new Error('upload failed')),
    }));

    const { buildPrescriptionPrompt } = await import(
      '@/lib/protractor/prescription-prompt'
    );

    const result = await buildPrescriptionPrompt({
      media: {
        media_type: 'VIDEO',
        storage_url: 'https://storage.example.com/video.mp4',
        ad_copy: '폴백 테스트',
      },
      saliency: null,
      sceneAnalysis: null,
      performanceBacktrack: null,
      patterns: [],
      globalBenchmarks: [],
      andromedaResult: {
        diversityScore: 100,
        warningLevel: 'low',
        similarPairs: [],
        diversificationSuggestion: null,
      },
      similarBenchmarks: [],
      earAnalysis: {
        primaryBottleneck: 'foundation',
        bottleneckDetail: '',
        improvementPriority: '',
      },
      hasPerformanceData: false,
    });

    // URL 텍스트 폴백
    const part = result.mediaPart as { text?: string };
    expect(part).toHaveProperty('text');
    expect(part.text).toContain('영상 소재 URL');
    expect(part.text).toContain('영상 직접 분석 불가');
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('pv3031_buildMediaPart_storage_url 우선 사용', () => {
    // 소스코드에서 storage_url이 media_url보다 먼저 참조되는지 확인
    const promptSource = fs.readFileSync(
      path.resolve(__dirname, '../../src/lib/protractor/prescription-prompt.ts'),
      'utf-8'
    );

    // buildMediaPart 내부에서 storage_url || media_url 순서 확인
    const mediaPartMatch = promptSource.match(
      /const url = media\.storage_url \|\| media\.media_url/
    );
    expect(mediaPartMatch).not.toBeNull();
  });

  it('pv3032_File API 다운로드 실패시 텍스트 폴백과 console.error', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // uploadVideoToGemini가 다운로드 실패 에러를 throw
    vi.doMock('@/lib/protractor/gemini-file-uploader', () => ({
      uploadVideoToGemini: vi.fn().mockRejectedValue(new Error('영상 다운로드 실패: 404')),
    }));

    const { buildPrescriptionPrompt } = await import(
      '@/lib/protractor/prescription-prompt'
    );

    const result = await buildPrescriptionPrompt({
      media: {
        media_type: 'VIDEO',
        storage_url: 'https://storage.example.com/missing.mp4',
        ad_copy: '다운로드 실패 테스트',
      },
      saliency: null,
      sceneAnalysis: null,
      performanceBacktrack: null,
      patterns: [],
      globalBenchmarks: [],
      andromedaResult: {
        diversityScore: 100,
        warningLevel: 'low',
        similarPairs: [],
        diversificationSuggestion: null,
      },
      similarBenchmarks: [],
      earAnalysis: {
        primaryBottleneck: 'foundation',
        bottleneckDetail: '',
        improvementPriority: '',
      },
      hasPerformanceData: false,
    });

    const part = result.mediaPart as { text?: string };
    expect(part).toHaveProperty('text');
    expect(part.text).toContain('영상 소재 URL');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[buildMediaPart]'),
      expect.any(Error)
    );

    consoleErrorSpy.mockRestore();
  });

  it('pv3033_File API 업로드 실패시 텍스트 폴백과 console.error', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.doMock('@/lib/protractor/gemini-file-uploader', () => ({
      uploadVideoToGemini: vi.fn().mockRejectedValue(new Error('File API 업로드 URL 획득 실패')),
    }));

    const { buildPrescriptionPrompt } = await import(
      '@/lib/protractor/prescription-prompt'
    );

    const result = await buildPrescriptionPrompt({
      media: {
        media_type: 'VIDEO',
        storage_url: 'https://storage.example.com/video.mp4',
        ad_copy: '업로드 실패 테스트',
      },
      saliency: null,
      sceneAnalysis: null,
      performanceBacktrack: null,
      patterns: [],
      globalBenchmarks: [],
      andromedaResult: {
        diversityScore: 100,
        warningLevel: 'low',
        similarPairs: [],
        diversificationSuggestion: null,
      },
      similarBenchmarks: [],
      earAnalysis: {
        primaryBottleneck: 'foundation',
        bottleneckDetail: '',
        improvementPriority: '',
      },
      hasPerformanceData: false,
    });

    const part = result.mediaPart as { text?: string };
    expect(part.text).toContain('영상 직접 분석 불가');
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});

// ── PV3-030: TIMEOUT_MS 확인 ──────────────────────────────────────────

describe('PV3 Phase 3: TIMEOUT_MS', () => {
  it('pv3030_TIMEOUT_MS_120초 확인', () => {
    const engineSource = fs.readFileSync(
      path.resolve(__dirname, '../../src/lib/protractor/prescription-engine.ts'),
      'utf-8'
    );

    expect(engineSource).toContain('TIMEOUT_MS = 120_000');
  });
});

// ── PV3-034~035: meta.video_multimodal 확인 ───────────────────────────

describe('PV3 Phase 3: meta.video_multimodal', () => {
  it('pv3034_meta_video_multimodal_true_VIDEO일 때', () => {
    const engineSource = fs.readFileSync(
      path.resolve(__dirname, '../../src/lib/protractor/prescription-engine.ts'),
      'utf-8'
    );

    // meta 블록에 video_multimodal 할당이 있는지 확인
    expect(engineSource).toContain("video_multimodal: media.media_type === 'VIDEO'");
  });

  it('pv3035_meta_video_multimodal_false_IMAGE일 때', () => {
    // VIDEO가 아닌 경우 false가 되는 로직 확인 (===로 비교)
    const engineSource = fs.readFileSync(
      path.resolve(__dirname, '../../src/lib/protractor/prescription-engine.ts'),
      'utf-8'
    );

    // media_type === 'VIDEO' 비교이므로 IMAGE일 때 false
    const match = engineSource.match(
      /video_multimodal:\s*media\.media_type\s*===\s*'VIDEO'/
    );
    expect(match).not.toBeNull();

    // 타입에 video_multimodal이 optional boolean으로 정의되어 있는지 확인
    const typeSource = fs.readFileSync(
      path.resolve(__dirname, '../../src/types/prescription.ts'),
      'utf-8'
    );
    expect(typeSource).toContain('video_multimodal?: boolean');
  });
});
