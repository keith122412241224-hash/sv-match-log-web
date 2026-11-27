/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');

// Run against the signed-in synthetic member's home page with a saved match.
exports.verifyMatchActionsRefresh = async function (context, origin) {
  for (const width of [1365, 390]) {
    for (const failRefresh of [false, true]) {
      const page = await context.newPage();
      let release;
      const gate = new Promise(resolve => { release = resolve; });
      try {
        await page.setViewportSize({ width, height: 844 });
        if (width === 390) await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.goto(origin + '/', { waitUntil: 'load' });
        const button = page.getByRole('button', { name: '戦績の操作', exact: true }).first();
        const dialog = page.getByRole('dialog');
        await button.press('Enter');
        await dialog.getByRole('button', { name: '編集', exact: true }).click();
        const save = dialog.getByRole('button', { name: '変更を保存' });
        await save.waitFor();

        const isRefresh = request => request.method() === 'GET' &&
          new URL(request.url()).pathname === '/' && request.headers().rsc === '1';
        await page.route('**/*', async route => {
          if (!isRefresh(route.request())) return route.fallback();
          await gate;
          if (failRefresh) return route.fulfill({ status: 503, body: 'Fixture refresh failure' });
          return route.continue();
        });
        await Promise.all([page.waitForRequest(isRefresh), save.click()]);
        await page.getByRole('status').filter({ hasText: '戦績を更新しました' }).waitFor();
        const pending = page.getByRole('button', { name: '戦績の操作（一覧を更新中）' }).first();
        await pending.waitFor();
        assert.ok(await pending.isDisabled());
        const bounds = await pending.boundingBox();
        assert.ok(bounds && bounds.width >= 44 && bounds.height >= 44 && bounds.x >= 0 && bounds.x + bounds.width <= width);
        const indicator = pending.locator('svg');
        assert.ok(await indicator.isVisible());
        if (width === 390) assert.equal(await indicator.evaluate(el => getComputedStyle(el).animationName), 'none');
        assert.equal(await button.count(), 0);
        assert.ok(await pending.evaluate(el => el === document.activeElement), 'keep keyboard focus after edit');
        await page.keyboard.press('Space');
        await pending.evaluate(el => el.click());
        assert.equal(await dialog.count(), 0);

        // A failed Flight response makes Next recover with a full document load.
        const recoveryLoad = failRefresh ? page.waitForEvent('load') : undefined;
        release();
        await recoveryLoad;
        await button.waitFor();
        assert.ok(await button.isEnabled());
        await button.press('Enter');
        await dialog.getByRole('button', { name: '編集', exact: true }).waitFor();
        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'hidden' });
        assert.ok(await button.evaluate(el => el === document.activeElement));
      } finally {
        release();
        await page.close();
      }
    }
  }
};
