import { build } from 'esbuild';

await build({
  entryPoints: ['evaluation/geometry/export-semantic-scene.ts'],
  outfile: 'evaluation/geometry/runtime/export-semantic-scene.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  sourcemap: false,
  minify: false,
  logLevel: 'info',
});
