#!/usr/bin/env node
// scripts/test-coverage-badge.mjs
// Generates a coverage badge SVG from a Vitest coverage JSON report.
// Usage: node scripts/test-coverage-badge.mjs <coverage-summary.json> <output.svg>

import { readFileSync, writeFileSync } from "node:fs";

const [input, output] = [process.argv[2], process.argv[3]];

if (!input || !output) {
  console.error("usage: node scripts/test-coverage-badge.mjs <coverage-summary.json> <output.svg>");
  process.exit(1);
}

let summary;
try {
  summary = JSON.parse(readFileSync(input, "utf8"));
} catch (err) {
  console.error(`failed to read coverage summary at ${input}:`, err.message);
  process.exit(1);
}

const total = summary.total ?? {};
const pct = Math.round(total.lines?.pct ?? 0);

// Color by threshold
const color =
  pct >= 80 ? "#4c1" :
  pct >= 60 ? "#97ca00" :
  pct >= 40 ? "#dfb317" :
  pct >= 20 ? "#fe7d37" :
              "#e05d44";

const label = "coverage";
const value = `${pct}%`;

const labelWidth = 65;
const valueWidth = 45;
const totalWidth = labelWidth + valueWidth;

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${label}: ${value}">
  <title>${label}: ${value}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${color}"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="110">
    <text aria-hidden="true" x="${(labelWidth + 5) / 2 * 10}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)">${label}</text>
    <text x="${(labelWidth + 5) / 2 * 10}" y="140" transform="scale(.1)">${label}</text>
    <text aria-hidden="true" x="${(labelWidth + valueWidth / 2 - 1) * 10}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)">${value}</text>
    <text x="${(labelWidth + valueWidth / 2 - 1) * 10}" y="140" transform="scale(.1)">${value}</text>
  </g>
</svg>
`;

writeFileSync(output, svg);
console.log(`wrote coverage badge (${pct}%) → ${output}`);
