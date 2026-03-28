import { describe, it, expect } from 'vitest'
import { parseTask } from '../lib/task-parser'

// 테스트 데이터
const MOCK_TASK_MD = `---
team: CTO
session: sdk-cto
created: 2026-03-28
status: in-progress
owner: leader
dependsOn: [TASK-A, TASK-B]
---
# 기능 개발
- [x] 항목 1
- [ ] 항목 2
- [x] 항목 3
`

const MOCK_TASK_WITH_CHECKBOXES = `---
team: PM
status: pending
owner: leader
---
# 대규모 태스크

## Wave 1
- [x] DB 마이그레이션
- [x] 타입 생성
- [x] API 엔드포인트 1
- [ ] API 엔드포인트 2

## Wave 2
- [x] 컴포넌트 A
- [x] 컴포넌트 B
- [x] 컴포넌트 C
- [ ] 컴포넌트 D

## Wave 3
- [ ] QA
- [ ] Gap 분석
`

const MOCK_NO_FRONTMATTER = `# 제목만 있는 파일
내용이 여기에 있습니다.
`

const MOCK_WITH_DEPS = `---
team: CTO
session: sdk-cto
created: 2026-03-28
status: pending
owner: backend-dev
dependsOn: [TASK-A, TASK-B]
---
# 의존성 태스크
- [ ] 작업 1
`

describe('task-parser', () => {
  // TP-1: YAML frontmatter 정상 파싱 (team, status, owner)
  it('YAML frontmatter에서 team, status, owner 추출', () => {
    const result = parseTask(MOCK_TASK_MD, 'TASK-TEST.md')
    expect(result.frontmatter.team).toBe('CTO')
    expect(result.frontmatter.status).toBe('in-progress')
    expect(result.frontmatter.owner).toBe('leader')
    expect(result.frontmatter.session).toBe('sdk-cto')
    expect(result.frontmatter.created).toBe('2026-03-28')
    expect(result.filename).toBe('TASK-TEST.md')
  })

  // TP-2: 체크박스 total/checked 카운트
  it('체크박스 total/checked 정확히 카운트', () => {
    const result = parseTask(MOCK_TASK_WITH_CHECKBOXES, 'TASK-BIG.md')
    expect(result.checkboxes.total).toBe(10)
    expect(result.checkboxes.checked).toBe(6)
    expect(result.checkboxes.items.length).toBe(10)
    // 개별 항목 검증
    expect(result.checkboxes.items[0]).toEqual({ done: true, text: 'DB 마이그레이션' })
    expect(result.checkboxes.items[3]).toEqual({ done: false, text: 'API 엔드포인트 2' })
  })

  // TP-3: frontmatter 없는 파일 → 기본값
  it('frontmatter 없는 TASK → 기본값 반환', () => {
    const result = parseTask(MOCK_NO_FRONTMATTER, 'TASK-NOFM.md')
    expect(result.frontmatter.team).toBe('')
    expect(result.frontmatter.status).toBe('')
    expect(result.frontmatter.owner).toBe('')
    expect(result.title).toBe('제목만 있는 파일')
  })

  // TP-4: dependsOn YAML 배열 파싱
  it('dependsOn YAML 배열 파싱', () => {
    const result = parseTask(MOCK_WITH_DEPS, 'TASK-DEPS.md')
    expect(result.frontmatter.dependsOn).toBeDefined()
    expect(result.frontmatter.dependsOn).toEqual(['TASK-A', 'TASK-B'])
  })

  // TP-5: 빈 파일 → 에러 없이 빈 결과
  it('빈 파일 → 에러 없이 빈 결과', () => {
    const result = parseTask('', 'TASK-EMPTY.md')
    expect(result.title).toBe('TASK-EMPTY.md') // 제목 없으면 파일명 fallback
    expect(result.checkboxes.total).toBe(0)
    expect(result.checkboxes.checked).toBe(0)
    expect(result.checkboxes.items).toEqual([])
  })
})
