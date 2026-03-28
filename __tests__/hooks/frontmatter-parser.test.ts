// __tests__/hooks/frontmatter-parser.test.ts — 프론트매터 파싱 + 체크박스 스캔 테스트
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('프론트매터 파싱 함수', () => {
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

  it('UT-5: team 필드 정상 추출', () => {
    const content = '---\nteam: CTO-1\nstatus: in-progress\ncreated: 2026-03-28\nowner: leader\n---\n# TASK\n';
    expect(parseFrontmatter(content, 'team')).toBe('CTO-1');
    expect(parseFrontmatter(content, 'status')).toBe('in-progress');
    expect(parseFrontmatter(content, 'owner')).toBe('leader');
  });

  it('E-2: 프론트매터 없는 파일 → 빈 값', () => {
    const content = '# TASK\n- [ ] 항목\n';
    expect(parseFrontmatter(content, 'team')).toBe('');
  });

  it('E-4: 프론트매터 내 체크박스 패턴 무시', () => {
    const content = '---\nteam: CTO-1\nstatus: in-progress\ncreated: 2026-03-28\nowner: leader\nassignees:\n  - role: backend-dev\n    tasks: [T1]\n---\n# TASK\n- [x] 완료만\n';
    const unchecked = scanUnchecked(content);
    expect(unchecked).toBe(''); // 프론트매터 내 - 패턴 무시, 본문엔 미완료 없음
  });

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
