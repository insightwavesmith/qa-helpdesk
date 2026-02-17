import { test, expect } from '@playwright/test';

// 로그인 상태 유지를 위한 fixture
test.describe('홈 (로그인 후)', () => {
  test.beforeEach(async ({ page }) => {
    // 로그인
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    
    await page.locator('input[type="email"]').fill('student@test.com');
    await page.locator('input[type="password"]').fill('test1234');
    await page.locator('button[type="submit"]').click();
    
    // 대시보드로 이동 대기
    await page.waitForURL(/\/dashboard/, { timeout: 30000 });
  });

  test('홈 페이지 구성 요소', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    
    // 헤더 확인
    await expect(page.getByText('자사몰사관학교')).toBeVisible();
    
    // 네비게이션 확인
    await expect(page.getByRole('link', { name: '홈' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Q&A' })).toBeVisible();
    
    // 검색바 확인
    await expect(page.getByPlaceholder('질문 검색하기')).toBeVisible();
    
    // 섹션 제목 확인
    await expect(page.getByText('공지사항')).toBeVisible();
    await expect(page.getByText('최근 Q&A')).toBeVisible();
  });

  test('Q&A 페이지 이동', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    
    await page.getByRole('link', { name: 'Q&A' }).click();
    
    await expect(page).toHaveURL(/\/questions/, { timeout: 10000 });
    await expect(page.getByText('전체 질문')).toBeVisible();
  });
});
