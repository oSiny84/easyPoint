import { expect, type Page } from '@playwright/test';

// 시작 화면(영상 기획안 §2): 기억한 작품이 없는 탭은 항상 시작 화면에서 시작한다.
// 슬라이드 시험은 "슬라이드 만들기 → (작품 목록) → 새 작품"으로 편집기에 들어간다.
export async function slideHome(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '슬라이드 만들기' }).click();
  await expect(page.getByRole('list', { name: '내 작품' })).toBeAttached();
}

// 이 탭이 이미 작품을 기억하고 있으면 새로고침처럼 그 편집기로 돌아온다. 예전 시험이 기대하던 동작과 같다.
export async function newSlideProject(page: Page) {
  await page.goto('/');
  const tile = page.getByRole('button', { name: '슬라이드 만들기' }), paper = page.getByTestId('paper');
  await expect(tile.or(paper)).toBeVisible();
  if (await tile.isVisible()) {
    await tile.click();
    await page.getByRole('button', { name: '새 작품' }).click();
  }
  await expect(paper).toBeVisible();
}
