import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

// 스페이스 재생·일시정지(영상 편집기). 마우스로 조각·단추·고르기 상자·배율 막대를 누른 뒤에도 스페이스가 재생을 바꾼다.
// 고치기 전에는 초점이 단추나 고르기 상자에 남아 있으면 스페이스가 그 단추를 누르거나 목록을 열었다.
const FIXTURE = 'tests/fixtures/video';
const status = (page: Page) => page.getByRole('status');
const doc = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as any).__canvacraftVideo.store.getProject())));
const playing = (page: Page) => page.evaluate(() => (window as any).__canvacraftVideo.player.state.playing as boolean);
const clip = (page: Page) => page.getByRole('button', { name: /^영상 1 조각/ });
const toolbar = (page: Page) => page.getByRole('toolbar', { name: '선택한 조각 설정' });

async function editorWithClip(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '영상 만들기' }).click();
  await page.getByRole('button', { name: '새 작품' }).click();
  await page.getByTestId('import-video').setInputFiles({ name: 'a.webm', mimeType: 'video/webm', buffer: await fs.readFile(path.join(FIXTURE, 'a.webm')) });
  await expect(status(page)).toContainText('영상을 넣었어요', { timeout: 20000 });
  // 재생이 시험 도중 끝나지 않게 느리게 한다(2초 → 4초).
  // 조각을 누르면 재생 막대가 그 자리로 온다. 다음에 누를 때는 재생 막대를 피해 다른 자리를 누른다.
  await clip(page).click({ position: { x: 60, y: 20 } });
  await page.getByRole('combobox', { name: '조각 빠르기' }).selectOption({ label: '느리게 0.5배' });
}

// 스페이스를 누르면 재생, 다시 누르면 그 자리에서 일시정지한다.
async function spaceTogglesTwice(page: Page) {
  await page.keyboard.press(' ');
  await expect.poll(() => playing(page)).toBe(true);
  await page.waitForTimeout(250);
  await page.keyboard.press(' ');
  await expect.poll(() => playing(page)).toBe(false);
  await page.waitForTimeout(150);
  expect(await playing(page)).toBe(false);
}

test('조각을 마우스로 누른 뒤 스페이스: 재생·일시정지가 바뀌고 조각 선택은 그대로다', async ({ page }) => {
  await editorWithClip(page);
  await clip(page).click({ position: { x: 120, y: 20 } });
  await spaceTogglesTwice(page);
  await expect(toolbar(page)).toBeVisible();
});

test('빠르기를 고른 뒤 스페이스: 목록이 열리지 않고 재생·일시정지가 바뀌며 빠르기는 그대로다', async ({ page }) => {
  await editorWithClip(page);
  const select = page.getByRole('combobox', { name: '조각 빠르기' });
  await select.focus();
  const before = await doc(page);
  await spaceTogglesTwice(page);
  const after = await doc(page);
  expect(after.clips[0].speed).toBe(0.5);
  expect(after.revision).toBe(before.revision);
});

test('조각 단추(소리 끄기)·배율 막대를 마우스로 누른 뒤 스페이스: 그 단추를 다시 누르지 않고 재생·일시정지가 바뀐다', async ({ page }) => {
  await editorWithClip(page);
  await toolbar(page).getByRole('button', { name: '소리 끄기' }).click();
  expect((await doc(page)).clips[0].muted).toBe(true);
  await spaceTogglesTwice(page);
  expect((await doc(page)).clips[0].muted).toBe(true);

  const zoom = page.getByRole('slider', { name: '타임라인 배율' });
  await zoom.click();
  await spaceTogglesTwice(page);
});

test('재생 단추를 마우스로 누른 뒤 스페이스: 한 번에 한 번만 바뀐다', async ({ page }) => {
  await editorWithClip(page);
  await page.getByRole('button', { name: '재생' }).click();
  await expect.poll(() => playing(page)).toBe(true);
  await page.waitForTimeout(250);
  await page.keyboard.press(' ');
  await page.waitForTimeout(150);
  expect(await playing(page)).toBe(false);
  await page.keyboard.press(' ');
  await page.waitForTimeout(150);
  expect(await playing(page)).toBe(true);
  await page.keyboard.press(' ');
  await expect.poll(() => playing(page)).toBe(false);
});

test('원래 동작을 두는 곳: 작품 이름 칸에서는 빈칸이 들어가고, Tab으로 옮겨 간 단추와 창 안의 단추는 스페이스로 눌린다', async ({ page }) => {
  await editorWithClip(page);
  const title = page.getByRole('textbox', { name: '작품 이름' });
  await title.click();
  await title.press('End');
  await page.keyboard.type(' x');
  expect(await title.inputValue()).toMatch(/ x$/);
  expect(await playing(page)).toBe(false);
  await title.press('Enter');

  // 키보드로 옮겨 다니는 중에는 초점이 있는 단추를 누른다.
  await clip(page).click({ position: { x: 120, y: 20 } });
  const mute = toolbar(page).getByRole('button', { name: '소리 끄기' });
  await mute.hover();
  await page.keyboard.press('Tab');
  await mute.focus();
  await page.keyboard.press(' ');
  await expect.poll(async () => (await doc(page)).clips[0].muted).toBe(true);
  expect(await playing(page)).toBe(false);

  // 창(원본 저장 확인) 안에서는 초점이 있는 단추를 누른다.
  await page.getByRole('button', { name: '파일' }).click();
  await page.getByRole('menuitem', { name: '원본 저장' }).click();
  const dialog = page.getByRole('alertdialog', { name: '원본 저장' });
  await dialog.getByRole('button', { name: '취소' }).focus();
  await page.keyboard.press(' ');
  await expect(dialog).toBeHidden();
  expect(await playing(page)).toBe(false);
});
