// Playwright smoke for the public production web UI (donation/membership + SEO signposts).
// Drives a running site (next start) with the same `playwright` chromium the FEM smokes use.
//   SMOKE_BASE_URL  base URL to test (default http://localhost:3000)
//   SMOKE_OUT       screenshot output dir (default ./__web-playwright-smoke)
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = (process.env.SMOKE_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const OUT = process.env.SMOKE_OUT || '__web-playwright-smoke';
const PATREON_JOIN = 'https://www.patreon.com/16003704/join';
const PATREON_PAGE = 'https://www.patreon.com/c/geotechcli/posts';
const GITHUB_REPO = 'github.com/kilickursat/geotechcli-';

const results = [];
const record = (name, ok, detail = '') => results.push({ name, ok: Boolean(ok), detail });

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  // --- /pricing : Donation & Membership ---
  await page.goto(`${BASE}/pricing`, { waitUntil: 'networkidle' });
  record('pricing: Support & Membership header', (await page.getByText('Support & Membership').count()) > 0);
  record('pricing: free deterministic panel', (await page.getByText('Deterministic CLI').count()) > 0);
  record('pricing: "Free forever" badge', (await page.getByText('Free forever').count()) > 0);
  record('pricing: Tier-1 LLM panel', (await page.getByText('Tier-1 LLM').count()) > 0);
  record('pricing: "Donation-supported" badge', (await page.getByText('Donation-supported').count()) > 0);
  record('pricing: $10+ minimum shown', (await page.getByText(/\$10/).count()) > 0);
  record('pricing: recurring-cancel warning', (await page.getByText(/cancel your Patreon membership immediately/i).count()) > 0);
  record('pricing: "renew automatically every month" note', (await page.getByText(/renew automatically every month/i).count()) > 0);

  // Membership tiers + open source (0.4.133)
  record('pricing: membership heading', (await page.getByText('Choose your membership').count()) > 0);
  record('pricing: Supporter $10 tier', (await page.getByText(/\$10/).count()) > 0);
  record('pricing: Excellent Support $50 tier', (await page.getByText('Excellent Support').count()) > 0 && (await page.getByText(/\$50/).count()) > 0);
  record('pricing: Diamond Supporter $500 tier', (await page.getByText('Diamond Supporter').count()) > 0 && (await page.getByText(/\$500/).count()) > 0);
  record('pricing: open source panel', (await page.getByText(/open source/i).count()) > 0);

  const hrefs = await page.$$eval('a', (els) => els.map((a) => a.getAttribute('href')));
  record('pricing: Patreon JOIN link present', hrefs.includes(PATREON_JOIN), hrefs.filter((h) => h && h.includes('patreon')).join(' , '));
  record('pricing: Patreon PAGE link present', hrefs.includes(PATREON_PAGE));
  record('pricing: GitHub repo link present', hrefs.some((h) => h && h.includes(GITHUB_REPO)));
  record('nav: Donate link', (await page.locator('nav a', { hasText: 'Donate' }).count()) > 0);
  record('nav: GitHub link', (await page.locator('nav a', { hasText: 'GitHub' }).count()) > 0);
  record('footer: Patreon link', (await page.locator('footer a', { hasText: 'Patreon' }).count()) > 0);
  record('footer: GitHub link', (await page.locator('footer a', { hasText: 'GitHub' }).count()) > 0);
  await page.screenshot({ path: `${OUT}/pricing.png`, fullPage: true });

  // --- homepage ---
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  record('home: donation/support section', (await page.getByText('Support & Membership').count()) > 0);
  record('home: "Support on Patreon" CTA', (await page.getByText(/Support on Patreon/i).count()) > 0);
  record('home: "Star on GitHub" CTA', (await page.getByText(/Star on GitHub/i).count()) > 0);
  const homeHtml = await page.content();
  record('home: no stale "GLM 5.1"', !homeHtml.includes('GLM 5.1'));
  await page.screenshot({ path: `${OUT}/home.png`, fullPage: true });

  // --- mobile viewport: the warning must remain visible ---
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const mpage = await mobile.newPage();
  await mpage.goto(`${BASE}/pricing`, { waitUntil: 'networkidle' });
  record('pricing(mobile): recurring-cancel warning visible', (await mpage.getByText(/cancel your Patreon membership immediately/i).count()) > 0);
  await mpage.screenshot({ path: `${OUT}/pricing-mobile.png`, fullPage: true });

  record('no console / page errors', consoleErrors.length === 0, consoleErrors.slice(0, 5).join(' | '));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  [${r.detail}]` : ''}`);
}
console.log(`\n${results.length - failed.length}/${results.length} checks passed (screenshots in ${OUT})`);
process.exit(failed.length ? 1 : 0);
