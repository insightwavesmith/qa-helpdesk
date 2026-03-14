/**
 * 포스팅 진단 엔진
 * 네이버 블로그 SEO 관점에서 6개 항목을 진단합니다.
 */

import { checkProfanity } from './profanity-db';

export interface DiagnosisItem {
  id: string;
  name: string;
  status: 'pass' | 'warn' | 'fail';
  value: number | string;
  message: string;
  recommendation?: string;
}

export interface DiagnosisInput {
  title: string;
  content: string;
  targetKeyword: string;
  imageCount: number;
  externalLinks: string[];
}

/**
 * 숫자를 천 단위 콤마로 포맷합니다.
 */
function formatNumber(n: number): string {
  return n.toLocaleString('ko-KR');
}

/**
 * HTML 태그를 제거하고 공백도 제거한 순수 글자 수를 반환합니다.
 */
function getCharCount(content: string): number {
  return content
    .replace(/<[^>]*>/g, '')
    .replace(/\s/g, '')
    .length;
}

/**
 * title + content에서 targetKeyword 등장 횟수를 반환합니다. (대소문자 무시)
 */
function countKeyword(title: string, content: string, keyword: string): number {
  if (!keyword.trim()) return 0;
  const combined = (title + ' ' + content).toLowerCase();
  const needle = keyword.toLowerCase();
  let count = 0;
  let pos = 0;
  while ((pos = combined.indexOf(needle, pos)) !== -1) {
    count++;
    pos += needle.length;
  }
  return count;
}

/**
 * 포스팅 진단을 수행합니다.
 * @returns 6개 진단 항목 배열
 */
export function diagnosePost(input: DiagnosisInput): DiagnosisItem[] {
  const { title, content, targetKeyword, imageCount, externalLinks } = input;
  const results: DiagnosisItem[] = [];

  // ─────────────────────────────────────────
  // 1. 본문 글자수
  // ─────────────────────────────────────────
  const charCount = getCharCount(content);
  let charStatus: DiagnosisItem['status'];
  let charMessage: string;
  if (charCount >= 1500) {
    charStatus = 'pass';
    charMessage = `✅ 본문이 ${formatNumber(charCount)}자로 적합합니다.`;
  } else if (charCount >= 500) {
    charStatus = 'warn';
    charMessage = `⚠️ 본문이 ${formatNumber(charCount)}자로 부족합니다. 1,500자 이상 권장합니다.`;
  } else {
    charStatus = 'fail';
    charMessage = `❌ 본문이 ${formatNumber(charCount)}자로 매우 부족합니다. 최소 500자 이상 작성해주세요.`;
  }
  results.push({
    id: 'char-count',
    name: '본문 글자수',
    status: charStatus,
    value: charCount,
    message: charMessage,
    recommendation: '네이버 상위 노출 블로그 평균 글자수는 2,000~3,000자입니다.',
  });

  // ─────────────────────────────────────────
  // 2. 비속어/부적절 단어
  // ─────────────────────────────────────────
  const swearResults = checkProfanity(content, { categories: ['swear', 'crime'] });
  const swearCount = swearResults.length;
  const swearPreview = swearResults
    .slice(0, 3)
    .map((r) => `"${r.word}"`)
    .join(', ');
  let swearMessage: string;
  if (swearCount === 0) {
    swearMessage = '✅ 비속어/부적절 단어가 없습니다.';
  } else {
    swearMessage = `❌ 비속어/부적절 단어 ${swearCount}개 발견: ${swearPreview}${swearCount > 3 ? ' 외' : ''}`;
  }
  results.push({
    id: 'profanity',
    name: '비속어/부적절 단어',
    status: swearCount === 0 ? 'pass' : 'fail',
    value: swearCount,
    message: swearMessage,
    recommendation: '비속어가 포함된 글은 네이버 검색에서 누락될 수 있습니다.',
  });

  // ─────────────────────────────────────────
  // 3. 19금/성인 단어
  // ─────────────────────────────────────────
  const adultResults = checkProfanity(content, { categories: ['adult'] });
  const adultCount = adultResults.length;
  const adultPreview = adultResults
    .slice(0, 3)
    .map((r) => `"${r.word}"`)
    .join(', ');
  let adultMessage: string;
  if (adultCount === 0) {
    adultMessage = '✅ 성인/19금 단어가 없습니다.';
  } else {
    adultMessage = `❌ 성인/19금 단어 ${adultCount}개 발견: ${adultPreview}${adultCount > 3 ? ' 외' : ''}`;
  }
  results.push({
    id: 'adult-content',
    name: '19금/성인 단어',
    status: adultCount === 0 ? 'pass' : 'fail',
    value: adultCount,
    message: adultMessage,
    recommendation: '성인 키워드가 포함된 글은 네이버 블로그 노출에서 제한될 수 있습니다.',
  });

  // ─────────────────────────────────────────
  // 4. 외부 링크 수
  // ─────────────────────────────────────────
  const linkCount = externalLinks.length;
  let linkStatus: DiagnosisItem['status'];
  let linkMessage: string;
  if (linkCount === 0) {
    linkStatus = 'pass';
    linkMessage = '✅ 외부 링크가 없어 적합합니다.';
  } else if (linkCount <= 2) {
    linkStatus = 'warn';
    linkMessage = `⚠️ 외부 링크가 ${linkCount}개 있습니다. 최소화를 권장합니다.`;
  } else {
    linkStatus = 'fail';
    linkMessage = `❌ 외부 링크가 ${linkCount}개로 과다합니다. 3개 미만으로 줄여주세요.`;
  }
  results.push({
    id: 'external-links',
    name: '외부 링크 수',
    status: linkStatus,
    value: linkCount,
    message: linkMessage,
    recommendation: '외부 링크가 많으면 네이버 알고리즘이 광고성 글로 판단할 수 있습니다.',
  });

  // ─────────────────────────────────────────
  // 5. 이미지 수
  // ─────────────────────────────────────────
  let imageStatus: DiagnosisItem['status'];
  let imageMessage: string;
  if (imageCount >= 5) {
    imageStatus = 'pass';
    imageMessage = `✅ 이미지가 ${imageCount}장으로 적합합니다.`;
  } else if (imageCount >= 2) {
    imageStatus = 'warn';
    imageMessage = `⚠️ 이미지가 ${imageCount}장입니다. 5장 이상 권장합니다.`;
  } else {
    imageStatus = 'fail';
    imageMessage = `❌ 이미지가 ${imageCount}장으로 부족합니다. 최소 2장 이상 필요합니다.`;
  }
  results.push({
    id: 'image-count',
    name: '이미지 수',
    status: imageStatus,
    value: imageCount,
    message: imageMessage,
    recommendation: '네이버 상위 노출 블로그는 평균 7~10장의 이미지를 사용합니다.',
  });

  // ─────────────────────────────────────────
  // 6. 키워드 반복 수
  // ─────────────────────────────────────────
  const keywordCount = countKeyword(title, content, targetKeyword);
  let keywordStatus: DiagnosisItem['status'];
  let keywordMessage: string;
  if (keywordCount >= 5 && keywordCount <= 15) {
    keywordStatus = 'pass';
    keywordMessage = `✅ 키워드 "${targetKeyword}"가 ${keywordCount}회 반복되어 적합합니다.`;
  } else if ((keywordCount >= 3 && keywordCount <= 4) || (keywordCount >= 16 && keywordCount <= 20)) {
    keywordStatus = 'warn';
    keywordMessage = `⚠️ 키워드 "${targetKeyword}"가 ${keywordCount}회 반복됩니다. 5~15회가 최적입니다.`;
  } else {
    keywordStatus = 'fail';
    if (keywordCount < 3) {
      keywordMessage = `❌ 키워드 "${targetKeyword}"가 ${keywordCount}회로 너무 적습니다. 최소 5회 이상 사용하세요.`;
    } else {
      keywordMessage = `❌ 키워드 "${targetKeyword}"가 ${keywordCount}회로 과다합니다. 20회 이하로 줄여주세요.`;
    }
  }
  results.push({
    id: 'keyword-repeat',
    name: '키워드 반복 수',
    status: keywordStatus,
    value: keywordCount,
    message: keywordMessage,
    recommendation: '키워드를 자연스럽게 5~15회 분산 배치하면 검색 최적화에 유리합니다.',
  });

  return results;
}
