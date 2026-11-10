#!/usr/bin/env node
// Generates public/icon-192.png, public/icon-512.png, public/apple-touch-icon.png,
// public/favicon-32.png and public/favicon.svg
// from src/icon.svg using @resvg/resvg-js (pure JS, no native deps required).
//
// Run: node scripts/generate-icons.mjs

import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const svgData = readFileSync(join(root, 'src', 'icon.svg'), 'utf-8');
// SVG favicon for modern browsers (crisp at any size)
writeFileSync(join(root, 'public', 'favicon.svg'), svgData);
console.log('✓ public/favicon.svg');

const targets = [
  { size: 512, file: 'icon-512.png' },
  { size: 192, file: 'icon-192.png' },
  { size: 180, file: 'apple-touch-icon.png' },
  { size: 32, file: 'favicon-32.png' },
];

for (const { size, file } of targets) {
  const resvg = new Resvg(svgData, {
    fitTo: { mode: 'width', value: size },
  });
  const rendered = resvg.render();
  const png = rendered.asPng();
  writeFileSync(join(root, 'public', file), png);
  console.log(`✓ public/${file} (${size}x${size})`);
}
