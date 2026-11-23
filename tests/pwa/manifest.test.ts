import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const publicDir = path.resolve(__dirname, '../../public');

/** Reads width/height from a PNG IHDR chunk (bytes 16-23 of the file). */
function pngSize(file: string): { width: number; height: number } {
  const buf = fs.readFileSync(file);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe('PWA Manifest & Icons', () => {
  it('has valid manifest with standalone display, and theme colors', () => {
    const raw = fs.readFileSync(path.resolve(__dirname, '../../public/manifest.json'), 'utf-8');
    const manifest = JSON.parse(raw);
    expect(manifest.name).toMatch(/Flappy Fish|JerayaWara/);
    expect(manifest.short_name).toMatch(/FlappyFish|JerayaWara/);
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.length).toBeGreaterThan(0);
  });

  it('ships PNG icons with separate any and maskable purposes', () => {
    const raw = fs.readFileSync(path.resolve(publicDir, 'manifest.json'), 'utf-8');
    const manifest = JSON.parse(raw);

    // iOS ignores SVG touch icons and some installers require PNG, so the
    // install set must be PNG. Maskable needs its own art (safe-zone padding),
    // so purposes must not share one entry.
    const pngIcons = manifest.icons.filter((i: { type: string }) => i.type === 'image/png');
    expect(pngIcons.length).toBeGreaterThanOrEqual(3);

    const anyIcons = manifest.icons.filter((i: { purpose: string }) => i.purpose === 'any');
    const maskableIcons = manifest.icons.filter(
      (i: { purpose: string }) => i.purpose === 'maskable'
    );
    expect(anyIcons.some((i: { sizes: string }) => i.sizes === '192x192')).toBe(true);
    expect(anyIcons.some((i: { sizes: string }) => i.sizes === '512x512')).toBe(true);
    expect(maskableIcons.some((i: { sizes: string }) => i.sizes === '512x512')).toBe(true);

    for (const icon of manifest.icons) {
      const file = path.resolve(publicDir, icon.src.replace(/^\.\//, ''));
      expect(fs.existsSync(file), `missing icon ${icon.src}`).toBe(true);
    }
  });

  it('provides correctly sized PNG icons including an apple-touch-icon', () => {
    expect(pngSize(path.resolve(publicDir, 'icons/icon-192.png'))).toEqual({
      width: 192,
      height: 192,
    });
    expect(pngSize(path.resolve(publicDir, 'icons/icon-512.png'))).toEqual({
      width: 512,
      height: 512,
    });
    expect(pngSize(path.resolve(publicDir, 'icons/icon-512-maskable.png'))).toEqual({
      width: 512,
      height: 512,
    });
    // iOS home-screen tiles use apple-touch-icon; an SVG here falls back to a
    // screenshot tile.
    expect(pngSize(path.resolve(publicDir, 'icons/apple-touch-icon.png'))).toEqual({
      width: 180,
      height: 180,
    });

    const html = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf-8');
    expect(html).toContain('apple-touch-icon.png');
    expect(html).toContain('apple-touch-icon');
  });
});
