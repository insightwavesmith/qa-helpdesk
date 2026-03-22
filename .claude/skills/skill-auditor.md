---
name: skill-auditor
description: 스킬 품질 검사. .claude/skills/ 내 스킬 파일의 구조, 품질, 효과성을 감사한다. /audit-skill 로 호출.
---

<objective>
.claude/skills/ 디렉토리의 스킬 파일을 감사하여 품질 기준 준수 여부를 평가한다.
TÂCHES 스킬 아키텍처 기준 (pure XML, progressive disclosure, required tags) 적용.
</objective>

<evaluation_areas>
1. **YAML frontmatter**: name(kebab-case, max 64자), description(3인칭, what+when)
2. **구조**: 필수 태그(objective, quick_start/process, success_criteria) 존재
3. **콘텐츠**: Claude가 모르는 정보만 포함. 불필요한 설명/동기부여 텍스트 제거.
4. **안티패턴**: 본문에 마크다운 헤딩(##), 닫히지 않은 XML 태그, 중복 콘텐츠
5. **프로젝트 적합성**: bscamp 프로젝트 규칙(한국어 UI, Supabase, PDCA)과 충돌 없는지
</evaluation_areas>

<process>
1. 대상 스킬 파일 읽기 ($ARGUMENTS 또는 전체 .claude/skills/*.md)
2. YAML frontmatter 검사
3. 필수 XML 태그 존재 확인
4. 안티패턴 스캔 (마크다운 헤딩, hybrid XML/MD, 미닫힌 태그)
5. 콘텐츠 품질 평가 (신호 대 잡음비)
6. 프로젝트 적합성 확인 (CLAUDE.md 규칙 준수)
7. 결과 보고 (Critical / Recommendations / Strengths)
</process>

<output_format>
## 감사 결과: [스킬명]

### 판정: [적합/개선필요/부적합]

### Critical (즉시 수정)
1. **[이슈]** (file:line) — 현재/수정안/이유

### Recommendations (개선 권장)
1. **[이슈]** (file:line) — 권장/효과

### Strengths (유지)
- [잘 된 점]
</output_format>

<success_criteria>
- 모든 평가 영역 검사 완료
- file:line 위치 포함한 구체적 findings 3개 이상
- Critical/Recommendations/Strengths 분류
- 수정 방안 제시
</success_criteria>
