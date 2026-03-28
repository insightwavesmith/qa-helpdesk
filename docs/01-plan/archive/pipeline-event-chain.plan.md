# 수집 파이프라인 이벤트 체인 Plan

## 배경
현재 크론 작업들이 Vercel Cron 시간 기반으로 독립 실행. 선행 작업 완료 여부와 무관하게 고정 시간에 실행됨.
→ 선행 작업이 늦으면 데이터 누락, 빠르면 리소스 낭비.

## 목표
collect-daily 완료 시 자동으로 후속 작업을 HTTP 체인으로 트리거.
크론은 collect-daily만. 나머지는 체인으로 실행.

## 체인 구조
```
Cloud Scheduler (매일 09:00 KST)
  └─ collect-daily (전체 계정 수집)
       └─ 완료 → fire-and-forget trigger
            └─ process-media (미디어 다운로드 → GCS)
                 └─ 완료 → fire-and-forget trigger (병렬)
                      ├─ embed-creatives (Gemini 임베딩)
                      ├─ creative-saliency (이미지 DeepGaze)
                      └─ video-saliency (영상 DeepGaze)
                           └─ (나중에) analyze-creatives (5축+처방)
```

## 설계 원칙
1. **Fire-and-forget**: 트리거는 응답 기다리지 않음 (timeout 방지)
2. **멱등성**: 각 단계는 독립적으로도 실행 가능 (수동 호출, 재시도)
3. **듀얼 모드**: chain=true 파라미터로 체인 트리거 ON/OFF
4. **로깅**: cron_runs 테이블에 체인 관계 기록

## 범위
- [x] `src/lib/pipeline-chain.ts` — 체인 트리거 유틸리티 (신규)
- [ ] `collect-daily/route.ts` — 완료 시 process-media 트리거
- [ ] `process-media/route.ts` — 완료 시 embed+saliency 트리거
- [ ] Cloud Scheduler 등록 (collect-daily, embed, saliency, video-saliency)

## 제외 (별도 TASK)
- analyze-creatives (5축+처방) — 처방 프롬프트 설계 후 추가
- precompute — 기존 독립 크론 유지

## 성공 기준
- collect-daily 호출 1회 → 전체 파이프라인 자동 실행
- 각 단계 실패 시 체인 중단 없음 (fire-and-forget)
- Cloud Scheduler에 크론 등록 완료
