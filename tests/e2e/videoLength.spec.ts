import { test, expect, type Page } from '@playwright/test';

// 영상 길이 한도 설정(계약 §5): 영상 작품 목록의 보호자 설정에서 분·시간·무제한을 고르고, 새로고침해도 남으며, 편집기 명령이 그 값을 따른다.
const run = (page: Page, command: unknown) => page.evaluate(command => { const { store } = (window as any).__canvacraftVideo; const p = store.getProject(); return store.dispatch(p.id, p.revision, command); }, command);
const longMedia = (minutes: number) => ({ id: 'e'.repeat(64), mime: 'video/mp4', byteLength: 5_000_000, durationMs: minutes * 60_000, width: 1280, height: 720, rotation: 0, fps: 30, hasAudio: false, videoCodec: 'avc1.64001f', audioCodec: null });

async function openHome(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '영상 만들기' }).click();
  await expect(page.getByRole('heading', { name: '내 영상' })).toBeVisible();
}

test('길이 한도: 기본 10분, 시간·분·무제한으로 바꾸고 새로고침해도 남으며, 잘못된 값은 저장하지 못한다', async ({ page }) => {
  await openHome(page);
  const button = page.getByRole('button', { name: /^길이 한도/ });
  await expect(button).toHaveText('길이 한도 10분');

  await button.click();
  const dialog = page.getByRole('dialog', { name: '영상 길이 한도' });
  await dialog.getByRole('spinbutton', { name: '한도 숫자' }).fill('0');
  await expect(dialog.getByRole('alert')).toContainText('1부터');
  await expect(dialog.getByRole('button', { name: '저장' })).toBeDisabled();
  await dialog.getByRole('spinbutton', { name: '한도 숫자' }).fill('2');
  await dialog.getByRole('combobox', { name: '한도 단위' }).selectOption('hour');
  await dialog.getByRole('button', { name: '저장' }).click();
  await expect(page.getByRole('status')).toHaveText('영상 길이 한도를 2시간으로 바꿨어요.');
  await expect(button).toHaveText('길이 한도 2시간');

  await page.reload();
  await page.getByRole('button', { name: '영상 만들기' }).click().catch(() => undefined);
  await expect(page.getByRole('button', { name: /^길이 한도/ })).toHaveText('길이 한도 2시간');

  await page.getByRole('button', { name: /^길이 한도/ }).click();
  await page.getByRole('radio', { name: '무제한' }).check();
  await page.getByRole('dialog', { name: '영상 길이 한도' }).getByRole('button', { name: '저장' }).click();
  await expect(page.getByRole('button', { name: /^길이 한도/ })).toHaveText('길이 한도 무제한');

  await page.getByRole('button', { name: /^길이 한도/ }).click();
  await page.getByRole('radio', { name: /까지/ }).check();
  await page.getByRole('spinbutton', { name: '한도 숫자' }).fill('45');
  await page.getByRole('combobox', { name: '한도 단위' }).selectOption('minute');
  await page.getByRole('button', { name: '저장' }).click();
  await expect(page.getByRole('button', { name: /^길이 한도/ })).toHaveText('길이 한도 45분');
});

test('길이 한도: 편집기의 영상 넣기 명령이 지금 설정을 따르고, 안내에 한도가 나온다', async ({ page }) => {
  await openHome(page);
  await page.getByRole('button', { name: '새 작품' }).click();
  await page.waitForFunction(() => (window as any).__canvacraftVideo?.store);
  // 기본 10분: 20분 영상은 넣을 수 없다.
  expect(await run(page, { type: 'addClip', media: longMedia(20) })).toMatchObject({ ok: false, code: 'LIMIT_EXCEEDED', message: '영상이 너무 길어요. 10분까지 넣을 수 있어요.' });
  // 설정을 30분으로 바꾸면(같은 브라우저) 다음 명령부터 따른다.
  await page.evaluate(() => localStorage.setItem('canvacraft.video.lengthLimit', JSON.stringify({ ms: 30 * 60_000 })));
  expect(await run(page, { type: 'addClip', media: longMedia(20) })).toMatchObject({ ok: true });
  await expect(page.getByTestId('timeline-total')).toHaveText('20:00');
  expect(await run(page, { type: 'addClip', media: { ...longMedia(15), id: 'f'.repeat(64) } })).toMatchObject({ ok: false, message: '작품이 너무 길어져요. 30분까지 만들 수 있어요.' });
});
