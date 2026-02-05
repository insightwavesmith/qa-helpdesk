import { test, expect } from '@playwright/test';

test.describe('Q&A', () => {
  test.beforeEach(async ({ page }) => {
    // 로그인
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    
    await page.locator('input[type="email"]').fill('student@test.com');
    await page.locator('input[type="password"]').fill('test1234');
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });
  });

  test('Q&A 리스트 페이지', async ({ page }) => {
    await page.goto('/questions');
    await page.waitForLoadState('networkidle');
    
    // 검색바 확인
    await expect(page.getByPlaceholder('질문 검색하기')).toBeVisible();
    
    // 탭 확인
    await expect(page.getByRole('button', { name: '전체 질문' })).toBeVisible();
    await expect(page.getByRole('button', { name: '내 질문' })).toBeVisible();
    
    // 카테고리 필터 확인
    await expect(page.getByText('카테고리')).toBeVisible();
    
    // 플로팅 버튼 확인
    await expect(page.locator('a[href="/questions/new"]')).toBeVisible();
  });

  test('탭 전환', async ({ page }) => {
    await page.goto('/questions');
    await page.waitForLoadState('networkidle');
    
    // 내 질문 탭 클릭
    await page.getByRole('button', { name: '내 질문' }).click();
    
    // URL에 tab=mine 확인
    await expect(page).toHaveURL(/tab=mine/, { timeout: 5000 });
  });

  test('카테고리 필터', async ({ page }) => {
    await page.goto('/questions');
    await page.waitForLoadState('networkidle');
    
    // 전체 버튼이 활성화되어 있어야 함
    const allButton = page.getByRole('button', { name: '전체' });
    await expect(allButton).toBeVisible();
  });

  test('질문 작성 페이지 접근', async ({ page }) => {
    await page.goto('/questions/new');
    await page.waitForLoadState('networkidle');
    
    // 폼 요소 확인 - 제목과 내용 입력 필드
    await expect(page.locator('input[name="title"], input#title')).toBeVisible();
    await expect(page.locator('textarea[name="content"], textarea#content')).toBeVisible();
  });
});
