import { test, expect } from '@playwright/test';

const BYPASS = 'iMVr0xO0L5zsZczb6nrg2Ipei47Lzia1';
const BASE = 'https://bscamp-git-feat-embedding-v2-migration-smith-kims-projects.vercel.app';
const LOGIN_EMAIL = 'smith.kim@inwv.co';
const LOGIN_PASSWORD = 'test1234!';

test.describe('임베딩 v2 마이그레이션 QA', () => {
  // Vercel deployment protection bypass + 타임아웃 확장
  test.use({
    extraHTTPHeaders: {
      'x-vercel-protection-bypass': BYPASS,
    },
  });

  test.beforeEach(async ({ page }) => {
    // 로그인
    await page.goto(`${BASE}/login`);
    await page.waitForLoadState('networkidle');

    // 앱 로그인 폼이 있으면 로그인
    const emailInput = page.locator('input[type="email"], input[name="email"]');
    if (await emailInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await emailInput.fill(LOGIN_EMAIL);
      await page.locator('input[type="password"]').fill(LOGIN_PASSWORD);
      await page.locator('button[type="submit"]').click();
      await page.waitForURL(/\/(dashboard|questions|posts|admin)/, { timeout: 20000 });
    }
  });

  test('1) /questions 페이지 로드', async ({ page }) => {
    await page.goto(`${BASE}/questions`);
    await page.waitForLoadState('networkidle');

    const hasContent = await page.locator('h1, h2, main, [class*="question"], table, [class*="list"]').first().isVisible({ timeout: 10000 });
    expect(hasContent).toBeTruthy();

    expect(page.url()).not.toContain('error');
    await page.screenshot({ path: 'e2e/screenshots/qa-questions-page.png' });
  });

  test('2) 질문 검색 동작', async ({ page }) => {
    await page.goto(`${BASE}/questions`);
    await page.waitForLoadState('networkidle');

    const searchInput = page.locator('input[type="search"], input[placeholder*="검색"], input[placeholder*="search"], input[name="search"], input[name="q"]');

    if (await searchInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await searchInput.fill('광고');
      await page.waitForTimeout(2000);
      await page.waitForLoadState('networkidle');
    }

    // 500 에러 텍스트 없음
    const has500 = await page.locator('text=/500|Internal Server Error/').isVisible({ timeout: 2000 }).catch(() => false);
    expect(has500).toBeFalsy();

    await page.screenshot({ path: 'e2e/screenshots/qa-questions-search.png' });
  });

  test('3) /posts 페이지 로드', async ({ page }) => {
    await page.goto(`${BASE}/posts`);
    await page.waitForLoadState('networkidle');

    const hasContent = await page.locator('h1, h2, main, [class*="post"], table, [class*="list"], article').first().isVisible({ timeout: 10000 });
    expect(hasContent).toBeTruthy();

    expect(page.url()).not.toContain('error');
    await page.screenshot({ path: 'e2e/screenshots/qa-posts-page.png' });
  });

  test('4) 기존 기능 회귀 없음 — 주요 페이지 500 에러 없음', async ({ page }) => {
    const failedRequests: string[] = [];
    page.on('response', response => {
      if (response.status() >= 500) {
        failedRequests.push(`${response.status()} ${response.url()}`);
      }
    });

    const paths = ['/dashboard', '/questions', '/posts'];
    for (const p of paths) {
      await page.goto(`${BASE}${p}`);
      await page.waitForLoadState('networkidle');

      const hasMain = await page.locator('main, h1, h2').first().isVisible({ timeout: 10000 });
      expect(hasMain).toBeTruthy();
    }

    expect(failedRequests).toHaveLength(0);
    await page.screenshot({ path: 'e2e/screenshots/qa-regression-check.png' });
  });
});
