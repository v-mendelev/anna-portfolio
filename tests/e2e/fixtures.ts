import { test as base, expect } from '@playwright/test';

interface Fixtures {
  /** Issues matching these patterns are expected and ignored (e.g. on the 404 page). */
  allowedIssues: RegExp[];
  pageIssues: string[];
}

/**
 * Extends the base test with automatic collection of console errors,
 * uncaught page errors and failed same-origin requests (broken CSS/JS/
 * image paths). Every test fails if any unexpected issue occurs.
 */
export const test = base.extend<Fixtures>({
  allowedIssues: [[], { option: true }],
  pageIssues: [
    async ({ page, baseURL, allowedIssues }, use) => {
      const issues: string[] = [];
      const origin = baseURL ? new URL(baseURL).origin : '';
      page.on('console', (msg) => {
        if (msg.type() === 'error') issues.push(`console.error: ${msg.text()}`);
      });
      page.on('pageerror', (err) => issues.push(`pageerror: ${err.message}`));
      page.on('requestfailed', (req) => {
        if (req.url().startsWith(origin)) issues.push(`request failed: ${req.url()}`);
      });
      page.on('response', (res) => {
        const url = res.url();
        if (
          url.startsWith(origin) &&
          res.status() >= 400 &&
          res.request().resourceType() !== 'document'
        ) {
          issues.push(`HTTP ${res.status()}: ${url}`);
        }
      });
      await use(issues);
      const unexpected = issues.filter((i) => !allowedIssues.some((re) => re.test(i)));
      expect(unexpected, 'page produced errors or broken requests').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
