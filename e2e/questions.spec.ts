import { test, expect } from '@playwright/test';

test.describe('Q&A', () => {
  test.beforeEach(async ({ page }) => {
    // 로그인
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    
    await page.locator('input[type="email"]').fill('student@test.com');
    await page.locator('input[type="password"]').fill('test1234');
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/dashboard/, { timeout: 30000 });
  });

  test('Q&A 리스트 페이지', async ({ page }) => {
    await page.goto('/questions');
    await page.waitForLoadState('networkidle');
    
    // 검색바 확인
    await expect(page.getByPlaceholder('질문 검색하기')).toBeVisible();
    
    // 탭 확인 - 텍스트로 찾기
    await expect(page.getByText('전체 질문')).toBeVisible();
    await expect(page.getByText('내 질문')).toBeVisible();
    
    // 카테고리 섹션 확인
    await expect(page.getByText('카테고리')).toBeVisible();
    
    // 플로팅 버튼 확인
    await expect(page.locator('a[href="/questions/new"]')).toBeVisible();
  });

  test('탭 전환', async ({ page }) => {
    await page.goto('/questions');
    await page.waitForLoadState('networkidle');
    
    // 내 질문 탭 클릭 - 정확한 텍스트 매칭
    await page.getByText('내 질문', { exact: true }).click();
    
    // URL에 tab=mine 확인
    await expect(page).toHaveURL(/tab=mine/, { timeout: 5000 });
  });

  test('카테고리 필터', async ({ page }) => {
    await page.goto('/questions');
    await page.waitForLoadState('networkidle');
    
    // 전체 버튼 확인
    await expect(page.getByText('전체', { exact: true })).toBeVisible();
  });

  test('질문 작성 페이지 접근', async ({ page }) => {
    await page.goto('/questions/new');
    await page.waitForLoadState('networkidle');
    
    // 페이지 제목 확인
    await expect(page.getByText('새 질문 작성')).toBeVisible();
    
    // 폼 필드 확인 - placeholder로 찾기
    await expect(page.getByPlaceholder('질문 제목을 입력하세요')).toBeVisible();
    await expect(page.getByPlaceholder('구체적으로 작성해주시면')).toBeVisible();
  });
});
