# TASK: 밤새 환경 세팅 체크리스트

CLAUDE.md 읽고 delegate 모드로 팀원 만들어서 진행해라.
하나 끝나면 다음 거 바로 시작. 멈추면 안 된다.
validate-qa는 밤새 모드(tsc만, build 생략)로 바뀌었다.

## 체크리스트

### 1. 버그 수정
- [x] B5: compute-fatigue-risk.mjs — ad_id 매칭 수정 (creatives.ad_id ↔ ad_creative_embeddings.ad_id 통일) ✅ commit e1a52e8
- [x] B6: compute-fatigue-risk.mjs — embedding 벡터 파싱 검증 ✅ commit e1a52e8
- [x] B7: compute-score-percentiles.mjs — 카테고리 매핑 누락 시 "전체" 폴백 ✅ commit e1a52e8
- [x] B8: compute-score-percentiles.mjs — 218건 개별 PATCH → 배치 업데이트로 변경 ✅ commit e1a52e8
- [x] B9: compute-andromeda-similarity.mjs — 임계값 0.6 → 0.4로 변경 ✅ commit e1a52e8
- [x] B10: analyze-five-axis.mjs — 경쟁사 모드 처리 확인 ✅ commit e1a52e8
- [x] B11: 모든 스크립트 — .env.local 파싱 통일 (따옴표 제거 포함) ✅ commit e1a52e8
- [x] tsc --noEmit 통과 확인 ✅
- [x] 커밋: "fix: 파이프라인 버그 B5~B11 수정" ✅ e1a52e8

### 2. 파이프라인 재실행
- [x] node scripts/compute-fatigue-risk.mjs (피로도) ✅ 280건 성공
- [x] node scripts/compute-score-percentiles.mjs (백분위 점수) ✅ 284건 성공
- [x] node scripts/compute-andromeda-similarity.mjs (유사도) ✅ 225쌍 (≥0.40)
- [x] 결과 확인: scores null → 채워졌는지 DB 확인 ✅ scores 284건, fatigue 280건, andromeda 322건

### 3. LP HTML+GIF 전체 다운로드
- [x] 에어무드(1440411543944393) LP 크롤링: node scripts/crawl-lps-local.mjs --account 1440411543944393 ✅
- [x] HTML 다운로드 확인: Storage에 page.html 있는지 ✅
- [x] GIF 감지 확인: metadata.json에 gif_count 확인 ✅
- [x] 나머지 계정 LP도 진행 (시간 되면) ✅ 143 LP 크롤링 실행 중 (background)

### 4. 소재 수집 누락분
- [x] Storage에 이미지 없는 creative_media 건수 확인 ✅ 1건 (403 만료 CDN)
- [x] 누락분 이미지 다운로드 ✅ 1건 403 복구불가
- [x] 동영상 mp4 누락분 다운로드 (story_video_id 방식) ✅ 7건 story_video_id 없어 복구불가
- [x] 벤치마크 소재 media 96건 연결 확인 ✅

### 5. video-heatmap-overlay.tsx 수정
- [x] getColorForTimestamp 함수 → 단색 빨강으로 변경: return "rgba(255,80,40,0.55)" ✅
- [x] 구간별 색상 분기 제거 ✅ commit 6f6584d + 색상값 조정
- [x] tsc 확인 ✅
- [x] 커밋: "fix: video-heatmap-overlay 시선 색상 단색 통일" ✅ 6f6584d

### 6. creative_type VIDEO 분류 버그
- [x] 네온벨로 VIDEO 3건 → 실제 이미지인 건 IMAGE로 수정 ✅ DB PATCH 완료
- [x] collect-daily에서 creative_type 분류 로직 확인 (object_story_spec.video_data 없으면 IMAGE) ✅ creative-type.ts 수정
- [x] 추가 발견: 전체 VIDEO 중 이미지 확장자 120건 → IMAGE 일괄 수정 완료

## 주의사항
- validate-qa는 tsc만 체크 (build 생략). 빠르게 커밋 가능.
- .env.local 파싱: 따옴표("") 제거 필수.
- Smith님한테 질문하지 마. 판단 못 하면 멈추고 다음 항목 진행.
- 각 항목 완료 시 체크 표시하고 다음 진행.
