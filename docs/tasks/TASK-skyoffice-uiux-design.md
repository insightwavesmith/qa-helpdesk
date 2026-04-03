# TASK: SkyOffice UI/UX Design — 브릭 엔진의 공간형 인터페이스

## 6단계 사고 프로세스

### Step 1. 재해석
브릭 엔진의 3축(Brick/Team/Link)을 SkyOffice(2D 탑다운 오피스)에서 조립하고 모니터링하는 UI/UX 설계.
두 가지 모드:
- **빌더 모드**: 마인크래프트/스크래치/Zapier처럼 블록을 자유롭게 조립
- **오피스 모드**: 사무실에서 에이전트들이 일하고, 완료되면 다음 사람한테 걸어가서 서류 넘기는 모습

### Step 2. 영향 범위
- SkyOffice 클론: `/Users/smith/projects/SkyOffice`
- 기술 스택: Phaser 3.55 + Colyseus 0.14 + React 18 + Redux + MUI 5
- 맵: `client/public/assets/map/map.tmx` (Tiled, 40x30, 32x32px)
- 캐릭터: adam/ash/lucy/nancy (32x48px, 52프레임)
- 엔진 API: http://localhost:3202
- 대시보드 API: http://localhost:3200

### Step 3. 선행 조건
- SkyOffice 기본 세팅 완료 (localhost:5173 + localhost:2567 동작 확인됨)
- 브릭 엔진 API 동작 (프리셋 7개, Gate 9종, Adapter 10종)
- 기존 PM Design: `docs/02-design/features/brick-skyoffice-ui.design.md`

### Step 4. 의존성
- 엔진 100% 완성(CTO-1)과 병렬 가능
- Colyseus 서버가 브릭 API를 호출해야 함 (WebSocket ↔ REST)
- 맵 수정은 Tiled 에디터 또는 직접 JSON 편집

### Step 5. 방법 도출
**A) Phaser 맵 안에 모든 UI** — 게임 내 UI로 블록 조립 + 모니터링
**B) Phaser(오피스) + React(빌더) 분리** — 오피스 뷰는 Phaser, 블록 조립은 React 사이드 패널
→ **B 추천**: 블록 드래그, 폼, 드롭다운 같은 건 React가 강하고, 캐릭터 애니메이션은 Phaser가 강함

### Step 6. 산출물
아래 5개 화면의 와이어프레임 + 컴포넌트 구조 + 데이터 흐름

---

## 목표
SkyOffice 기반으로 브릭 엔진의 3축(Brick/Team/Link)을 조립하고 모니터링하는 UI/UX 설계 문서를 작성하라.

## 핵심 컨셉
**사무실에서 사람들이 일하는 것처럼.**
- 방(Room) = Block (워크플로우 단계)
- 사람(Character) = Agent (에이전트)
- 걸어가서 서류 넘기기 = Handoff (블록 간 전환)
- 방 문의 자물쇠 = Gate (품질 검증)
- 복도 없음. 사람이 직접 상대방한테 감.

## 5개 화면

### 화면 1: 오피스 뷰 (Phaser — 메인)
- 2D 탑다운 사무실. 방 5개: Plan, Design, Do, QA, Review
- 각 방에 책상 + 에이전트 캐릭터 (PM, CTO-1, CTO-2, Codex)
- 에이전트 상태: idle(앉아있음), working(타이핑 애니메이션), walking(다음 방으로 이동)
- 블록 완료 → 에이전트가 다음 에이전트 자리로 걸어감 → 서류 아이콘 전달 → 돌아옴
- 방 클릭 → React 사이드 패널에 블록 상세
- 에이전트 클릭 → 프로필 + 현재 TASK

### 화면 2: 빌더 패널 (React — 사이드)
- 스크래치 + Zapier 스타일
- 블록 팔레트: Plan, Do, Check, Gate 등 드래그 가능
- 팀 팔레트: PM, CTO-1, CTO-2, Codex 아바타 드래그
- 프리셋 템플릿: T-PDCA L0~L3, hotfix, research 원클릭
- 캔버스: 블록을 배치하면 오피스 맵에 방이 생김
- 블록 사이에 선 긋기 → Link 타입 선택 (sequential/branch/loop)

### 화면 3: 블록 인스펙터 (React — 사이드)
- 블록 클릭 시: 타입, Gate 조건 (예: "95% match"), Adapter, Link
- Gate 편집: 종류 선택 (build_pass, match_rate, approval) + 임계값
- Adapter 편집: 팀 선택 드롭다운
- 상태 표시: pending/running/completed/failed + 시간

### 화면 4: 팀 관리 (React — 사이드)
- 에이전트 목록: 이름, 역할, 상태, 배정된 블록
- 에이전트 드래그 → 블록에 드롭 → 배정 변경
- 새 에이전트 추가 (Adapter 타입 선택)

### 화면 5: 실행 타임라인 (React — 하단)
- 가로 진행률: Plan ✅ → Design ✅ → Do 🔄 → QA ⏳ → Review ⏳
- 각 블록의 시작/종료 시간
- 실패 시 빨간 표시 + 재시도 횟수

## 디자인 시스템
- 다크 테마: 배경 #1a1b2e
- Primary: #F75D5D, hover: #E54949
- 폰트: Pretendard (한국어) / Inter (영문)
- 픽셀아트 감성 (Factorio meets Slack)
- 방이 활성화(running)되면 네온 글로우
- 에이전트 말풍선에 현재 TASK 표시

## 데이터 흐름
```
SkyOffice (Phaser) ←WebSocket→ Colyseus Server ←REST→ Brick API (3200)
     ↕                                                      ↕
React 패널 ←Redux store→                            Python 엔진 (3202)
```

## 산출물
- `docs/02-design/features/brick-skyoffice-uiux.design.md`
- 각 화면별 와이어프레임 (ASCII or 구조 설명)
- 컴포넌트 트리
- Colyseus ↔ Brick API 메시지 스키마
- SkyOffice 맵 수정 사항 (방 배치, 타일)

## 제약
- 기존 SkyOffice 코드 최대한 활용. 처음부터 다시 만들지 마.
- 기존 PM Design (`brick-skyoffice-ui.design.md`) 참고하되, "사무실 컨셉 + 빌더 분리" 방향으로 보완.
- Phaser는 오피스 뷰(모니터링), React는 빌더/인스펙터/관리(조립). 역할 섞지 마.
