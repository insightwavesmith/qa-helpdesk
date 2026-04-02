import type { Edge } from '@xyflow/react';

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * DAG 연결 유효성 검사
 * INV-1: 순환 방지, INV-2: 자기 참조 방지, INV-3: 중복 연결 방지
 */
export function validateConnection(
  source: string,
  target: string,
  edges: Edge[],
): ValidationResult {
  // INV-2: 자기 참조 방지
  if (source === target) {
    return { valid: false, reason: '자기 참조 불가' };
  }

  // INV-3: 중복 연결 방지
  if (edges.some((e) => e.source === source && e.target === target)) {
    return { valid: false, reason: '이미 연결됨' };
  }

  // INV-1: 순환 감지 (BFS: target에서 출발하여 source에 도달 가능한지)
  if (wouldCreateCycle(source, target, edges)) {
    return { valid: false, reason: '순환 연결 불가' };
  }

  return { valid: true };
}

function wouldCreateCycle(
  source: string,
  target: string,
  edges: Edge[],
): boolean {
  const visited = new Set<string>();
  const queue = [target];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === source) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    edges
      .filter((e) => e.source === current)
      .forEach((e) => queue.push(e.target));
  }

  return false;
}
