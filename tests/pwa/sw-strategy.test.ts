import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Service Worker fetch strategy & update flow', () => {
  const rootDir = path.resolve(__dirname, '../..');
  const swCode = fs.readFileSync(path.join(rootDir, 'public/sw.js'), 'utf-8');
  const mainCode = fs.readFileSync(path.join(rootDir, 'src/main.tsx'), 'utf-8');

  describe('network-first for navigations/HTML documents', () => {
    it('detects navigation / document requests', () => {
      expect(swCode).toMatch(/request\.mode === 'navigate'/);
      expect(swCode).toMatch(/request\.destination === 'document'/);
    });

    it('consults the network before the cache fallback for navigations', () => {
      const navStart = swCode.indexOf('isNavigationRequest(event.request)');
      expect(navStart).toBeGreaterThan(-1);
      // The navigation branch runs from its guard to the same-origin guard below.
      const navSlice = swCode.slice(navStart, swCode.indexOf('if (!sameOrigin)'));
      const fetchIdx = navSlice.indexOf('fetch(event.request)');
      const cacheFallbackIdx = navSlice.indexOf("caches.match('./index.html')");
      expect(fetchIdx).toBeGreaterThan(-1);
      expect(cacheFallbackIdx).toBeGreaterThan(fetchIdx);
    });

    it('refreshes the cached shell with the fresh navigation response', () => {
      const navStart = swCode.indexOf('isNavigationRequest(event.request)');
      const navSlice = swCode.slice(navStart, swCode.indexOf('if (!sameOrigin)'));
      expect(navSlice).toMatch(/event\.waitUntil\(\s*cachePut\(/);
    });
  });

  describe('cache-first for hashed ./assets/** build assets', () => {
    it('serves hashed assets from cache before the network', () => {
      expect(swCode).toContain("url.pathname.includes('/assets/')");
      const assetStart = swCode.indexOf('if (isHashedAsset)');
      expect(assetStart).toBeGreaterThan(-1);
      const assetSlice = swCode.slice(assetStart, swCode.indexOf('stale-while-revalidate'));
      const cacheIdx = assetSlice.indexOf('caches.match(event.request)');
      const fetchIdx = assetSlice.indexOf('fetch(event.request)');
      expect(cacheIdx).toBeGreaterThan(-1);
      expect(fetchIdx).toBeGreaterThan(cacheIdx);
    });
  });

  describe('runtime caching is same-origin only and skips opaque responses', () => {
    it('guards caching behind a same-origin / non-opaque check', () => {
      expect(swCode).toContain('self.location.origin');
      expect(swCode).toMatch(/response\.type === 'basic'/);
      expect(swCode).toMatch(/isCacheableResponse\(/);
      // Opaque responses must never be written to the cache.
      expect(swCode).not.toContain("type === 'opaque'");
    });

    it('does not handle cross-origin requests in the runtime cache paths', () => {
      expect(swCode).toMatch(/if \(!sameOrigin\) return;/);
    });
  });

  describe('cache writes survive the service worker lifetime', () => {
    it('wraps every cache.put inside event.waitUntil', () => {
      const putCount = (swCode.match(/cache\.put\(/g) || []).length;
      const callCount = (swCode.match(/cachePut\(/g) || []).length;
      const wrappedCount = (swCode.match(/event\.waitUntil\(\s*cachePut\(/g) || []).length;
      // cache.put exists only inside the cachePut helper...
      expect(putCount).toBe(1);
      // ...and every call site of the helper is wrapped in event.waitUntil.
      expect(callCount).toBeGreaterThan(0);
      expect(wrappedCount).toBe(callCount);
    });
  });

  describe('offline fallbacks never resolve respondWith with undefined', () => {
    it('falls back to a Response for HTML navigations', () => {
      expect(swCode).toContain('Response.error()');
      expect(swCode).toMatch(
        /caches\s*\.\s*match\(['"]\.\/index\.html['"]\)[\s\S]{0,200}?Response\.error\(\)/
      );
    });

    it('falls back to a Response (not undefined) for non-HTML requests', () => {
      // Stale-while-revalidate miss path ends in Response.error(), never bare
      // undefined. Hashed-asset network failures propagate as rejections, which
      // is allowed — what must never happen is respondWith resolving undefined.
      expect(swCode).toMatch(/revalidate\.catch\(\(\) => Response\.error\(\)\)/);
      expect(swCode).not.toMatch(/catch\(\(\)\s*=>\s*\{\s*\}\)/);
    });
  });

  describe('cache versioning & activation cleanup', () => {
    it('keeps CACHE_NAME as the single deploy knob and purges old caches', () => {
      expect(swCode).toMatch(/CACHE_NAME\s*=\s*'flappy-fish-v4'/);
      expect(swCode).toMatch(/key !== CACHE_NAME/);
      expect(swCode).toContain('caches.delete(');
    });
  });

  describe('update flow in src/main.tsx', () => {
    it('registers sw.js with a ?v=N cache-buster', () => {
      expect(mainCode).toMatch(/sw\.js\?v=\d+/);
    });

    it('reloads once on controllerchange with a reload-loop guard', () => {
      expect(mainCode).toContain('controllerchange');
      expect(mainCode).toContain('location.reload()');
      // Guard flag: initialized false, early-returns when already refreshed,
      // and is set before the reload.
      expect(mainCode).toMatch(/let\s+refreshed\s*=\s*false/);
      expect(mainCode).toMatch(/if \(refreshed\) return;/);
      expect(mainCode).toMatch(/refreshed = true;/);
    });

    it('keeps skipWaiting/clients.claim consistent with the takeover reload', () => {
      expect(swCode).toContain('skipWaiting');
      expect(swCode).toContain('clients.claim');
    });
  });
});
