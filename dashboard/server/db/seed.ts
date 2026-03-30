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

  // 실제 팀 에이전트 7명
  const defaultAgents = [
    {
      id: 'mozzi-coo',
      name: 'mozzi',
      displayName: '모찌',
      role: 'coo' as const,
      team: null,
      icon: '🍡',
      model: 'claude-opus-4-6',
      reportsTo: null,
    },
    {
      id: 'tendon-leader',
      name: 'tendon',
      displayName: '모찌 텐동',
      role: 'leader' as const,
      team: 'dev',
      icon: '🍤',
      model: 'claude-opus-4-6',
      reportsTo: 'mozzi-coo',
    },
    {
      id: 'sdk-cto',
      name: 'sdk-cto',
      displayName: 'CTO',
      role: 'leader' as const,
      team: 'cto',
      icon: '👨‍💻',
      model: 'claude-opus-4-6',
      tmuxSession: 'sdk-cto',
      reportsTo: 'tendon-leader',
    },
    {
      id: 'sdk-cto-2',
      name: 'sdk-cto-2',
      displayName: 'CTO-2',
      role: 'developer' as const,
      team: 'cto',
      icon: '⚙️',
      model: 'claude-opus-4-6',
      tmuxSession: 'sdk-cto-2',
      reportsTo: 'sdk-cto',
    },
    {
      id: 'sdk-cto-3',
      name: 'sdk-cto-3',
      displayName: 'CTO-3',
      role: 'developer' as const,
      team: 'cto',
      icon: '🔧',
      model: 'claude-opus-4-6',
      tmuxSession: 'sdk-cto-3',
      reportsTo: 'sdk-cto',
    },
    {
      id: 'sdk-pm',
      name: 'sdk-pm',
      displayName: 'PM',
      role: 'pm' as const,
      team: 'pm',
      icon: '📋',
      model: 'claude-opus-4-6',
      tmuxSession: 'sdk-pm',
      reportsTo: 'tendon-leader',
    },
    {
      id: 'cron-worker',
      name: 'cron-worker',
      displayName: '크론 워커',
      role: 'developer' as const,
      team: 'infra',
      icon: '⏰',
      model: null,
      reportsTo: null,
    },
  ];

  // reportsTo FK 순서 보장: 자기참조이므로 순서대로 삽입
  for (const agent of defaultAgents) {
    db.insert(agents).values(agent).onConflictDoNothing().run();
  }

  // 반복 작업 5개
  const defaultRoutines = [
    {
      id: 'routine-daily-collect',
      name: 'daily-collect',
      description: '일일 데이터 수집',
      cronExpression: '0 2 * * *',
      command: 'bash scripts/collect-daily.sh',
      enabled: 1,
    },
    {
      id: 'routine-embed-creatives',
      name: 'embed-creatives',
      description: '크리에이티브 임베딩 (Cloud Run Job)',
      cronExpression: '0 */4 * * *',
      command: 'Cloud Run Job',
      enabled: 1,
    },
    {
      id: 'routine-creative-saliency',
      name: 'creative-saliency',
      description: '크리에이티브 시선 분석 (Cloud Scheduler)',
      cronExpression: '30 */6 * * *',
      command: 'Cloud Scheduler',
      enabled: 1,
    },
    {
      id: 'routine-video-saliency',
      name: 'video-saliency',
      description: '비디오 시선 분석 (Cloud Scheduler)',
      cronExpression: '0 8 * * *',
      command: 'Cloud Scheduler',
      enabled: 1,
    },
    {
      id: 'routine-video-scene-analysis',
      name: 'video-scene-analysis',
      description: '비디오 장면 분석 (Cloud Scheduler)',
      cronExpression: '0 14 * * *',
      command: 'Cloud Scheduler',
      enabled: 1,
    },
  ];

  for (const routine of defaultRoutines) {
    db.insert(routines).values(routine).onConflictDoNothing().run();
  }

  console.log('[seed] 실제 팀 에이전트 7명 + 반복작업 5개 + PDCA 체인 생성 완료');
}
