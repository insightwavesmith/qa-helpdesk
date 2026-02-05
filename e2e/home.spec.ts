import { test, expect } from '@playwright/test';

// 로그인 상태 유지를 위한 fixture
test.describe('홈 (로그인 후)', () => {
  test.beforeEach(async ({ page }) => {
    // 로그인
    await page.goto('/login');
    await page.getByLabel('이메일').fill('student@test.com');
    await page.getByLabel('비밀번호').fill('test1234');
    await page.getByRole('button', { name: '로그인' }).click();
    
    // 대시보드로 이동 대기
    await page.waitForURL(/\/dashboard/, { timeout: 10000 });
  });

  test('홈 페이지 구성 요소', async ({ page }) => {
    // 헤더 확인
    await expect(page.getByText('BS CAMP')).toBeVisible();
    
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
    await page.getByRole('link', { name: 'Q&A' }).click();
    
    await expect(page).toHaveURL(/\/questions/);
    await expect(page.getByText('전체 질문')).toBeVisible();
  });
});
