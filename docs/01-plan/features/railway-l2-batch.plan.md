# Railway L2 시선 예측 서비스 추가 + 초기 배치 실행

## 배경
Creative Intelligence 파이프라인이 L1(태깅)+L3(벤치마크)+L4(점수)만 Railway에 배포되어 있고,
L2(시선 예측, DeepGaze IIE)가 빠져 있다. L2를 같은 서비스에 통합하고 초기 835건 배치 분석을 실행해야 한다.

## 범위

### In Scope
1. `services/creative-pipeline/saliency/` 디렉토리에 Python L2 코드 추가
2. Dockerfile을 Node + Python + PyTorch CPU 멀티런타임으로 변경
3. `POST /saliency` 엔드포인트 추가 (server.js → child_process → Python)
4. `/pipeline` 순서를 L1→L2→L3→L4로 확장
5. 초기 배치 835건 실행 (Railway 배포 후)

### Out of Scope
- `src/` 코드 수정 (collect-daily 연동은 이미 완료)
- 프론트엔드 UI 변경
- GPU 지원 (Railway는 CPU만)

## 아키텍처 결정

**Option B 선택: Node server.js에서 child_process로 Python 호출**

| 기준 | Option A (별도 Flask 서비스) | Option B (child_process) |
|------|---------------------------|-------------------------|
| 배포 복잡도 | 서비스 2개 관리 | 서비스 1개 |
| 네트워크 오버헤드 | HTTP 호출 필요 | 없음 |
| Docker 이미지 크기 | 각각 작음 | 통합으로 큼 (~2GB) |
| Railway 비용 | 서비스 2개 과금 | 1개만 과금 |
| 메모리 격리 | 독립적 | 공유 |

선택 이유:
- L2는 IMAGE만 대상 (호출 빈도 낮음)
- 파이프라인이 순차적이라 별도 스케일링 불필요
- 1개 서비스 = 환경변수/배포 관리 단순
- Railway 메모리 8GB까지 가능

## 성공 기준
- [ ] `POST /saliency` 엔드포인트 동작
- [ ] `/pipeline`에서 L1→L2→L3→L4 순차 실행
- [ ] Dockerfile 빌드 성공
- [ ] tsc + next build 통과 (메인 프로젝트 영향 없음)
- [ ] Railway 배포 후 /health 정상 응답
- [ ] 초기 배치 835건 중 IMAGE 소재 시선 예측 완료

## 의존성
- `scripts/saliency-predict.py` — 기존 L2 로직 (이식 대상)
- `scripts/requirements-saliency.txt` — Python 의존성
- `services/creative-pipeline/` — 기존 L1+L3+L4 서비스
- Supabase `creative_saliency` 테이블 (이미 존재)
- Supabase Storage `creatives` 버킷 (이미 존재)
