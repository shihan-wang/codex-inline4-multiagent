import { build } from 'esbuild';

await build({
  entryPoints: ['evaluation/mechanics/scan-assembly.ts'],
  outfile: 'evaluation/mechanics/runtime/scan-assembly.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  sourcemap: false,
  minify: false,
  logLevel: 'info',
});
