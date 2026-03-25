#!/usr/bin/env node
// scripts/session-resume.mjs
// Checkpoint auto-resume: 팀 세션 재시작 시 이전 checkpoint를 읽어 resume context를 stdout으로 출력
//
// 사용법:
//   node scripts/session-resume.mjs cto
//   node scripts/session-resume.mjs pm
//   node scripts/session-resume.mjs marketing

import { readFile } from 'fs/promises';
import { join } from 'path';

const CROSS_TEAM_DIR = '/tmp/cross-team';
const VALID_TEAMS = ['cto', 'pm', 'marketing', 'backend', 'frontend', 'qa'];

// ==================== 인수 파싱 ====================

const teamId = process.argv[2];

if (!teamId) {
  process.stderr.write('사용법: node scripts/session-resume.mjs <team>\n');
  process.stderr.write(`팀 목록: ${VALID_TEAMS.join(', ')}\n`);
  process.exit(1);
}

// ==================== checkpoint 로드 ====================

async function loadCheckpoint(team) {
  const filePath = join(CROSS_TEAM_DIR, team, 'checkpoint.json');
  try {
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    // 파일 없음 또는 파싱 실패 — 조용히 null 반환
    return null;
  }
}

// ==================== resume context 빌드 ====================

function buildResumeContext(checkpoint) {
  const lines = ['이전 세션 복구 컨텍스트:'];

  // 기능
  if (checkpoint.currentFeature) {
    lines.push(` - 기능: ${checkpoint.currentFeature}`);
  }

  // TASK 분류
  const done = [];
  const active = [];
  const pending = [];
  const blocked = [];

  if (checkpoint.tasks && typeof checkpoint.tasks === 'object') {
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
  }

  if (done.length > 0) lines.push(` - 완료 TASK: ${done.join(', ')}`);
  if (active.length > 0) lines.push(` - 진행 중: ${active.join(', ')}`);
  if (blocked.length > 0) lines.push(` - 블로커: ${blocked.join(', ')}`);
  if (pending.length > 0) lines.push(` - 대기: ${pending.join(', ')}`);

  // git 정보
  const git = checkpoint.git;
  if (git) {
    if (git.lastCommit) {
      lines.push(` - 마지막 커밋: ${git.lastCommit.slice(0, 7)}`);
    }
    if (Array.isArray(git.changedFiles) && git.changedFiles.length > 0) {
      lines.push(` - 미커밋 변경: ${git.changedFiles.join(', ')}`);
    }
  }

  // 참조 문서
  const docs = checkpoint.documents;
  if (docs) {
    if (docs.plan) lines.push(` - 참조 문서: ${docs.plan}`);
    if (docs.design) lines.push(` - 설계서: ${docs.design}`);
    if (docs.analysis) lines.push(` - 분석 문서: ${docs.analysis}`);
  }

  // 컨텍스트 사용량
  const contextUsage = checkpoint.session?.contextUsage;
  if (typeof contextUsage === 'number' && contextUsage > 0) {
    lines.push(` - 이전 세션 컨텍스트 사용률: ${contextUsage}%`);
  }

  // blockers
  if (Array.isArray(checkpoint.blockers) && checkpoint.blockers.length > 0) {
    lines.push(` - 블로커 이슈: ${checkpoint.blockers.join('; ')}`);
  }

  // nextSteps
  if (Array.isArray(checkpoint.nextSteps) && checkpoint.nextSteps.length > 0) {
    lines.push(` - 다음 작업: ${checkpoint.nextSteps.join('; ')}`);
  }

  // notes
  if (checkpoint.notes) {
    lines.push(` - 메모: ${checkpoint.notes}`);
  }

  // 저장 시각
  if (checkpoint.savedAt) {
    lines.push(` - 저장 시각: ${checkpoint.savedAt}`);
  }

  return lines.join('\n');
}

// ==================== 메인 ====================

const checkpoint = await loadCheckpoint(teamId);

if (!checkpoint) {
  // checkpoint 없음 — 아무것도 출력하지 않고 정상 종료
  process.exit(0);
}

process.stdout.write(buildResumeContext(checkpoint) + '\n');
