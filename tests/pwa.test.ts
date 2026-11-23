import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('PWA & Deployment Pipeline', () => {
  const rootDir = path.resolve(__dirname, '..');
  const manifestPath = path.join(rootDir, 'public/manifest.json');
  const swPath = path.join(rootDir, 'public/sw.js');
  const icon192Path = path.join(rootDir, 'public/icons/icon-192.svg');
  const icon512Path = path.join(rootDir, 'public/icons/icon-512.svg');
  const indexPath = path.join(rootDir, 'index.html');
  const viteConfigPath = path.join(rootDir, 'vite.config.ts');
  const workflowPath = path.join(rootDir, '.github/workflows/deploy.yml');

  describe('Web App Manifest (public/manifest.json)', () => {
    it('exists and is valid JSON', () => {
      expect(fs.existsSync(manifestPath)).toBe(true);
      const content = fs.readFileSync(manifestPath, 'utf-8');
      expect(() => JSON.parse(content)).not.toThrow();
    });

    it('contains correct Flappy Fish metadata', () => {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      expect(manifest.name).toBe('Flappy Fish - Deep Sea Arcade');
      expect(manifest.short_name).toBe('FlappyFish');
      expect(manifest.description).toBe(
        'Underwater Flappy Bird clone with bioluminescent fish, fluid physics, and bubble shields'
      );
      expect(manifest.start_url).toBe('./');
      expect(manifest.display).toBe('standalone');
      expect(manifest.orientation).toBe('portrait');
      expect(manifest.background_color).toBe('#020617');
      expect(manifest.theme_color).toBe('#0369a1');
    });

    it('declares 192x192 and 512x512 PNG install icons', () => {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      expect(Array.isArray(manifest.icons)).toBe(true);
      expect(manifest.icons.length).toBeGreaterThanOrEqual(2);

      // PNG install icons: iOS ignores SVG touch icons and some installers
      // require PNG. The SVG set remains as a modern-browser extra.
      const png192 = manifest.icons.find(
        (i: any) => i.sizes === '192x192' && i.type === 'image/png' && i.purpose === 'any'
      );
      const png512 = manifest.icons.find(
        (i: any) => i.sizes === '512x512' && i.type === 'image/png' && i.purpose === 'any'
      );

      expect(png192).toBeDefined();
      expect(png192.src).toContain('icon-192.png');

      expect(png512).toBeDefined();
      expect(png512.src).toContain('icon-512.png');
    });
  });

  describe('SVG App Icons', () => {
    it('provides valid icon-192.svg with glowing bioluminescent vector elements', () => {
      expect(fs.existsSync(icon192Path)).toBe(true);
      const svg = fs.readFileSync(icon192Path, 'utf-8');
      expect(svg).toContain('<svg');
      expect(svg).toContain('width="192"');
      expect(svg).toContain('height="192"');
      expect(svg).toContain('#020617'); // Deep sea background
      expect(svg).toContain('#0369a1'); // Ocean blue gradient
      expect(svg).toContain('#06b6d4'); // Bioluminescent cyan
    });

    it('provides valid icon-512.svg with glowing bioluminescent vector elements', () => {
      expect(fs.existsSync(icon512Path)).toBe(true);
      const svg = fs.readFileSync(icon512Path, 'utf-8');
      expect(svg).toContain('<svg');
      expect(svg).toContain('width="512"');
      expect(svg).toContain('height="512"');
      expect(svg).toContain('#020617');
      expect(svg).toContain('#0369a1');
      expect(svg).toContain('#06b6d4');
    });
  });

  describe('Service Worker (public/sw.js) - Review Focus 5', () => {
    it('exists and implements the offline/update strategy', () => {
      expect(fs.existsSync(swPath)).toBe(true);
      const swCode = fs.readFileSync(swPath, 'utf-8');

      // Cache name (single deploy knob for cached shell content)
      expect(swCode).toMatch(/CACHE_NAME\s*=/);
      expect(swCode).toContain("'flappy-fish-v4'");

      // The registration query forces returning clients onto the new shell.
      const mainCode = fs.readFileSync(
        path.join(rootDir, 'src/main.tsx'),
        'utf-8'
      );
      expect(mainCode).toContain('sw.js?v=12');

      // Core assets pre-caching
      expect(swCode).toContain('./index.html');
      expect(swCode).toContain('./manifest.json');
      expect(swCode).toContain('./icons/icon-192.svg');
      expect(swCode).toContain('./icons/icon-512.svg');

      // Lifecycle events
      expect(swCode).toContain("'install'");
      expect(swCode).toContain('skipWaiting');
      expect(swCode).toContain("'activate'");
      expect(swCode).toContain('clients.claim');

      // Fetch handler logic (network-first navigations + cache-first assets)
      expect(swCode).toContain("'fetch'");
      expect(swCode).toContain('caches.match');
      expect(swCode).toContain('fetch(');

      // Offline HTML fallback
      expect(swCode).toContain('index.html');
    });
  });

  describe('HTML Entry Point (index.html)', () => {
    it('includes PWA manifest link and iOS meta tags', () => {
      expect(fs.existsSync(indexPath)).toBe(true);
      const html = fs.readFileSync(indexPath, 'utf-8');

      expect(html).toContain('href="./manifest.json"');
      expect(html).toContain('name="apple-mobile-web-app-capable" content="yes"');
      expect(html).toContain('name="apple-mobile-web-app-status-bar-style" content="black-translucent"');
      expect(html).toContain('name="apple-mobile-web-app-title" content="FlappyFish"');
      expect(html).toContain('rel="apple-touch-icon" href="./icons/apple-touch-icon.png"');
      expect(html).toContain('<title>Flappy Fish - Deep Sea Arcade</title>');
    });

    it('keeps pinch zoom available for accessibility', () => {
      const html = fs.readFileSync(indexPath, 'utf-8');

      // The game stage already blocks pinch with touch-action: none, so the
      // viewport meta must not additionally lock out zooming on the help and
      // score text (screen magnification, low-vision users).
      expect(html).toContain('viewport-fit=cover');
      expect(html).not.toContain('user-scalable=no');
      expect(html).not.toContain('maximum-scale');
    });

    it('registers the service worker only from the production entry, not the HTML', () => {
      const html = fs.readFileSync(indexPath, 'utf-8');
      // main.tsx (production-only) owns the v12 registration; a second inline
      // registration would race it and is deliberately absent.
      expect(html).not.toContain('navigator.serviceWorker.register');

      const mainCode = fs.readFileSync(
        path.join(rootDir, 'src/main.tsx'),
        'utf-8'
      );
      expect(mainCode).toContain("'serviceWorker' in navigator");
      expect(mainCode).toContain('navigator.serviceWorker');
      expect(mainCode).toContain('sw.js?v=12');
    });
  });

  describe('Vite Configuration (vite.config.ts)', () => {
    it('sets base to relative path for GitHub Pages compatibility', () => {
      expect(fs.existsSync(viteConfigPath)).toBe(true);
      const viteConfig = fs.readFileSync(viteConfigPath, 'utf-8');
      expect(viteConfig).toMatch(/base:\s*['"]\.\/['"]/);
    });
  });

  describe('GitHub Pages CI/CD Workflow (.github/workflows/deploy.yml)', () => {
    it('exists and defines build & deploy steps for GitHub Pages', () => {
      expect(fs.existsSync(workflowPath)).toBe(true);
      const workflow = fs.readFileSync(workflowPath, 'utf-8');

      // Triggers
      expect(workflow).toContain('branches:');
      expect(workflow).toContain('main');
      expect(workflow).toContain('workflow_dispatch:');

      // Pages permissions
      expect(workflow).toContain('pages: write');
      expect(workflow).toContain('id-token: write');

      // Official GitHub Actions
      expect(workflow).toContain('actions/checkout@v4');
      expect(workflow).toContain('actions/setup-node@v4');
      expect(workflow).toContain('actions/configure-pages@v5');
      expect(workflow).toContain('actions/upload-pages-artifact@v3');
      expect(workflow).toContain('actions/deploy-pages@v4');

      // Build step
      expect(workflow).toContain('npm run build');
      expect(workflow).toContain("path: './dist'");
    });
  });
});
