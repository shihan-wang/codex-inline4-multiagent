import { readFile } from 'node:fs/promises';

let source = await readFile('scripts/browser-acceptance.mjs', 'utf8');
source = source
  .replace(
    "  const desktop = await inspectPage(cdp, '1280x720');",
    "  const desktop = await inspectPage(cdp, '1280x720');\n" +
    "  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });\n" +
    "  await sleep(1200); await capture(cdp, 'hero-1600x1000.png');\n" +
    "  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false }); await sleep(900);"
  )
  .replace('  const frameTiming = await measureAnimation(cdp);', '  const frameTiming = { skipped: true };')
  .replace('  const interactions = await exerciseControls(cdp);', '  const interactions = { skipped: true };')
  .replace('  const pointerInteractions = await canvasInteractions(cdp);', '  const pointerInteractions = { skipped: true };')
  .replace(
    "  await evaluate(cdp, `document.querySelector('.mode-control button[data-value=\"solid\"]')?.click()`);",
    "  for (const preset of ['isometric', 'front', 'side', 'top', 'crank', 'combustion']) {\n" +
    "    await evaluate(cdp, `document.querySelector('.mode-control button[data-value=\"solid\"]')?.click(); document.querySelector('.preset-row button[data-value=\"${preset}\"]')?.click()`);\n" +
    "    await sleep(1100); await capture(cdp, `camera-${preset}-1280x720.png`);\n" +
    "  }\n" +
    "  await evaluate(cdp, `document.querySelector('.mode-control button[data-value=\"solid\"]')?.click(); document.querySelector('.preset-row button[data-value=\"isometric\"]')?.click()`);"
  );

await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
