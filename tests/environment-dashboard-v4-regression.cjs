/* eslint-disable @typescript-eslint/no-require-imports */
// Reuse the existing mutation regression with the same loopback API port used
// for the v4 verification build. No assertions or application code are changed.
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
const filename = require.resolve('./match-mutations.browser.cjs');
const output = path.resolve(process.env.V4_MUTATION_OUTPUT || 'build/dashboard-v4-match-regression');
if (process.env.V4_MUTATION_APP) process.chdir(process.env.V4_MUTATION_APP);
const runner = new Module(filename, module);
runner.filename = filename;
runner.paths = Module._nodeModulePaths(path.dirname(filename));
runner._compile(fs.readFileSync(filename, 'utf8').replaceAll('54329', '54339')
  .replace("path.resolve('build/match-mutations')", JSON.stringify(output))
  .replace("calls.push({ method: req.method, path: url.pathname });", `const call = { method: req.method, path: url.pathname, query: url.search, subject };
      calls.push(call);
      const endResponse = res.end.bind(res);
      res.end = payload => { call.status = res.statusCode; call.response = payload ? JSON.parse(payload) : null; return endResponse(payload); };`)
  .replace("const page = await context.newPage();", `const page = await context.newPage();
    page.on('response', async response => {
      if (response.request().method() === 'POST' && new URL(response.url()).port === '3268') {
        const file = path.join(output, 'actions.jsonl');
        fs.appendFileSync(file, JSON.stringify({ url: response.url(), status: response.status(), body: await response.text().catch(() => '<unavailable>') }) + '\\n');
      }
    });`)
  .replace('} finally { if (browser)', `} finally {
    fs.writeFileSync(path.join(output, 'http.json'), JSON.stringify(calls, null, 2));
    fs.writeFileSync(path.join(output, 'progress.json'), JSON.stringify({ checks, errors, warnings, pageerrors }, null, 2));
    if (browser)`)
  .replace("await page.getByRole('alert').filter({ hasText: 'local test write failure' }).waitFor();", `await page.getByRole('alert').filter({ hasText: 'local test write failure' }).waitFor().catch(async error => {
    fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify({ checks, errors, warnings, pageerrors, calls, text: await page.locator('body').innerText() }, null, 2));
    await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true });
    throw error;
  });`), filename);
