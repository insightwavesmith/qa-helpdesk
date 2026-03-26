/**
 * 축1: 레퍼런스 원론 가이드
 * 14개 소재 속성별 이상적 값과 근거 설명.
 * 설계서: docs/02-design/features/prescription-system-v2.design.md STEP 10 axis1_guide
 */

export interface AttributeGuide {
  attribute: string;
  label: string;
  axis: string;
  idealValue: string;
  reasoning: string;
  journeyStage: '감각' | '사고' | '행동(클릭)' | '행동(구매)';
  metaConstraints?: string[];
}

export const ATTRIBUTE_GUIDES: AttributeGuide[] = [
  // ── Hook 축 ──────────────────────────────────────────────────────────
  {
    attribute: 'hook.hook_type',
    label: '훅 유형',
    axis: 'hook',
    idealValue: 'problem | curiosity | benefit',
    reasoning:
      '메타 광고에서 첫 0.5초가 스크롤 중단 여부를 결정한다. ' +
      'problem 훅은 고객의 현재 고통을 직접 언급해 즉각 공감을 유발하고, ' +
      'curiosity 훅은 정보 격차를 만들어 끝까지 시청을 유도한다. ' +
      'benefit 훅은 즉각적 이득을 명시해 ROAS 높은 구매 의도 타겟에 효과적이다. ' +
      '반면 shock/confession은 브랜드 신뢰를 손상시킬 수 있어 신중히 사용해야 한다.',
    journeyStage: '감각',
  },
  {
    attribute: 'hook.visual_style',
    label: '비주얼 스타일',
    axis: 'hook',
    idealValue: 'ugc | lifestyle',
    reasoning:
      '사용자가 생성한 콘텐츠(UGC) 스타일은 피드 네이티브하게 보여 광고 회피를 줄인다. ' +
      '메타 알고리즘은 참여율 높은 소재를 선호하며, UGC는 실제 리뷰처럼 보여 신뢰도를 높인다. ' +
      'lifestyle 스타일은 사용자가 제품을 사용하는 맥락을 보여줘 구매 욕구를 자극한다. ' +
      'professional 스타일은 브랜드 인지도 캠페인에 적합하나 직접 반응(DR) 캠페인에는 UGC보다 낮은 CTR을 보인다.',
    journeyStage: '감각',
  },
  {
    attribute: 'hook.composition',
    label: '구도',
    axis: 'hook',
    idealValue: 'center | rule_of_thirds',
    reasoning:
      'center 구도는 제품을 즉각적으로 인식하게 해 3초 시청률을 높인다. ' +
      'rule_of_thirds는 시선을 자연스럽게 핵심 요소(제품/CTA)로 유도하는 검증된 구도다. ' +
      'split 구도는 before/after 비교에 효과적이나 제품 단독 소재에는 산만함을 줄 수 있다.',
    journeyStage: '감각',
    metaConstraints: ['메타 세이프티존: 상하 14%, 좌우 4% 내 핵심 요소 배치 필수'],
  },

  // ── Visual 축 ────────────────────────────────────────────────────────
  {
    attribute: 'visual.color_scheme',
    label: '색상 구성',
    axis: 'visual',
    idealValue: 'vibrant | warm',
    reasoning:
      'vibrant 색상은 피드 스크롤 중 눈에 띄는 정지 효과(scroll-stop)를 만든다. ' +
      'warm 색상(빨강/주황/노랑)은 감정적 자극과 구매 충동과 연관이 높다. ' +
      'neutral/muted는 브랜드 정체성에는 좋으나 직접 반응 캠페인에서 클릭률이 낮다. ' +
      '단, 카테고리에 따라 cool(뷰티/클렌징)이나 neutral(미니멀리즘 브랜드)이 더 적합할 수 있다.',
    journeyStage: '감각',
  },
  {
    attribute: 'visual.product_visibility',
    label: '제품 노출',
    axis: 'visual',
    idealValue: 'high',
    reasoning:
      '제품이 명확하게 보여야 구매 전환이 일어난다. ' +
      'high visibility는 제품에 대한 즉각적 이해를 만들고, ' +
      '특히 3초 시청률과 구매전환율(reach_to_purchase_rate)에 직접 영향을 준다. ' +
      'low visibility는 브랜드 스토리텔링에는 적합하나 퍼포먼스 캠페인에는 부적합하다.',
    journeyStage: '행동(구매)',
  },

  // ── Text 축 ──────────────────────────────────────────────────────────
  {
    attribute: 'text.headline',
    label: '헤드라인',
    axis: 'text',
    idealValue: 'benefit형 또는 problem형 헤드라인',
    reasoning:
      '헤드라인은 2~6초 내 읽히는 유일한 텍스트다. ' +
      'benefit형("피부 톤이 2주 만에 달라졌어요")은 구체적 결과를 약속해 클릭 의도를 만든다. ' +
      'problem형("건조한 피부 때문에 화장이 들떠요?")은 공감을 통해 계속 보게 만든다. ' +
      '헤드라인이 없거나 추상적이면 사고 단계에서 이탈률이 급증한다.',
    journeyStage: '사고',
  },
  {
    attribute: 'text.cta_text',
    label: 'CTA 문구',
    axis: 'text',
    idealValue: '혜택 명시형 CTA ("지금 할인가로 구매" / "무료 샘플 신청")',
    reasoning:
      'CTA는 클릭 단계의 최종 트리거다. ' +
      '"지금 구매" 같은 일반 CTA보다 혜택이 명시된 CTA("30% 할인 지금 보기")가 CTR을 2~3배 높인다. ' +
      '긴급성 결합("오늘만 가능")은 FOMO를 자극해 구매 전환을 높인다. ' +
      '단, 메타는 CTA 버튼을 별도 제공하므로 소재 내 CTA 문구는 버튼과 구별되게 작성해야 한다.',
    journeyStage: '행동(클릭)',
    metaConstraints: ['메타 CTA 버튼(지금 구매 등)과 중복 금지', '세이프티존 내 배치 필수'],
  },
  {
    attribute: 'text.readability',
    label: '가독성',
    axis: 'text',
    idealValue: 'high',
    reasoning:
      '모바일 피드에서 텍스트는 0.5초 내 읽혀야 한다. ' +
      'high readability는 굵은 폰트, 고대비 배경, 짧은 문장(10자 이내)으로 달성된다. ' +
      'low readability는 사고 단계에서 이탈을 직접 유발한다.',
    journeyStage: '사고',
    metaConstraints: ['텍스트 면적 20% 이하 권장 (메타 가이드라인)'],
  },

  // ── Psychology 축 ────────────────────────────────────────────────────
  {
    attribute: 'psychology.emotion',
    label: '감정 유발',
    axis: 'psychology',
    idealValue: 'joy | trust | anticipation',
    reasoning:
      'joy는 공유 행동을 유발해 바이럴 효과를 만든다. ' +
      'trust는 구매 전환에 직접 영향을 주는 가장 중요한 감정이다. ' +
      'anticipation은 신제품 론칭이나 한정 이벤트에서 구매 의도를 높인다. ' +
      'fear는 단기 전환에 효과적이나 브랜드 이미지를 훼손할 수 있어 신중히 사용해야 한다.',
    journeyStage: '사고',
  },
  {
    attribute: 'psychology.social_proof',
    label: '사회적 증거',
    axis: 'psychology',
    idealValue: 'testimonial | numbers',
    reasoning:
      '사회적 증거는 구매 결정의 불확실성을 제거하는 가장 강력한 도구다. ' +
      'testimonial("실제 고객 후기")은 공감과 신뢰를 동시에 만든다. ' +
      'numbers("누적 판매 10만 개")는 대중 검증을 보여줘 신뢰를 높인다. ' +
      '사회적 증거가 없는 소재는 신규 타겟에서 CTR과 ROAS가 현저히 낮다.',
    journeyStage: '행동(구매)',
  },
  {
    attribute: 'psychology.urgency',
    label: '긴급성',
    axis: 'psychology',
    idealValue: 'limited | timer',
    reasoning:
      '긴급성은 결제 이탈을 막는 가장 직접적인 심리 트리거다. ' +
      'limited("한정 수량")와 timer("오늘 자정 마감")는 지금 당장 구매해야 한다는 압박을 만든다. ' +
      '단, 과도한 긴급성은 신뢰를 손상시킬 수 있어 실제 한정 조건일 때만 사용해야 한다.',
    journeyStage: '행동(구매)',
  },
  {
    attribute: 'psychology.authority',
    label: '권위',
    axis: 'psychology',
    idealValue: 'expert | data',
    reasoning:
      'expert 권위("피부과 전문의 추천")는 의심을 제거하고 신뢰를 만든다. ' +
      'data 권위("임상 시험 결과 92% 개선")는 구체적 증거로 설득력을 높인다. ' +
      '권위 요소는 고관여 구매(고가 제품, 건강/뷰티)에서 특히 중요하다.',
    journeyStage: '사고',
  },

  // ── Quality 축 ───────────────────────────────────────────────────────
  {
    attribute: 'quality.production_quality',
    label: '제작 품질',
    axis: 'quality',
    idealValue: 'semi | ugc',
    reasoning:
      'semi-professional 품질은 전문성과 진정성 사이의 균형점이다. ' +
      '지나치게 polished한 professional 제작물은 광고처럼 보여 광고 회피를 유발한다. ' +
      'UGC 품질은 진정성을 높이나 브랜드 신뢰가 낮은 신규 고객에게는 역효과가 날 수 있다. ' +
      '카테고리와 타겟 성숙도에 따라 최적 품질 수준이 다르다.',
    journeyStage: '감각',
  },
  {
    attribute: 'quality.brand_consistency',
    label: '브랜드 일관성',
    axis: 'quality',
    idealValue: 'high',
    reasoning:
      '브랜드 일관성은 리타겟팅 효율을 높이는 핵심 요소다. ' +
      '기존 고객은 일관된 브랜드 시각 언어를 보고 즉각 브랜드를 인식하며, ' +
      '이는 CTR과 구매전환율을 동시에 높인다. ' +
      'low consistency는 브랜드 혼란을 야기하고 장기적으로 광고 효율을 낮춘다.',
    journeyStage: '행동(구매)',
  },
];

/**
 * STEP 10 프롬프트용 축1 가이드 텍스트
 */
export const PRESCRIPTION_GUIDE_TEXT: string = (() => {
  const lines: string[] = [
    '## 축1: 레퍼런스 원론 가이드 (고정 참조)',
    '',
    '### 고객 여정 4단계와 소재 역할',
    '1. **감각 단계**: 0~3초. 스크롤 중단이 목표. 훅/비주얼/색상이 결정.',
    '2. **사고 단계**: 3~10초. 관심 유지와 이해가 목표. 헤드라인/감정/권위가 결정.',
    '3. **행동(클릭) 단계**: CTA 클릭 유도. CTA 문구/긴급성이 결정.',
    '4. **행동(구매) 단계**: 결제 완료. 사회적 증거/제품 가시성/브랜드 신뢰가 결정.',
    '',
    '### 메타 광고 세이프티존 규칙 (처방 시 필수 준수)',
    '- 상하 14%, 좌우 4% 영역: 핵심 텍스트/제품/CTA 배치 금지',
    '- 텍스트 면적 20% 이하 유지',
    '- 메타 제공 CTA 버튼과 소재 내 CTA 중복 금지',
    '',
    '### 14개 속성별 이상적 값',
    '',
  ];

  for (const guide of ATTRIBUTE_GUIDES) {
    lines.push(`**${guide.label}** (\`${guide.attribute}\`) — 여정: ${guide.journeyStage}`);
    lines.push(`- 이상적 값: ${guide.idealValue}`);
    lines.push(`- 근거: ${guide.reasoning}`);
    if (guide.metaConstraints) {
      for (const c of guide.metaConstraints) {
        lines.push(`- ⚠ 제약: ${c}`);
      }
    }
    lines.push('');
  }

  lines.push('### 처방 절대 금지 규칙');
  lines.push('1. CTA 버튼 추가 처방 금지 (메타가 제공)');
  lines.push('2. 세이프티존 밖 배치 처방 금지');
  lines.push('3. 타겟팅 변경 처방 금지 (소재 관련만)');
  lines.push('4. "더 좋게 하세요" 같은 추상적 처방 금지');
  lines.push('5. 입력 데이터에 없는 수치 인용 금지');
  lines.push('6. 광고비/예산 관련 처방 금지');

  return lines.join('\n');
})();
