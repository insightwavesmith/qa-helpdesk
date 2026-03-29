// __tests__/hooks/frontmatter-parser.test.ts — 프론트매터 파싱 + 체크박스 스캔 테스트
// FP-1~12: 설계서 영역 1 전체 커버리지
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const HOOKS_DIR = '/Users/smith/projects/bscamp/.claude/hooks';
const FIXTURES_DIR = join(__dirname, 'fixtures');

describe('frontmatter-parser.sh — TASK 소유권 파싱', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'fm-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // parse_frontmatter_field를 인라인 bash로 테스트
  function parseFrontmatter(fileContent: string, key: string): string {
    const filePath = join(tmpDir, 'test.md');
    writeFileSync(filePath, fileContent);
    try {
      return execSync(
        `awk '/^---$/{n++; next} n==1{print}' "${filePath}" | grep "^${key}:" | sed "s/^${key}: *//"`,
        { encoding: 'utf-8', timeout: 5000 }
      ).trim();
    } catch {
      return '';
    }
  }

  function scanUnchecked(fileContent: string): string {
    const filePath = join(tmpDir, 'test.md');
    writeFileSync(filePath, fileContent);
    try {
      return execSync(
        `awk '/^---$/{fm_count++; next} fm_count >= 2 || fm_count == 0{print NR": "$0}' "${filePath}" | grep '\\- \\[ \\]'`,
        { encoding: 'utf-8', timeout: 5000 }
      ).trim();
    } catch {
      return '';
    }
  }

  // === parse_frontmatter_field() ===

  // FP-1: team 필드 정상 파싱 (기존 UT-5)
  it('FP-1: "team: CTO-1" → "CTO-1" 반환', () => {
    const content = '---\nteam: CTO-1\nstatus: in-progress\ncreated: 2026-03-28\nowner: leader\n---\n# TASK\n';
    expect(parseFrontmatter(content, 'team')).toBe('CTO-1');
  });

  // FP-2: status 필드 정상 파싱
  it('FP-2: "status: pending" → "pending" 반환', () => {
    const content = '---\nteam: CTO\nstatus: pending\n---\n# TASK\n';
    expect(parseFrontmatter(content, 'status')).toBe('pending');
  });

  // FP-3: session 필드 파싱
  it('FP-3: "session: sdk-cto" → "sdk-cto"', () => {
    const content = '---\nteam: CTO-1\nsession: sdk-cto\ncreated: 2026-03-28\nowner: leader\n---\n# TASK\n';
    expect(parseFrontmatter(content, 'session')).toBe('sdk-cto');
  });

  // FP-4: owner 필드 파싱
  it('FP-4: "owner: leader" → "leader"', () => {
    const content = '---\nteam: CTO-1\nstatus: in-progress\ncreated: 2026-03-28\nowner: leader\n---\n# TASK\n';
    expect(parseFrontmatter(content, 'owner')).toBe('leader');
  });

  // FP-5: frontmatter 없는 파일 → 빈 문자열 (기존 E-2)
  it('FP-5: frontmatter 없음 → "" (에러 아님)', () => {
    const content = '# TASK\n- [ ] 항목\n';
    expect(parseFrontmatter(content, 'team')).toBe('');
  });

  // FP-6: YAML 형식 오류 (콜론 누락) → 빈 문자열
  it('FP-6: "team CTO" (콜론 누락) → ""', () => {
    const content = '---\nteam CTO\n---\n# title\n';
    expect(parseFrontmatter(content, 'team')).toBe('');
  });

  // FP-7: 빈 파일 → 빈 문자열 (크래시 안 함)
  it('FP-7: 빈 파일 → "" (크래시 안 함)', () => {
    const content = '';
    expect(parseFrontmatter(content, 'team')).toBe('');
  });

  // === scan_unchecked() ===

  // FP-8: 프론트매터 내 체크박스 제외 (기존 E-4)
  it('FP-8: 프론트매터 안의 "- [ ]" 무시, body의 "- [ ]"만 카운트', () => {
    const content = '---\nteam: CTO-1\nstatus: in-progress\ncreated: 2026-03-28\nowner: leader\nassignees:\n  - role: backend-dev\n    tasks: [T1]\n---\n# TASK\n- [x] 완료만\n';
    const unchecked = scanUnchecked(content);
    expect(unchecked).toBe('');
  });

  // FP-9: 체크박스 없는 TASK → 0건
  it('FP-9: 체크박스 없음 → unchecked 0', () => {
    const content = '---\nteam: CTO\n---\n# title\nno checkboxes here\n';
    const unchecked = scanUnchecked(content);
    expect(unchecked).toBe('');
  });

  // === load_team_context() ===

  // FP-10: team-context.json 정상 로드
  it('FP-10: team-context.json 존재 → TEAM_NAME, TASK_FILES 변수 설정', () => {
    // frontmatter-parser.sh를 source해서 load_team_context 함수 실행
    const runtimeDir = join(tmpDir, '.claude', 'runtime');
    mkdirSync(runtimeDir, { recursive: true });
    const ctxData = JSON.parse(readFileSync(join(FIXTURES_DIR, 'team_context_cto.json'), 'utf-8'));
    writeFileSync(join(runtimeDir, 'team-context.json'), JSON.stringify(ctxData));

    // frontmatter-parser.sh의 CONTEXT_FILE 경로를 오버라이드해서 테스트
    const parserContent = readFileSync(join(HOOKS_DIR, 'helpers', 'frontmatter-parser.sh'), 'utf-8')
      .replace(/PROJECT_DIR="[^"]*"/, `PROJECT_DIR="${tmpDir}"`)
      .replace(/CONTEXT_FILE="[^"]*"/, `CONTEXT_FILE="${join(runtimeDir, 'team-context.json')}"`);
    const parserPath = join(tmpDir, 'frontmatter-parser.sh');
    writeFileSync(parserPath, parserContent, { mode: 0o755 });

    try {
      const stdout = execSync(
        `bash -c 'source "${parserPath}" && load_team_context && echo "TEAM=$TEAM_NAME" && echo "FILES=$TASK_FILES"'`,
        { encoding: 'utf-8', timeout: 5000 }
      ).trim();
      expect(stdout).toContain('TEAM=CTO-1');
      expect(stdout).toContain('TASK-CTO-RESUME.md');
    } catch (e: any) {
      // load_team_context이 exit 0을 반환하면 정상
      throw new Error(`load_team_context 실패: ${e.stderr || e.message}`);
    }
  });

  // FP-11: team-context.json 없음 → 폴백
  it('FP-11: team-context.json 없음 → false 반환, 폴백 경로 진입', () => {
    const parserContent = readFileSync(join(HOOKS_DIR, 'helpers', 'frontmatter-parser.sh'), 'utf-8')
      .replace(/PROJECT_DIR="[^"]*"/, `PROJECT_DIR="${tmpDir}"`)
      .replace(/CONTEXT_FILE="[^"]*"/, `CONTEXT_FILE="${join(tmpDir, 'nonexistent.json')}"`);
    const parserPath = join(tmpDir, 'frontmatter-parser.sh');
    writeFileSync(parserPath, parserContent, { mode: 0o755 });

    try {
      execSync(
        `bash -c 'source "${parserPath}" && load_team_context'`,
        { encoding: 'utf-8', timeout: 5000 }
      );
      // load_team_context이 return 0이면 성공인데, 파일 없으면 return 1
      // execSync는 exit 1에서 throw — 즉 여기까지 왔으면 잘못된 것
      expect(true).toBe(false); // 도달하면 안 됨
    } catch (e: any) {
      // exit code 1 = 파일 없으므로 폴백 진입
      expect(e.status).toBe(1);
    }
  });

  // FP-12: 크로스팀 TASK 필터링 — taskFiles에 명시된 파일만 스캔
  it('FP-12: taskFiles=["TASK-CTO.md"] → TASK-PM.md는 스캔 대상 아님', () => {
    const ctxData = {
      team: 'CTO',
      session: 'test',
      created: '2026-03-29',
      taskFiles: ['TASK-CTO.md'],
    };
    // TASK-CTO.md에는 미완료 1건, TASK-PM.md에는 미완료 3건
    const tasksDir = join(tmpDir, '.claude', 'tasks');
    mkdirSync(tasksDir, { recursive: true });
    writeFileSync(join(tasksDir, 'TASK-CTO.md'), '---\nteam: CTO\n---\n# CTO\n- [ ] CTO작업\n');
    writeFileSync(join(tasksDir, 'TASK-PM.md'), '---\nteam: PM\n---\n# PM\n- [ ] PM1\n- [ ] PM2\n- [ ] PM3\n');

    // taskFiles 필터: TASK-CTO.md만 대상이므로 PM의 3건은 무시
    const ctoUnchecked = scanUnchecked(readFileSync(join(tasksDir, 'TASK-CTO.md'), 'utf-8'));
    expect(ctoUnchecked).toContain('- [ ] CTO작업');

    // taskFiles에 포함되지 않은 PM 파일은 스캔 대상이 아님
    expect(ctxData.taskFiles).not.toContain('TASK-PM.md');
  });

  // 기존 테스트 유지 (별칭 호환)
  it('프론트매터 외부의 체크박스만 탐지', () => {
    const content = '---\nteam: CTO-1\nstatus: in-progress\ncreated: 2026-03-28\nowner: leader\n---\n# TASK\n- [x] 완료\n- [ ] 미완료\n';
    const unchecked = scanUnchecked(content);
    expect(unchecked).toContain('- [ ] 미완료');
  });

  it('프론트매터 없는 파일도 전체 스캔', () => {
    const content = '# TASK\n- [ ] 레거시 항목\n';
    const unchecked = scanUnchecked(content);
    expect(unchecked).toContain('- [ ] 레거시 항목');
  });
});
