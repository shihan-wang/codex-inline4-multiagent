import { readFile } from 'node:fs/promises';

let source = await readFile('scripts/browser-acceptance.mjs', 'utf8');
source = source.replace(
  "  const pointerInteractions = await canvasInteractions(cdp);\n  await evaluate(cdp, `document.querySelector('.mode-control button[data-value=\"solid\"]')?.click()`);",
  "  const pointerInteractions = await canvasInteractions(cdp);\n" +
  "  await evaluate(cdp, `document.querySelector('.mode-control button[data-value=\"solid\"]')?.click(); document.querySelector('#toggle-explode')?.click()`); await waitForAnimationFrames(cdp); await capture(cdp, 'exploded-solid.png');\n" +
  "  await evaluate(cdp, `document.querySelector('#toggle-explode')?.click()`);\n" +
  "  await evaluate(cdp, `document.querySelector('.mode-control button[data-value=\"solid\"]')?.click()`);"
);

await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
