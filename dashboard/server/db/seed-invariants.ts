// dashboard/server/db/seed-invariants.ts — INV-EB-1~11 초기 시드
import { db } from './index.js';
import { brickInvariants } from './schema/brick.js';
import { and, eq } from 'drizzle-orm';

const INITIAL_INVARIANTS = [
  {
    id: 'INV-EB-1',
    designSource: 'brick-engine-bridge.design.md',
    description: 'POST /executions는 반드시 Python 엔진을 거쳐야 한다. DB 직접 상태 전이 금지',
    constraintType: 'rule' as const,
    constraintValue: JSON.stringify({ rule: 'engine_proxy_required', endpoints: ['POST /executions'] }),
  },
  {
    id: 'INV-EB-2',
    designSource: 'brick-engine-bridge.design.md',
    description: 'complete-block 시 Gate 결과가 brickGateResults에 반드시 저장되어야 한다',
    constraintType: 'rule' as const,
    constraintValue: JSON.stringify({ rule: 'gate_result_persistence' }),
  },
  {
    id: 'INV-EB-3',
    designSource: 'brick-engine-bridge.design.md',
    description: 'blocksState의 status 값은 Python BlockStatus enum의 7가지만 허용',
    constraintType: 'enum_values' as const,
    constraintValue: JSON.stringify({
      allowed: ['pending', 'queued', 'running', 'gate_checking', 'completed', 'failed', 'suspended'],
      note: 'brick-ceo-approval-gate.design.md에서 9가지로 갱신 예정 (waiting_approval, rejected 추가)',
    }),
  },
  {
    id: 'INV-EB-4',
    designSource: 'brick-engine-bridge.design.md',
    description: '엔진 다운 시 GET(읽기)는 정상, POST(쓰기)는 502 반환',
    constraintType: 'rule' as const,
    constraintValue: JSON.stringify({ rule: 'graceful_degradation' }),
  },
  {
    id: 'INV-EB-5',
    designSource: 'brick-engine-bridge.design.md',
    description: 'seed() 호출 시 Brick 테이블에 블록 타입 10종, 팀 3개, 프리셋 4개 존재',
    constraintType: 'count' as const,
    constraintValue: JSON.stringify({ block_types: 10, teams: 3, presets: 4 }),
  },
  {
    id: 'INV-EB-6',
    designSource: 'brick-engine-bridge.design.md',
    description: 'Hook의 API 호출 경로와 Express 라우트 경로가 1:1 매칭',
    constraintType: 'rule' as const,
    constraintValue: JSON.stringify({ rule: 'hook_route_matching' }),
  },
  {
    id: 'INV-EB-7',
    designSource: 'brick-engine-bridge.design.md',
    description: 'Express execution.id ↔ Python workflow_id 매핑이 engineWorkflowId 컬럼으로 항상 존재',
    constraintType: 'rule' as const,
    constraintValue: JSON.stringify({ rule: 'id_mapping_required', column: 'engineWorkflowId' }),
  },
  {
    id: 'INV-EB-8',
    designSource: 'brick-engine-bridge.design.md',
    description: 'context는 블록 간 전파되어야 한다. 블록 A의 metrics가 블록 B의 Gate 조건에서 참조 가능',
    constraintType: 'rule' as const,
    constraintValue: JSON.stringify({ rule: 'context_propagation' }),
  },
  {
    id: 'INV-EB-9',
    designSource: 'brick-engine-bridge.design.md',
    description: 'complete-block 후 다음 블록의 TeamAdapter.start_block() 호출 필수',
    constraintType: 'rule' as const,
    constraintValue: JSON.stringify({ rule: 'adapter_start_required' }),
  },
  {
    id: 'INV-EB-10',
    designSource: 'brick-engine-bridge.design.md',
    description: '동시 실행 워크플로우 간 체크포인트 파일 충돌 없음 (workflow_id별 독립 디렉토리)',
    constraintType: 'rule' as const,
    constraintValue: JSON.stringify({ rule: 'checkpoint_isolation', path_pattern: '.bkit/runtime/workflows/{workflow_id}/' }),
  },
  {
    id: 'INV-EB-11',
    designSource: 'brick-engine-bridge.design.md',
    description: '동일 블록에 대한 중복 complete-block 호출 시 상태 일관성 보장 (멱등 또는 거부)',
    constraintType: 'rule' as const,
    constraintValue: JSON.stringify({ rule: 'idempotent_complete' }),
  },
];

export function seedInvariants(projectId: string): void {
  let inserted = 0;
  for (const inv of INITIAL_INVARIANTS) {
    const existing = db.select({ id: brickInvariants.id })
      .from(brickInvariants)
      .where(and(
        eq(brickInvariants.id, inv.id),
        eq(brickInvariants.projectId, projectId),
      ))
      .get();

    if (!existing) {
      db.insert(brickInvariants).values({
        id: inv.id,
        projectId,
        designSource: inv.designSource,
        description: inv.description,
        constraintType: inv.constraintType,
        constraintValue: inv.constraintValue,
        status: 'active',
        version: 1,
      }).run();
      inserted++;
    }
  }
  if (inserted > 0) {
    console.log(`[seed-invariants] ${inserted}건 불변식 시드 완료 (프로젝트: ${projectId})`);
  }
}
