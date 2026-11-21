Guide screenshots (refreshed 2026-11-21)

These PNGs were captured with Playwright Chromium from the current local Next.js
application at a 1100px desktop viewport, using the light theme throughout.
Only local synthetic data and a non-admin member session were used. No real user
data, production credentials, database access, or product-code mocks were used.
Existing test fixtures supplied HTTP responses at the external data boundary.
Screenshots are actual UI captures, cropped to the relevant DOM sections; no
compositing, annotations, or generated UI is included.

STEP / file / captured view:

1. ゲストモード画面.png — /guest, initial home and start instructions.
2. デッキ管理画面.png — /decks, proposal form and expanded Royal class.
3. 戦績入力画面.png — /matches, selected decks and save actions.
4. 分析画面.png — /analysis, personal deck summary with recent results.
5. 対面勝率画面.png — /analysis, expanded personal matchup analysis.
6. 相性表画面.png — /matrix, member environment-wide matrix and PNG action.
7. 環境分析画面.png — /environment?period=7d, encounter/win-rate and change rankings.
7. 推移分析画面.png — same page, Trends tab with two decks selected.

The guide labels these as sample data, not live metagame statistics. Preserve
the existing Japanese filenames when replacing images. Update each screenshot's
intrinsic width/height in src/app/guide/page.tsx to match the new PNG dimensions.
GuideScreenshot uses responsive, automatic-height images and a placeholder when
a file is unavailable. Images also link to their full-resolution PNG in a new tab.
