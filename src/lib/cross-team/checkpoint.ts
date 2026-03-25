// src/lib/cross-team/checkpoint.ts
// checkpoint.json 저장/로드/복원 컨텍스트 유틸리티

import type { TeamId, TaskStatus } from '@/types/agent-dashboard';
import { promises as fs } from 'fs';
import path from 'path';

const CROSS_TEAM_DIR = '/tmp/cross-team';

// ==================== 인터페이스 ====================

export interface CheckpointSession {
  contextUsage: number;
}

export interface CheckpointTask {
  title: string;
  status: TaskStatus;
  assignee?: string;
}

export interface CheckpointGit {
  branch: string;
  lastCommit: string;
  changedFiles: string[];
}

export interface Checkpoint {
  team: TeamId;
  savedAt: string;
  session: CheckpointSession;
  currentFeature: string;
  tasks: Record<string, CheckpointTask>;
  git: CheckpointGit;
  documents: {
    plan?: string;
    design?: string;
    analysis?: string;
    report?: string;
  };
  nextSteps: string[];
  blockers: string[];
  notes: string;
}

// ==================== 유틸리티 ====================

/** checkpoint 파일 경로 반환 */
export function getCheckpointPath(team: TeamId): string {
  return path.join(CROSS_TEAM_DIR, team, 'checkpoint.json');
}

/** checkpoint.json 저장 (임시 파일 쓰기 후 rename — 손상 방지) */
export async function saveCheckpoint(checkpoint: Checkpoint): Promise<void> {
  const filePath = getCheckpointPath(checkpoint.team);
  const tmpPath = `${filePath}.tmp`;

  // 디렉토리 생성 (없으면)
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  const content = JSON.stringify(checkpoint, null, 2);
  await fs.writeFile(tmpPath, content, 'utf-8');
  await fs.rename(tmpPath, filePath);
}

/** checkpoint.json 로드 (파일 없으면 null) */
export async function loadCheckpoint(team: TeamId): Promise<Checkpoint | null> {
  const filePath = getCheckpointPath(team);

  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as Checkpoint;
  } catch {
    return null;
  }
}

/**
 * 복원 컨텍스트 문자열 생성 (새 세션 주입용)
 *
 * 예시 출력:
 * "이전 세션 복구 컨텍스트:
 *  - 기능: agent-ops-platform
 *  - 완료 TASK: P1-1 chain-watcher, P1-6 슬랙 이벤트
 *  - 진행 중: P1-3 state-sync
 *  - 대기: P1-5 PM2
 *  - 마지막 커밋: abc1234
 *  - 미커밋 변경: scripts/chain-watcher.mjs
 *  - 참조 문서: docs/01-plan/features/agent-ops-platform.plan.md"
 */
export function buildResumeContext(checkpoint: Checkpoint): string {
  const lines: string[] = ['이전 세션 복구 컨텍스트:'];

  // 기능
  if (checkpoint.currentFeature) {
    lines.push(` - 기능: ${checkpoint.currentFeature}`);
  }

  // TASK 분류
  const done: string[] = [];
  const active: string[] = [];
  const pending: string[] = [];
  const blocked: string[] = [];

  for (const [id, task] of Object.entries(checkpoint.tasks)) {
    const label = task.title ? `${id} ${task.title}` : id;
    switch (task.status) {
      case 'done':
        done.push(label);
        break;
      case 'active':
        active.push(label);
        break;
      case 'blocked':
        blocked.push(label);
        break;
      case 'pending':
      default:
        pending.push(label);
        break;
    }
  }

  if (done.length > 0) {
    lines.push(` - 완료 TASK: ${done.join(', ')}`);
  }
  if (active.length > 0) {
    lines.push(` - 진행 중: ${active.join(', ')}`);
  }
  if (blocked.length > 0) {
    lines.push(` - 블로커: ${blocked.join(', ')}`);
  }
  if (pending.length > 0) {
    lines.push(` - 대기: ${pending.join(', ')}`);
  }

  // git 정보
  if (checkpoint.git.lastCommit) {
    lines.push(` - 마지막 커밋: ${checkpoint.git.lastCommit.slice(0, 7)}`);
  }
  if (checkpoint.git.changedFiles.length > 0) {
    lines.push(` - 미커밋 변경: ${checkpoint.git.changedFiles.join(', ')}`);
  }

  // 참조 문서
  const docs = checkpoint.documents;
  if (docs.plan) {
    lines.push(` - 참조 문서: ${docs.plan}`);
  }
  if (docs.design) {
    lines.push(` - 설계서: ${docs.design}`);
  }
  if (docs.analysis) {
    lines.push(` - 분석 문서: ${docs.analysis}`);
  }

  // 컨텍스트 사용량
  if (checkpoint.session.contextUsage > 0) {
    lines.push(` - 이전 세션 컨텍스트 사용률: ${checkpoint.session.contextUsage}%`);
  }

  // blockers
  if (checkpoint.blockers.length > 0) {
    lines.push(` - 블로커 이슈: ${checkpoint.blockers.join('; ')}`);
  }

  // nextSteps
  if (checkpoint.nextSteps.length > 0) {
    lines.push(` - 다음 작업: ${checkpoint.nextSteps.join('; ')}`);
  }

  // notes
  if (checkpoint.notes) {
    lines.push(` - 메모: ${checkpoint.notes}`);
  }

  // 저장 시각
  lines.push(` - 저장 시각: ${checkpoint.savedAt}`);

  return lines.join('\n');
}
