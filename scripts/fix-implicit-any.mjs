/**
 * TS7006 implicit any 자동 수정 스크립트
 *
 * tsc 에러 출력에서 "Parameter 'X' implicitly has an 'any' type" 에러를 파싱하고
 * 해당 파라미터에 `: any` 어노테이션을 추가합니다.
 */

import { readFileSync, writeFileSync } from "fs";

const errors = readFileSync("/tmp/ts7006-errors.txt", "utf-8").trim().split("\n");

// Parse: src/actions/admin.ts(44,39): error TS7006: Parameter 'm' implicitly has an 'any' type.
const fixes = [];
for (const line of errors) {
  const match = line.match(/^(.+)\((\d+),(\d+)\):.+Parameter '(\w+)' implicitly/);
  if (match) {
    fixes.push({
      file: match[1],
      line: parseInt(match[2]),
      col: parseInt(match[3]),
      param: match[4],
    });
  }
}

// Group by file
const byFile = {};
for (const fix of fixes) {
  if (!byFile[fix.file]) byFile[fix.file] = [];
  byFile[fix.file].push(fix);
}

let totalFixed = 0;

for (const [file, fileFixes] of Object.entries(byFile)) {
  const content = readFileSync(file, "utf-8");
  const lines = content.split("\n");

  // Sort fixes by line number (descending) to not invalidate positions
  fileFixes.sort((a, b) => b.line - a.line || b.col - a.col);

  for (const fix of fileFixes) {
    const lineIdx = fix.line - 1;
    const line = lines[lineIdx];
    if (!line) continue;

    // Find the parameter and add `: any`
    // Patterns: (param) => , (param, ...) => , (param) =>
    const paramPattern = new RegExp(`\\(${fix.param}\\)\\s*=>|\\(${fix.param},|,\\s*${fix.param}\\)|\\(${fix.param}\\s*\\)`);

    if (line.includes(`(${fix.param})`) && !line.includes(`(${fix.param}:`)) {
      // Single param: (m) => → (m: any) =>
      lines[lineIdx] = line.replace(
        new RegExp(`\\(${fix.param}\\)`),
        `(${fix.param}: any)`
      );
      totalFixed++;
    } else if (line.includes(`(${fix.param},`) && !line.includes(`(${fix.param}:`)) {
      // First param: (m, n) => → (m: any, n) =>
      lines[lineIdx] = line.replace(
        new RegExp(`\\(${fix.param},`),
        `(${fix.param}: any,`
      );
      totalFixed++;
    } else if (line.includes(`, ${fix.param})`) && !line.includes(`, ${fix.param}:`)) {
      // Last param: (x, m) => → (x, m: any) =>
      lines[lineIdx] = line.replace(
        new RegExp(`,\\s*${fix.param}\\)`),
        `, ${fix.param}: any)`
      );
      totalFixed++;
    } else {
      console.log(`[SKIP] ${file}:${fix.line} — '${fix.param}' 패턴 불일치`);
    }
  }

  writeFileSync(file, lines.join("\n"));
  console.log(`[OK] ${file} — ${fileFixes.length}개 수정`);
}

console.log(`\n완료: ${totalFixed}/${fixes.length}개 수정`);
