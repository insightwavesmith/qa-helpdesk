import { test, expect } from '@playwright/test';

test.describe('인증', () => {
  test('로그인 페이지 렌더링', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    
    // 로고 확인
    await expect(page.getByText('BS CAMP')).toBeVisible();
    
    // 폼 요소 확인 - placeholder로도 확인
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
    
    // 회원가입 링크 확인
    await expect(page.getByRole('link', { name: '회원가입' })).toBeVisible();
  });

  test('잘못된 로그인 시 에러 표시', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    
    await page.locator('input[type="email"]').fill('wrong@test.com');
    await page.locator('input[type="password"]').fill('wrongpassword');
    await page.locator('button[type="submit"]').click();
    
    // 에러 메시지 확인 (텍스트 부분 매칭)
    await expect(page.getByText('이메일 또는 비밀번호')).toBeVisible({ timeout: 10000 });
  });

  test('회원가입 페이지 렌더링', async ({ page }) => {
    await page.goto('/signup');
    await page.waitForLoadState('networkidle');
    
    await expect(page.getByText('회원가입')).toBeVisible();
    await expect(page.getByText('수강생 정보를 입력해주세요')).toBeVisible();
  });

  test('미인증 시 대시보드 접근 차단', async ({ page }) => {
    await page.goto('/dashboard');
    
    // 로그인 페이지로 리다이렉트 (시간 여유)
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });
});
