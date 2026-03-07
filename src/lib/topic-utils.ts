/**
 * 토픽 필터링 공통 유틸리티
 *
 * 내부 메타데이터 키(ep_number:, section_title:, UUID 등)를
 * 구조 패턴 기반으로 감지하여 사용자에게 노출되지 않도록 필터링한다.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}/i;
const COLON_KV_PATTERN = /^[a-z_]+:/i; // key:value 형태
const PURE_NUMBER = /^\d+$/;
const SNAKE_CASE_ONLY = /^[a-z][a-z0-9_]*$/; // 순수 영문 소문자 snake_case

/** 내부 메타데이터 키인지 판별 (구조 패턴 기반) */
export function isMetadataKey(topic: string): boolean {
  const t = topic.trim();
  if (!t) return true;
  if (UUID_PATTERN.test(t)) return true;
  if (COLON_KV_PATTERN.test(t)) return true;
  if (PURE_NUMBER.test(t)) return true;
  if (SNAKE_CASE_ONLY.test(t)) return true;
  return false;
}

/** 토픽 배열에서 유효한 토픽만 필터링 (메타데이터 키 제거) */
export function filterValidTopics(topics: string[]): string[] {
  return topics.filter((t) => !isMetadataKey(t));
}
