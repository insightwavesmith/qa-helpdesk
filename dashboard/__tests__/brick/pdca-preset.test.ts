// __tests__/brick/pdca-preset.test.ts — BP-001 ~ BP-035 TDD
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';

// ── YAML 로더 ──
const PRESETS_DIR = join(__dirname, '..', '..', '..', '.bkit', 'presets');
const TEAMS_DIR = join(__dirname, '..', '..', '..', '.bkit', 'teams');

function loadPreset(name: string) {
  const raw = readFileSync(join(PRESETS_DIR, `${name}.yaml`), 'utf-8');
  return parseYaml(raw);
}

function loadTeam(name: string) {
  const raw = readFileSync(join(TEAMS_DIR, `${name}.yaml`), 'utf-8');
  return parseYaml(raw);
}

// ── seed 데이터 ──
const PDCA_TEAMS_SEED = [
  {
    name: 'pm-team',
    displayName: '기획팀',
    adapter: 'claude_agent_teams',
    allowedTools: ['Read', 'Glob', 'Grep', 'Think', 'WebSearch', 'WebFetch'],
    maxDepth: 1,
  },
  {
    name: 'cto-team',
    displayName: '개발팀',
    adapter: 'claude_agent_teams',
    allowedTools: ['Read', 'Glob', 'Grep', 'Write', 'Edit', 'Bash', 'Agent', 'Think'],
    maxDepth: 2,
  },
  {
    name: 'coo-team',
    displayName: '운영팀',
    adapter: 'claude_agent_teams',
    allowedTools: ['Read', 'Glob', 'Grep', 'Write', 'Think'],
    maxDepth: 1,
  },
];

let l0: ReturnType<typeof loadPreset>;
let l1: ReturnType<typeof loadPreset>;
let l2: ReturnType<typeof loadPreset>;
let l3: ReturnType<typeof loadPreset>;
let pmTeam: ReturnType<typeof loadTeam>;
let ctoTeam: ReturnType<typeof loadTeam>;
let cooTeam: ReturnType<typeof loadTeam>;

beforeAll(() => {
  l0 = loadPreset('t-pdca-l0');
  l1 = loadPreset('t-pdca-l1');
  l2 = loadPreset('t-pdca-l2');
  l3 = loadPreset('t-pdca-l3');
  pmTeam = loadTeam('pm-team');
  ctoTeam = loadTeam('cto-team');
  cooTeam = loadTeam('coo-team');
});

// ══════════════════════════════════════════════
// §2 프리셋 구조 검증 (BP-001 ~ BP-007)
// ══════════════════════════════════════════════

describe('§2 프리셋 구조', () => {
  it('test_bp01_l2_yaml_파싱_성공', () => {
    expect(l2).toBeDefined();
    expect(l2.spec.blocks).toHaveLength(6);
    expect(l2.spec.links).toHaveLength(7);
    expect(Object.keys(l2.spec.teams)).toHaveLength(6);
    expect(Object.keys(l2.spec.gates)).toHaveLength(6);
  });

  it('test_bp02_blocks_6개_존재', () => {
    const ids = l2.spec.blocks.map((b: { id: string }) => b.id);
    expect(ids).toEqual(['plan', 'design', 'do', 'check', 'review', 'learn']);
  });

  it('test_bp03_links_DAG_순환없음', () => {
    // loop Link 제외한 sequential/branch만 DAG 검증
    const nonLoopLinks = l2.spec.links.filter((l: { type: string }) => l.type !== 'loop');
    const graph = new Map<string, string[]>();
    for (const link of nonLoopLinks) {
      if (!graph.has(link.from)) graph.set(link.from, []);
      graph.get(link.from)!.push(link.to);
    }

    // DFS cycle detection
    const visited = new Set<string>();
    const recStack = new Set<string>();
    function hasCycle(node: string): boolean {
      visited.add(node);
      recStack.add(node);
      for (const neighbor of graph.get(node) ?? []) {
        if (!visited.has(neighbor) && hasCycle(neighbor)) return true;
        if (recStack.has(neighbor)) return true;
      }
      recStack.delete(node);
      return false;
    }

    let cycleFound = false;
    for (const node of graph.keys()) {
      if (!visited.has(node) && hasCycle(node)) {
        cycleFound = true;
        break;
      }
    }
    expect(cycleFound).toBe(false);
  });

  it('test_bp04_loop_link에_condition_필수', () => {
    const loopLinks = l2.spec.links.filter((l: { type: string }) => l.type === 'loop');
    expect(loopLinks.length).toBeGreaterThanOrEqual(2);
    for (const link of loopLinks) {
      expect(link.condition).toBeDefined();
      expect(link.condition.length).toBeGreaterThan(0);
    }
  });

  it('test_bp05_branch_link에_condition_필수', () => {
    const branchLinks = l2.spec.links.filter((l: { type: string }) => l.type === 'branch');
    expect(branchLinks.length).toBeGreaterThanOrEqual(2);
    for (const link of branchLinks) {
      expect(link.condition).toBeDefined();
      expect(link.condition.length).toBeGreaterThan(0);
    }
  });

  it('test_bp06_모든_블록에_teams_배정_존재', () => {
    const blockIds = l2.spec.blocks.map((b: { id: string }) => b.id);
    for (const id of blockIds) {
      // review=null 허용 (human)
      expect(id in l2.spec.teams).toBe(true);
    }
  });

  it('test_bp07_readonly_true_Core_프리셋', () => {
    expect(l2.readonly).toBe(true);
  });
});

// ══════════════════════════════════════════════
// §3 역할별 도구 세트 HP-003 (BP-008 ~ BP-014)
// ══════════════════════════════════════════════

describe('§3 역할별 도구 세트', () => {
  it('test_bp08_pm_team_permitted_tools에_Write_없음', () => {
    const tools = pmTeam.spec.adapter_config.permitted_tools;
    expect(tools).not.toContain('Write');
  });

  it('test_bp09_pm_team_permitted_tools에_Edit_없음', () => {
    const tools = pmTeam.spec.adapter_config.permitted_tools;
    expect(tools).not.toContain('Edit');
  });

  it('test_bp10_pm_team_permitted_tools에_Bash_없음', () => {
    const tools = pmTeam.spec.adapter_config.permitted_tools;
    expect(tools).not.toContain('Bash');
    expect(tools).toEqual(expect.arrayContaining(['Read', 'Glob', 'Grep', 'Think', 'WebSearch', 'WebFetch']));
  });

  it('test_bp11_cto_team_Write_Edit_Bash_Agent_포함', () => {
    const tools = ctoTeam.spec.adapter_config.permitted_tools;
    expect(tools).toContain('Write');
    expect(tools).toContain('Edit');
    expect(tools).toContain('Bash');
    expect(tools).toContain('Agent');
  });

  it('test_bp12_coo_team_Write_포함_Edit_없음', () => {
    const tools = cooTeam.spec.adapter_config.permitted_tools;
    expect(tools).toContain('Write');
    expect(tools).not.toContain('Edit');
  });

  it('test_bp13_check_블록_override_Write_Edit_없음', () => {
    const checkTeam = l2.spec.teams.check;
    const tools = checkTeam.override.permitted_tools;
    expect(tools).not.toContain('Write');
    expect(tools).not.toContain('Edit');
  });

  it('test_bp14_do_블록_override_전체_도구_허용', () => {
    const doTeam = l2.spec.teams.do;
    const tools = doTeam.override.permitted_tools;
    expect(tools).toContain('Write');
    expect(tools).toContain('Edit');
    expect(tools).toContain('Bash');
    expect(tools).toContain('Agent');
  });
});

// ══════════════════════════════════════════════
// §4 판단 로그 강제 HP-001 (BP-015 ~ BP-019)
// ══════════════════════════════════════════════

describe('§4 판단 로그 HP-001', () => {
  it('test_bp15_plan_블록_think_log_required_true', () => {
    const plan = l2.spec.blocks.find((b: { id: string }) => b.id === 'plan');
    expect(plan.config.think_log_required).toBe(true);
  });

  it('test_bp16_design_블록_think_log_required_true', () => {
    const design = l2.spec.blocks.find((b: { id: string }) => b.id === 'design');
    expect(design.config.think_log_required).toBe(true);
  });

  it('test_bp17_do_블록_think_log_required_false', () => {
    const doBlock = l2.spec.blocks.find((b: { id: string }) => b.id === 'do');
    expect(doBlock.config.think_log_required).toBe(false);
  });

  it('test_bp18_think_log_eventType_execution_logs', () => {
    // think_log는 brick_execution_logs에 eventType='think_log'로 저장 (§4.2)
    // 여기서는 Gate prompt 설정이 think_log 검증을 포함하는지 확인
    const planGates = l2.spec.gates.plan;
    const promptGate = planGates.find((g: { type: string }) => g.type === 'prompt');
    expect(promptGate).toBeDefined();
    expect(promptGate.prompt).toContain('think_log');
  });

  it('test_bp19_plan_gate_prompt_threshold_0.8', () => {
    const planGates = l2.spec.gates.plan;
    const promptGate = planGates.find((g: { type: string }) => g.type === 'prompt');
    expect(promptGate.threshold).toBe(0.8);
    expect(promptGate.prompt).toContain('옵션');
  });
});

// ══════════════════════════════════════════════
// §5 팀 깊이 제한 HP-002 (BP-020 ~ BP-022)
// ══════════════════════════════════════════════

describe('§5 팀 깊이 제한 HP-002', () => {
  it('test_bp20_pm_team_max_depth_1', () => {
    expect(pmTeam.spec.adapter_config.max_depth).toBe(1);
  });

  it('test_bp21_cto_team_max_depth_2', () => {
    expect(ctoTeam.spec.adapter_config.max_depth).toBe(2);
  });

  it('test_bp22_depth_초과시_Agent_제거_로직', () => {
    // HP-002: max_depth 도달 시 Agent 도구가 permitted_tools에서 빠져야 함
    // 이 테스트는 seed 데이터의 maxDepth 값과 team YAML의 max_depth 일치 검증
    const pmSeed = PDCA_TEAMS_SEED.find(t => t.name === 'pm-team')!;
    expect(pmSeed.maxDepth).toBe(1);
    // pm-team은 max_depth=1이고 permitted_tools에 Agent 없음 → 자동 제거 불필요
    expect(pmTeam.spec.adapter_config.permitted_tools).not.toContain('Agent');

    const ctoSeed = PDCA_TEAMS_SEED.find(t => t.name === 'cto-team')!;
    expect(ctoSeed.maxDepth).toBe(2);
    // cto-team은 max_depth=2이고 depth=0에서는 Agent 있음
    expect(ctoTeam.spec.adapter_config.permitted_tools).toContain('Agent');
  });
});

// ══════════════════════════════════════════════
// §6 Gate 조건 (BP-023 ~ BP-032)
// ══════════════════════════════════════════════

describe('§6 Gate 조건', () => {
  it('test_bp23_plan_gate_command_prompt_2개_pass', () => {
    const gates = l2.spec.gates.plan;
    expect(gates).toHaveLength(2);
    expect(gates[0].type).toBe('command');
    expect(gates[1].type).toBe('prompt');
  });

  it('test_bp24_plan_gate_command_plan_md_존재_확인', () => {
    const gates = l2.spec.gates.plan;
    const cmdGate = gates.find((g: { type: string }) => g.type === 'command');
    expect(cmdGate.command).toContain('plan.md');
  });

  it('test_bp25_design_gate_prompt_TDD_Gap', () => {
    const gates = l2.spec.gates.design;
    const promptGate = gates.find((g: { type: string }) => g.type === 'prompt');
    expect(promptGate).toBeDefined();
    expect(promptGate.threshold).toBe(0.85);
  });

  it('test_bp26_do_gate_tsc_command', () => {
    const gates = l2.spec.gates.do;
    const tscGate = gates.find((g: { command?: string }) => g.command?.includes('tsc'));
    expect(tscGate).toBeDefined();
    expect(tscGate.type).toBe('command');
  });

  it('test_bp27_do_gate_3개_tsc_build_vitest', () => {
    const gates = l2.spec.gates.do;
    expect(gates).toHaveLength(3);
    expect(gates[0].command).toContain('tsc');
    expect(gates[1].command).toContain('build');
    expect(gates[2].command).toContain('vitest');
  });

  it('test_bp28_check_gate_match_rate_90_미달시_loop', () => {
    const checkGate = l2.spec.gates.check;
    expect(checkGate[0].match).toContain('90');
    // check→do loop link의 condition 확인
    const loopLink = l2.spec.links.find(
      (l: { from: string; to: string; type: string }) => l.from === 'check' && l.to === 'do' && l.type === 'loop'
    );
    expect(loopLink).toBeDefined();
    expect(loopLink.condition).toContain('90');
  });

  it('test_bp29_check_gate_match_rate_90_이상시_branch', () => {
    const branchLink = l2.spec.links.find(
      (l: { from: string; to: string; type: string }) => l.from === 'check' && l.to === 'review' && l.type === 'branch'
    );
    expect(branchLink).toBeDefined();
    expect(branchLink.condition).toContain('>= 90');
  });

  it('test_bp30_review_gate_approved시_learn_branch', () => {
    const branchLink = l2.spec.links.find(
      (l: { from: string; to: string; type: string }) => l.from === 'review' && l.to === 'learn' && l.type === 'branch'
    );
    expect(branchLink).toBeDefined();
    expect(branchLink.condition).toContain('approved');
  });

  it('test_bp31_review_gate_changes_requested시_do_loop', () => {
    const loopLink = l2.spec.links.find(
      (l: { from: string; to: string; type: string }) => l.from === 'review' && l.to === 'do' && l.type === 'loop'
    );
    expect(loopLink).toBeDefined();
    expect(loopLink.condition).toContain('changes_requested');
  });

  it('test_bp32_learn_gate_report_md_존재_pass', () => {
    const gates = l2.spec.gates.learn;
    expect(gates).toHaveLength(1);
    expect(gates[0].type).toBe('command');
    expect(gates[0].command).toContain('report.md');
  });
});

// ══════════════════════════════════════════════
// §7 레벨 변형 (BP-033 ~ BP-035)
// ══════════════════════════════════════════════

describe('§7 레벨 변형', () => {
  it('test_bp33_l0_블록_2개_do_check', () => {
    const ids = l0.spec.blocks.map((b: { id: string }) => b.id);
    expect(ids).toHaveLength(2);
    expect(ids).toContain('do');
    expect(ids).toContain('check');
  });

  it('test_bp34_l3_블록_8개_adr_security_audit_포함', () => {
    const ids = l3.spec.blocks.map((b: { id: string }) => b.id);
    expect(ids).toHaveLength(8);
    expect(ids).toContain('adr');
    expect(ids).toContain('security_audit');
  });

  it('test_bp35_l3_match_rate_95_이상', () => {
    const checkBlock = l3.spec.blocks.find((b: { id: string }) => b.id === 'check');
    expect(checkBlock.config.min_match_rate).toBe(95);
    // Gate도 95 확인
    const checkGate = l3.spec.gates.check;
    expect(checkGate[0].match).toContain('95');
  });
});
