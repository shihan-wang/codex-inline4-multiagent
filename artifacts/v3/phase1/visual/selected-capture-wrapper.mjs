import { readFile } from 'node:fs/promises';

let source = await readFile('scripts/browser-acceptance.mjs', 'utf8');
source = source.replace(
  `  // Preserve the selection assertion, then clear the cyan inspector box so
  // visual-regression captures compare the engine rather than test residue.
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 950, y: 650, button: 'left', buttons: 1, clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 950, y: 650, button: 'left', buttons: 0, clickCount: 1 });

  await evaluate(cdp, \`document.querySelector('.preset-row button[data-value="isometric"]')?.click()\`);
  await sleep(900);`,
  `  await evaluate(cdp, \`document.querySelector('.preset-row button[data-value="isometric"]')?.click()\`);
  await sleep(900);
  await capture(cdp, 'selection-1280x720.png');`,
);

await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
