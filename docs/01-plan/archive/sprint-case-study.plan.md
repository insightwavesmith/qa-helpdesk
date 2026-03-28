# 피드백반 스프린트 데이터 → case_study 임베딩 파이프라인

## 목표
노션에서 수집된 피드백반 수강생 스프린트 데이터(source_type="notion", 135건)를
사람×스프린트 단위로 병합 → source_type="case_study"로 재저장 → 자동 임베딩하여 AI 답변에 활용

## 배경
- 피드백반 수강생 6명이 2주 스프린트 단위로 자사몰 전환율 개선 과업 수행
- 과제: to-do#1(개선과제), to-do#2(이벤트/리뷰 과제) + 스프린트 문서
- 현재 135건이 개별 행으로 쪼개진 채 source_type="notion"으로 저장 → 임베딩 안 됨
- 목표: 사람×스프린트를 하나의 case_study 문서로 병합 → AI 답변에 활용

## 수강생 6명
이민규, 성용협, 허유범, 정민규, 현명석, 서현석

## 스프린트 기간
- Sprint 1: 2026-01-21 ~ 2026-01-27
- Sprint 2: 2026-01-28 ~ 2026-02-10

## 구현 범위
1. embed-pipeline.ts: case_study priority 1 추가
2. contents.ts: autoEmbedTypes에 "case_study" 추가
3. scripts/migrate-notion-to-case-study.mjs: 병합 마이그레이션 스크립트

## 성공 기준
- source_type="case_study" 12~18건 생성
- source_type="notion" 0건 (삭제 완료)
- npm run build 성공
