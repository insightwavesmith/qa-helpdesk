# 긴급 패치 v3 — 즉시 적용 필요

## 🔴 1번: 3초시청률 3701% 버그 수정 (즉시)

**파일**: `src/app/(main)/protractor/creatives/components/individual/three-axis-score.tsx`
**라인**: 62-64

### 현재 코드:
```typescript
function pctFormat(v: number): string {
  return `${(v * 100).toFixed(2)}%`;
}
```

### 수정 코드:
```typescript
function pctFormat(v: number): string {
  return `${v.toFixed(2)}%`;
}
```

**이유**: API가 이미 % 단위로 제공 (37.01)인데 *100 곱하여 3701% 버그 발생

---

## 2번: 씬별 DeepGaze 히트맵 이미지 표시

**파일**: `src/app/(main)/protractor/creatives/components/individual/creative-detail-panel.tsx`
**위치**: CreativeAnalysisV2 props 전달 부분 (약 160라인)

### 현재:
```typescript
<CreativeAnalysisV2
  creative={creative}
  performance={v2Performance}
  // ... 기타 props
/>
```

### 추가:
```typescript
<CreativeAnalysisV2
  creative={creative}
  performance={v2Performance}
  videoAnalysis={creative?.video_analysis}
  // ... 기타 props
/>
```

**파일**: `creative-analysis-v2.tsx`
**위치**: 씬별 카드 렌더링 부분 (약 2170라인)

### 현재 placeholder 코드 찾아서:
```typescript
<div style={{/* 회색 placeholder */}}>
  이미지 없음
</div>
```

### 수정:
```typescript
{/* DeepGaze 히트맵 이미지 표시 */}
{(() => {
  const heatmapUrl = videoAnalysis?.heatmap_urls?.find(item => 
    Math.abs(parseFloat(scene.time.split('-')[0]) - item.timestamp) < 2
  )?.url;
  
  return heatmapUrl ? (
    <img 
      src={heatmapUrl}
      style={{
        width: '120px',
        height: '213px',
        objectFit: 'cover',
        borderRadius: '6px'
      }}
      alt="시선 히트맵"
    />
  ) : (
    <div style={{
      width: '120px',
      height: '213px',
      background: '#f1f5f9',
      borderRadius: '6px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '11px',
      color: '#64748b'
    }}>
      시선 분석 대기중
    </div>
  );
})()}
```

---

## 3번: 좌측 세로 영상 플레이어

**파일**: `creative-analysis-v2.tsx`
**위치**: 고객 이해 섹션 비디오 부분 (약 1064라인)

### GCS URL 변환 함수 추가:
```typescript
const convertGcsUrl = (url: string): string => {
  if (url?.startsWith('gs://')) {
    return url.replace('gs://', 'https://storage.googleapis.com/');
  }
  return url;
};
```

### 현재 비디오 태그:
```typescript
<video
  src={creative?.storage_url || creative?.media_url}
  style={{width: 200, borderRadius: '10px'}}
  controls
/>
```

### 수정:
```typescript
<video
  src={convertGcsUrl(creative?.storage_url || creative?.media_url || '')}
  style={{
    width: '200px',
    height: 'auto',
    borderRadius: '10px',
    maxHeight: '356px', // 9:16 비율 기준
    objectFit: 'cover'
  }}
  controls
  preload="metadata"
  muted
/>
```

---

## 검증 체크리스트

- [ ] 3초시청률이 20-40% 정상 범위로 표시
- [ ] 씬별 카드에 DeepGaze 히트맵 이미지 또는 placeholder
- [ ] 좌측 영상이 9:16 세로 비율로 정상 재생
- [ ] `npx tsc --noEmit` 에러 0개
- [ ] `npm run build` 성공

## 적용 순서

1. **1번 먼저 적용** → 즉시 3701% 버그 해결
2. **2번, 3번 함께 적용** → UI 완성
3. **빌드 및 테스트**

## 긴급 연락처
- Smith님 확인 필요시 즉시 보고
- COO 의견은 참고용, 최고의 방법으로 진행