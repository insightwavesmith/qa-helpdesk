import { db } from './index.js';
import { agents, routines, workflowChains, workflowSteps } from './schema.js';

export function seed() {
  // 기본 PDCA 체인
  const chainId = 'default-pdca';
  db.insert(workflowChains).values({
    id: chainId,
    name: '기본 PDCA 체인',
    description: 'PM → CTO → QA → 배포 기본 워크플로',
    active: 1,
  }).onConflictDoNothing().run();

  // 4단계 워크플로 스텝
  const steps = [
    {
      id: 'step-pm',
      chainId,
      stepOrder: 1,
      teamRole: 'pm',
      phase: 'plan',
      label: '기획/설계',
      completionCondition: JSON.stringify({
        type: 'all',
        conditions: [
          { type: 'checklist_all_done' },
        ],
      }),
      autoTriggerNext: 1,
    },
    {
      id: 'step-cto',
      chainId,
      stepOrder: 2,
      teamRole: 'cto',
      phase: 'do',
      label: '구현',
      completionCondition: JSON.stringify({
        type: 'all',
        conditions: [
          { type: 'checklist_all_done' },
          { type: 'commit_exists' },
          { type: 'push_verified' },
        ],
      }),
      autoTriggerNext: 1,
    },
    {
      id: 'step-qa',
      chainId,
      stepOrder: 3,
      teamRole: 'cto',
      phase: 'check',
      label: 'QA/검증',
      completionCondition: JSON.stringify({
        type: 'match_rate',
        min: 90,
      }),
      autoTriggerNext: 1,
    },
    {
      id: 'step-deploy',
      chainId,
      stepOrder: 4,
      teamRole: 'cto',
      phase: 'deploy',
      label: '배포',
      completionCondition: JSON.stringify({
        type: 'build_success',
      }),
      autoTriggerNext: 0,
      deployConfig: JSON.stringify({
        command: 'gcloud run deploy bscamp --source .',
        verify: true,
      }),
    },
  ];

  for (const step of steps) {
    db.insert(workflowSteps).values(step).onConflictDoNothing().run();
  }

  // 기본 에이전트 5명
  const defaultAgents = [
    {
      id: 'agent-cto',
      name: 'cto-leader',
      displayName: 'CTO 리더',
      role: 'leader' as const,
      team: 'cto',
      icon: '👨‍💻',
      model: 'claude-opus-4-6',
    },
    {
      id: 'agent-frontend',
      name: 'frontend-dev',
      displayName: '프론트엔드 개발자',
      role: 'developer' as const,
      team: 'cto',
      icon: '🎨',
      model: 'claude-opus-4-6',
    },
    {
      id: 'agent-backend',
      name: 'backend-dev',
      displayName: '백엔드 개발자',
      role: 'developer' as const,
      team: 'cto',
      icon: '⚙️',
      model: 'claude-opus-4-6',
    },
    {
      id: 'agent-qa',
      name: 'qa-engineer',
      displayName: 'QA 엔지니어',
      role: 'qa' as const,
      team: 'cto',
      icon: '🔍',
      model: 'claude-opus-4-6',
    },
    {
      id: 'agent-pm',
      name: 'pm-leader',
      displayName: 'PM 리더',
      role: 'pm' as const,
      team: 'pm',
      icon: '📋',
      model: 'claude-opus-4-6',
    },
  ];

  for (const agent of defaultAgents) {
    db.insert(agents).values(agent).onConflictDoNothing().run();
  }

  // 기본 반복 작업 1개
  db.insert(routines).values({
    id: 'routine-daily-collect',
    name: 'daily-collect',
    description: '일일 데이터 수집',
    cronExpression: '0 2 * * *',
    command: 'bash scripts/collect-daily.sh',
    enabled: 1,
  }).onConflictDoNothing().run();

  console.log('[seed] 기본 PDCA 체인 + 4단계 + 에이전트 5명 + 반복작업 1개 생성 완료');
}
