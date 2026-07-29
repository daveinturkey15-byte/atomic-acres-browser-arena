import { canonicalPass65PreviewArenaDependencies } from './pass65-menu-preview-arena-dependencies';

void canonicalPass65PreviewArenaDependencies().then((manifest) => {
  process.stdout.write(`${JSON.stringify(manifest)}\n`);
}).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
