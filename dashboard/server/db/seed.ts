import { db } from './index.js';
import { agents, routines, workflowChains, workflowSteps } from './schema.js';
import { seedAll as seedBrick } from './seed-brick.js';

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

  // ── 체인 매트릭스 (11개 유형×레벨 조합) ──
  const chainMatrix: Array<{
    id: string;
    name: string;
    description: string;
    steps: Array<{ id: string; teamRole: string; phase: string; label: string; condition: string }>;
  }> = [
    {
      id: 'DEV-L0', name: 'DEV-L0 핫픽스', description: '프로덕션 긴급 수정',
      steps: [
        { id: 'dev-l0-1', teamRole: 'cto', phase: 'do', label: '커밋', condition: '{"type":"commit_exists"}' },
        { id: 'dev-l0-2', teamRole: 'cto', phase: 'deploy', label: '배포', condition: '{"type":"build_success"}' },
        { id: 'dev-l0-3', teamRole: 'coo', phase: 'check', label: '보고', condition: '{"type":"manual"}' },
      ],
    },
    {
      id: 'DEV-L1', name: 'DEV-L1 조사/리서치', description: '코드 변경 없는 문서 작업',
      steps: [
        { id: 'dev-l1-1', teamRole: 'coo', phase: 'check', label: '보고', condition: '{"type":"manual"}' },
      ],
    },
    {
      id: 'DEV-L2', name: 'DEV-L2 일반 개발', description: '표준 기능 개발',
      steps: [
        { id: 'dev-l2-1', teamRole: 'pm', phase: 'plan', label: 'Plan', condition: '{"type":"checklist_all_done"}' },
        { id: 'dev-l2-2', teamRole: 'pm', phase: 'design', label: 'Design', condition: '{"type":"checklist_all_done"}' },
        { id: 'dev-l2-3', teamRole: 'cto', phase: 'do', label: '구현', condition: '{"type":"all","conditions":[{"type":"commit_exists"},{"type":"push_verified"}]}' },
        { id: 'dev-l2-4', teamRole: 'cto', phase: 'check', label: 'QA', condition: '{"type":"match_rate","min":95}' },
        { id: 'dev-l2-5', teamRole: 'cto', phase: 'deploy', label: '배포', condition: '{"type":"build_success"}' },
      ],
    },
    {
      id: 'DEV-L3', name: 'DEV-L3 고위험', description: 'DB/Auth/마이그레이션',
      steps: [
        { id: 'dev-l3-1', teamRole: 'pm', phase: 'plan', label: 'Plan', condition: '{"type":"checklist_all_done"}' },
        { id: 'dev-l3-2', teamRole: 'pm', phase: 'design', label: 'Design', condition: '{"type":"checklist_all_done"}' },
        { id: 'dev-l3-3', teamRole: 'cto', phase: 'do', label: '구현', condition: '{"type":"all","conditions":[{"type":"commit_exists"},{"type":"push_verified"}]}' },
        { id: 'dev-l3-4', teamRole: 'cto', phase: 'check', label: 'QA', condition: '{"type":"match_rate","min":95}' },
        { id: 'dev-l3-5', teamRole: 'cto', phase: 'act', label: '수동검수', condition: '{"type":"manual"}' },
        { id: 'dev-l3-6', teamRole: 'cto', phase: 'deploy', label: '배포', condition: '{"type":"build_success"}' },
      ],
    },
    {
      id: 'OPS-L0', name: 'OPS-L0 설정변경', description: '크론/설정 1줄 수정',
      steps: [
        { id: 'ops-l0-1', teamRole: 'cto', phase: 'deploy', label: '배포', condition: '{"type":"build_success"}' },
        { id: 'ops-l0-2', teamRole: 'coo', phase: 'check', label: '보고', condition: '{"type":"manual"}' },
      ],
    },
    {
      id: 'OPS-L1', name: 'OPS-L1 인프라작업', description: '환경변수/스케줄러',
      steps: [
        { id: 'ops-l1-1', teamRole: 'cto', phase: 'do', label: '커밋', condition: '{"type":"commit_exists"}' },
        { id: 'ops-l1-2', teamRole: 'cto', phase: 'deploy', label: '배포', condition: '{"type":"build_success"}' },
        { id: 'ops-l1-3', teamRole: 'coo', phase: 'check', label: '보고', condition: '{"type":"manual"}' },
      ],
    },
    {
      id: 'OPS-L2', name: 'OPS-L2 구조변경', description: 'DB스키마/서비스분리',
      steps: [
        { id: 'ops-l2-1', teamRole: 'pm', phase: 'plan', label: 'Plan', condition: '{"type":"checklist_all_done"}' },
        { id: 'ops-l2-2', teamRole: 'pm', phase: 'design', label: 'Design', condition: '{"type":"checklist_all_done"}' },
        { id: 'ops-l2-3', teamRole: 'cto', phase: 'do', label: '구현', condition: '{"type":"all","conditions":[{"type":"commit_exists"},{"type":"push_verified"}]}' },
        { id: 'ops-l2-4', teamRole: 'cto', phase: 'check', label: 'QA', condition: '{"type":"match_rate","min":95}' },
        { id: 'ops-l2-5', teamRole: 'cto', phase: 'deploy', label: '배포', condition: '{"type":"build_success"}' },
      ],
    },
    {
      id: 'MKT-L1', name: 'MKT-L1 단일콘텐츠', description: '블로그/SNS 1편',
      steps: [
        { id: 'mkt-l1-1', teamRole: 'coo', phase: 'check', label: '검수', condition: '{"type":"manual"}' },
        { id: 'mkt-l1-2', teamRole: 'cto', phase: 'deploy', label: '발행', condition: '{"type":"manual"}' },
        { id: 'mkt-l1-3', teamRole: 'coo', phase: 'act', label: '보고', condition: '{"type":"manual"}' },
      ],
    },
    {
      id: 'MKT-L2', name: 'MKT-L2 캠페인', description: '시리즈/다회성 콘텐츠',
      steps: [
        { id: 'mkt-l2-1', teamRole: 'pm', phase: 'plan', label: 'Plan', condition: '{"type":"checklist_all_done"}' },
        { id: 'mkt-l2-2', teamRole: 'coo', phase: 'check', label: '검수', condition: '{"type":"manual"}' },
        { id: 'mkt-l2-3', teamRole: 'cto', phase: 'deploy', label: '발행', condition: '{"type":"manual"}' },
        { id: 'mkt-l2-4', teamRole: 'coo', phase: 'act', label: '보고', condition: '{"type":"manual"}' },
      ],
    },
    {
      id: 'BIZ-L1', name: 'BIZ-L1 단순결정', description: '용어변경/우선순위조정',
      steps: [
        { id: 'biz-l1-1', teamRole: 'cto', phase: 'act', label: 'Smith님 확인', condition: '{"type":"manual"}' },
        { id: 'biz-l1-2', teamRole: 'coo', phase: 'check', label: '보고', condition: '{"type":"manual"}' },
      ],
    },
    {
      id: 'BIZ-L2', name: 'BIZ-L2 전략수립', description: '가격/파트너십/서비스방향',
      steps: [
        { id: 'biz-l2-1', teamRole: 'pm', phase: 'plan', label: 'Plan', condition: '{"type":"checklist_all_done"}' },
        { id: 'biz-l2-2', teamRole: 'cto', phase: 'act', label: 'Smith님 결정', condition: '{"type":"manual"}' },
        { id: 'biz-l2-3', teamRole: 'coo', phase: 'check', label: '보고', condition: '{"type":"manual"}' },
      ],
    },
  ];

  for (const chain of chainMatrix) {
    db.insert(workflowChains).values({
      id: chain.id,
      name: chain.name,
      description: chain.description,
      active: 1,
    }).onConflictDoNothing().run();

    for (let i = 0; i < chain.steps.length; i++) {
      const step = chain.steps[i];
      db.insert(workflowSteps).values({
        id: step.id,
        chainId: chain.id,
        stepOrder: i + 1,
        teamRole: step.teamRole,
        phase: step.phase,
        label: step.label,
        completionCondition: step.condition,
        autoTriggerNext: 1,
      }).onConflictDoNothing().run();
    }
  }

  // Brick 도메인 시딩 (블록 타입 10종 + 팀 3개 + 프리셋 4개)
  seedBrick(db);

  console.log('[seed] 실제 팀 에이전트 7명 + 반복작업 5개 + PDCA 체인 12개 생성 완료');
}
