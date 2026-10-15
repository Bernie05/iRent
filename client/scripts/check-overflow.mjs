// Responsive check: no horizontal overflow on any route at any common device width (plus phone landscape).
// Needs the mock dev server: `npm run dev:mocks`, then `npm run check:overflow` (BASE_URL overrides the URL).
// Fails (exit 1) on overflow. Interactive elements smaller than 44px are listed as warnings (NFR4).
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const WIDTHS = [320, 375, 390, 414, 768, 834, 1024, 1280, 1440, 1920];
const PASSWORD = 'Password1';
const GROUPS = [
  { login: null, routes: ['/', '/login', '/forgot-password'] },
  { login: 'ana@irent.test', routes: ['/portal', '/portal/pay', '/portal/history', '/portal/bills'] },
  {
    login: 'admin@irent.test',
    routes: ['/admin', '/admin/beds', '/admin/renters', '/admin/rent', '/admin/payments', '/admin/bills', '/admin/inquiries', '/admin/announcements', '/admin/promotions', '/admin/settings'],
    modal: { route: '/admin/renters', button: /add renter/i },
  },
];

/** Runs in the page: overflow numbers, the widest offenders and undersized tap targets. */
function measure() {
  const vw = document.documentElement.clientWidth;
  const overflow = document.documentElement.scrollWidth > window.innerWidth;
  const label = (el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/).slice(0, 4).join('.')}` : ''}`;
  const offenders = overflow
    ? [...document.querySelectorAll('body *')].filter((el) => el.getBoundingClientRect().right > vw + 1).slice(0, 4).map(label)
    : [];
  const small = [...document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role=tab], [role=radio]')]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || el.classList.contains('sr-only')) return false;
      if (el.tagName === 'A' && el.closest('p, td, li') && !el.className.includes('min-h')) return false; // inline text links
      const box = el.tagName === 'INPUT' && ['checkbox', 'radio'].includes(el.type) ? el.closest('label')?.getBoundingClientRect() ?? r : r;
      return box.height < 43.5;
    })
    .map((el) => `${label(el)} (${Math.round(el.getBoundingClientRect().height)}px)`);
  return { sw: document.documentElement.scrollWidth, iw: window.innerWidth, offenders, small: [...new Set(small)].slice(0, 5) };
}

async function goClientSide(page, path) {
  if (new URL(page.url()).pathname === path) return;
  await page.evaluate((p) => {
    window.history.pushState({}, '', p);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
  await page.waitForURL((u) => u.pathname === path);
}

const failures = [];
const warnings = [];
const browser = await chromium.launch();

async function check(page, name) {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(150);
    const r = await page.evaluate(measure);
    if (r.sw > r.iw) failures.push(`${name} @${width}: scrollWidth ${r.sw} > ${r.iw}  ${r.offenders.join(' | ')}`);
    if (r.small.length && (width === 375 || width === 1440)) warnings.push(`${name} @${width}: small targets ${r.small.join(', ')}`);
  }
}

for (const group of GROUPS) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  if (group.login) {
    await page.goto(`${BASE}/login?next=${encodeURIComponent(group.routes[0])}`);
    await page.getByLabel(/email/i).fill(group.login);
    await page.getByLabel(/password/i).fill(PASSWORD);
    await page.getByRole('button', { name: /log in/i }).click();
    await page.waitForURL((u) => u.pathname === group.routes[0], { timeout: 20000 });
  }
  for (const route of group.routes) {
    if (group.login) await goClientSide(page, route);
    else await page.goto(`${BASE}${route}`);
    await page.locator('#main').waitFor();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(400);
    await check(page, route);
    if (group.modal?.route === route) {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.getByRole('button', { name: group.modal.button }).first().click();
      await page.getByRole('dialog').waitFor();
      await check(page, `${route} (modal)`);
      await page.keyboard.press('Escape');
    }
  }
  await page.close();
}

// Phone landscape: hero and navbar.
const landscape = await browser.newPage({ viewport: { width: 844, height: 390 } });
await landscape.goto(`${BASE}/`);
await landscape.waitForLoadState('networkidle');
const l = await landscape.evaluate(measure);
if (l.sw > l.iw) failures.push(`/ @844x390 landscape: scrollWidth ${l.sw} > ${l.iw}  ${l.offenders.join(' | ')}`);
await browser.close();

const routes = GROUPS.reduce((n, g) => n + g.routes.length, 0);
console.log(`Checked ${routes} routes + 1 modal x ${WIDTHS.length} widths (${WIDTHS.join(', ')}) + 844x390 landscape.`);
if (warnings.length) console.log(`\nWarnings (tap targets under 44px):\n${warnings.join('\n')}`);
if (failures.length) {
  console.error(`\nHorizontal overflow:\n${failures.join('\n')}`);
  process.exit(1);
}
console.log('\nNo horizontal overflow.');
