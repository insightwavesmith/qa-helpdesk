import { test, expect } from '@playwright/test';

test.describe('인증', () => {
  test('로그인 페이지 렌더링', async ({ page }) => {
    await page.goto('/login');
    
    // 로고 확인
    await expect(page.getByText('BS CAMP')).toBeVisible();
    
    // 폼 요소 확인
    await expect(page.getByLabel('이메일')).toBeVisible();
    await expect(page.getByLabel('비밀번호')).toBeVisible();
    await expect(page.getByRole('button', { name: '로그인' })).toBeVisible();
    
    // 회원가입 링크 확인
    await expect(page.getByRole('link', { name: '회원가입' })).toBeVisible();
  });

  test('잘못된 로그인 시 에러 표시', async ({ page }) => {
    await page.goto('/login');
    
    await page.getByLabel('이메일').fill('wrong@test.com');
    await page.getByLabel('비밀번호').fill('wrongpassword');
    await page.getByRole('button', { name: '로그인' }).click();
    
    // 에러 메시지 확인
    await expect(page.getByText('이메일 또는 비밀번호가 올바르지 않습니다')).toBeVisible({ timeout: 5000 });
  });

  test('회원가입 페이지 렌더링', async ({ page }) => {
    await page.goto('/signup');
    
    await expect(page.getByText('회원가입')).toBeVisible();
    await expect(page.getByText('수강생 정보를 입력해주세요')).toBeVisible();
  });

  test('미인증 시 대시보드 접근 차단', async ({ page }) => {
    await page.goto('/dashboard');
    
    // 로그인 페이지로 리다이렉트
    await expect(page).toHaveURL(/\/login/);
  });
});
