// Generates PNG icons for the PWA / APK from public/logo.svg.
// Run in CI:  npm i sharp && node scripts/gen-icons.mjs
import { readFileSync } from "node:fs";
import sharp from "sharp";

const svgBuf = readFileSync("public/logo.svg");
const svgText = svgBuf.toString().replace(/<\?xml[^>]*\?>/g, "");

await sharp(svgBuf, { density: 300 }).resize(192, 192).png().toFile("public/icon-192.png");
await sharp(svgBuf, { density: 300 }).resize(512, 512).png().toFile("public/icon-512.png");

// Maskable icon: safe zone padding on a solid brand background
const maskable = Buffer.from(
  `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="512" height="512" fill="#171a2b"/>` +
    `<g transform="translate(102.4,102.4) scale(0.6)">${svgText}</g></svg>`,
);
await sharp(maskable, { density: 300 }).png().toFile("public/maskable-512.png");

console.log("icons generated: icon-192.png, icon-512.png, maskable-512.png");
