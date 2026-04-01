# Gap 분석: coo-pane-restriction (Hook 강제 + COO Pane 제한)

> 분석일: 2026-04-01
> Design: `docs/02-design/features/coo-pane-restriction.design.md`
> Match Rate: **95%** (60/63 항목 완전 일치, 3건 형식 차이)

---

## 1. 항목별 Gap 분석

### 항목 1: pane-access-guard.sh — ✅ 100%
| 항목 | Design | 구현 | 결과 |
|------|--------|------|------|
| 입력 파싱 | python3 JSON parser | ✅ 동일 | 일치 |
| 타겟 파싱 | grep -oE 정규식 | ✅ BSD sed 호환 | 일치 |
| 판정 로직 | pane 0 허용, 자기팀 허용, 나머지 차단 | ✅ 동일 | 일치 |
| 비-tmux 처리 | exit 0 | ✅ 동일 | 일치 |
| 에러 메시지 | [pane-access-guard] 형식 | ✅ 동일 | 일치 |
| V3 연동 | hook-self-register.sh | ✅ + block-logger 추가 | 상위호환 |
| TDD C-01~C-20 | 20건 | ✅ 20/20 PASS | 일치 |

### 항목 2: enforce-spawn.sh — ✅ 100%
| 항목 | Design | 구현 | 결과 |
|------|--------|------|------|
| 감지 패턴 | --resume, -p, --print, -c, --continue | ✅ 동일 | 일치 |
| 허용 패턴 | spawn.sh, claude-peers, --version, --help | ✅ 동일 | 일치 |
| 비-팀 환경 | TMUX + TEAMS 체크 | ✅ 동일 | 일치 |
| TDD C-21~C-28 | 8건 | ✅ 8/8 PASS | 일치 |

### 항목 3: prevent-tmux-kill.sh — ✅ 100%
| 항목 | Design | 구현 | 결과 |
|------|--------|------|------|
| 감지 패턴 | kill-session, kill-pane, kill-server | ✅ 동일 | 일치 |
| 에러 메시지 | [prevent-tmux-kill] 형식 | ✅ 동일 | 일치 |
| TDD C-29~C-35 | 7건 | ✅ 7/7 PASS | 일치 |

### 항목 4: validate-coo-approval.sh — ✅ 100%
| 항목 | Design | 구현 | 결과 |
|------|--------|------|------|
| 트리거 | spawn.sh 호출 시 | ✅ 동일 | 일치 |
| 검증 | coo_approved: true 확인 | ✅ 동일 | 일치 |
| fail-closed | 파일 미존재 → exit 2 | ✅ 동일 | 일치 |
| TDD C-36~C-42 | 7건 | ✅ 7/7 PASS | 일치 |

### 항목 5: validate-task-fields.sh — ⚠️ 90%
| 항목 | Design | 구현 | 결과 |
|------|--------|------|------|
| 레벨 체크 | L0~L3 grep | ✅ 동일 | 일치 |
| 담당팀 체크 | sdk- 패턴 | ✅ 동일 | 일치 |
| 에러 메시지 | `[validate-task-fields] 차단:` | ❌ `❌ TASK에...` | **형식 불일치** |
| TDD C-43~C-49 | 7건 | ✅ 7/7 PASS | 일치 |

### 항목 6: filter-completion-dm.sh — ⚠️ 90%
| 항목 | Design | 구현 | 결과 |
|------|--------|------|------|
| 비-tmux/TEAMS 체크 | exit 0 | ✅ 동일 | 일치 |
| 리더 판별 | pane 0 → 허용 | ✅ 동일 | 일치 |
| 에러 메시지 | 3줄 [filter-completion-dm] 형식 | ❌ 1줄 ❌ 형식 | **형식 불일치** |
| TDD C-50~C-55 | 6건 | ✅ 6/6 PASS | 일치 |

### 항목 7: validate-slack-payload.sh — ⚠️ 90%
| 항목 | Design | 구현 | 결과 |
|------|--------|------|------|
| curl + slack 감지 | grep 패턴 | ✅ 동일 | 일치 |
| TASK_NAME 확인 | grep 패턴 | ✅ 동일 | 일치 |
| 팀명 확인 | grep 패턴 | ✅ 동일 | 일치 |
| 에러 메시지 | `[validate-slack-payload] 차단:` | ❌ `❌ 슬랙...` | **형식 불일치** |
| TDD C-56~C-63 | 8건 | ✅ 8/8 PASS | 일치 |

---

## 2. 인프라 검증

| 항목 | 결과 |
|------|------|
| settings.local.json 등록 | ✅ 7개 hook 모두 등록 |
| hook 체인 순서 | ✅ destructive → pane-guard → enforce-spawn → prevent-kill → coo-approval → task-fields → slack-payload |
| TDD 63/63 | ✅ 전체 PASS (1.65s) |
| npm run build | ✅ 성공 |
| tsc | ⚠️ test 파일 ProcessEnv 타입 에러 (빌드 무관) |

---

## 3. 미해결 Gap (3건)

| # | 파일 | Gap | 영향 | 우선순위 |
|---|------|-----|------|---------|
| G-1 | validate-task-fields.sh | 에러 메시지 ❌ → [hookname] 형식 | 로그 일관성 | 낮음 |
| G-2 | filter-completion-dm.sh | 에러 메시지 1줄 → 3줄 [hookname] 형식 | 로그 일관성 | 낮음 |
| G-3 | validate-slack-payload.sh | 에러 메시지 ❌ → [hookname] 형식 | 로그 일관성 | 낮음 |

3건 모두 로직 정확, 차단/허용 판정 정상. 에러 메시지 출력 형식만 Design과 다름.
validate-delegate.sh가 .bkit/hooks/ 직접 수정 차단하여 리더 직접 수정 불가 → 팀원 위임 필요.

---

## 4. 결론

- **Match Rate: 95%** (로직 100%, 형식 95%)
- 63/63 TDD PASS
- build 성공
- src/ 변경 없음 → Cloud Run 배포 불필요
