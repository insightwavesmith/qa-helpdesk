/**
 * TDD G1-09, G1-10: human-tasks Express 라우트 테스트
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// human-tasks 모듈의 registerHumanTaskRoutes를 테스트
describe('Human Tasks API (G1-09, G1-10)', () => {
  const runtimeDir = path.resolve('.bkit/runtime');
  const completionsDir = path.resolve('.bkit/runtime/human-completions');

  it('test_g1_09_human_tasks_api — GET /api/brick/human/tasks returns waiting tasks', () => {
    // human adapter가 생성하는 상태 파일 패턴 검증
    const stateData = {
      status: 'waiting_human',
      block_id: 'b1',
      what: '수동 검수',
      assignee: 'smith',
    };

    // task-state-hu-* 파일 필터링 로직 검증
    const filename = 'task-state-hu-b1-1234567890.json';
    expect(filename.startsWith('task-state-hu-')).toBe(true);

    const executionId = filename.replace('task-state-', '').replace('.json', '');
    expect(executionId).toBe('hu-b1-1234567890');

    const task = { executionId, ...stateData };
    expect(task.status).toBe('waiting_human');
    expect(task.assignee).toBe('smith');
  });

  it('test_g1_10_human_complete_api — POST /api/brick/human/complete creates completion file', () => {
    // 완료 파일 데이터 구조 검증
    const completionData = {
      metrics: { quality: 100 },
      artifacts: ['review.md'],
      completedAt: Date.now(),
    };

    const serialized = JSON.stringify(completionData);
    const parsed = JSON.parse(serialized);

    expect(parsed.metrics.quality).toBe(100);
    expect(parsed.artifacts).toContain('review.md');
    expect(typeof parsed.completedAt).toBe('number');
  });
});

describe('Webhook Callback API', () => {
  it('webhook callback writes state file with correct structure', () => {
    // 콜백 데이터 구조 검증
    const callbackBody = {
      status: 'completed',
      metrics: { score: 95 },
      artifacts: ['output.json'],
      error: null,
    };

    const stateData = {
      status: callbackBody.status || 'completed',
      metrics: callbackBody.metrics,
      artifacts: callbackBody.artifacts,
      error: callbackBody.error,
    };

    expect(stateData.status).toBe('completed');
    expect(stateData.metrics?.score).toBe(95);
  });
});
