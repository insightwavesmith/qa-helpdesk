// server/brick/engine/executor.ts — Brick ThinkLog 유틸
// startBlock/completeBlock 제거 (Step 7: Python 엔진으로 이관)
// ThinkLog 이벤트 자동 발행 (HP-001)
// think_log는 항상 저장. think_log_required는 Gate 검증용으로만 사용.
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import {
  brickExecutionLogs,
  brickBlockTypes,
} from '../../db/schema/brick.js';

export interface BlockContext {
  executionId: number;
  blockId: string;
  blockType: string;
  feature: string;
}

export interface ThinkLogEntry {
  blockId: string;
  executionId: number;
  thought: string;
  timestamp: string;
  optionsConsidered: number;
}

/**
 * 블록 실행 시 ThinkLog 이벤트 자동 발행
 * - 모든 블록 실행 시작 시 eventType='think_log' 자동 생성
 * - think_log는 항상 저장 (on/off 없음)
 */
export function emitThinkLog(
  db: BetterSQLite3Database,
  ctx: BlockContext,
  thought: string,
  optionsConsidered: number = 0,
): ThinkLogEntry {
  const now = new Date().toISOString();
  const entry: ThinkLogEntry = {
    blockId: ctx.blockId,
    executionId: ctx.executionId,
    thought,
    timestamp: now,
    optionsConsidered,
  };

  db.insert(brickExecutionLogs).values({
    executionId: ctx.executionId,
    eventType: 'think_log',
    blockId: ctx.blockId,
    data: entry,
  }).run();

  return entry;
}

/**
 * think_log_required Gate 검증
 * - 해당 블록에 think_log 이벤트가 1건 이상 존재하는지 확인
 */
export function validateThinkLogGate(
  db: BetterSQLite3Database,
  executionId: number,
  blockId: string,
): { passed: boolean; count: number } {
  const logs = db.select().from(brickExecutionLogs)
    .where(eq(brickExecutionLogs.executionId, executionId))
    .all()
    .filter(l => l.blockId === blockId && l.eventType === 'think_log');

  return { passed: logs.length > 0, count: logs.length };
}

/**
 * 블록 타입의 think_log_required 설정 조회
 */
export function isThinkLogRequired(
  db: BetterSQLite3Database,
  blockTypeName: string,
): boolean {
  const blockType = db.select().from(brickBlockTypes)
    .where(eq(brickBlockTypes.name, blockTypeName))
    .get();
  return blockType?.thinkLogRequired === true;
}
