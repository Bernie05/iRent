/**
 * F2 acceptance: "Token values match DESIGN.md for both themes (snapshot of the CSS variables)", plus the
 * NFR4 contrast checks for every text/background pair the tokens are meant to be used in.
 */
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

// Vitest runs from the client/ package root (with css: false, a ?raw import would be empty).
const tokensCss = readFileSync(resolvePath(process.cwd(), 'src/theme/tokens.css'), 'utf8');

type Theme = 'light' | 'dark';

const css = tokensCss.replace(/\/\*[\s\S]*?\*\//g, '');

function block(selector: string): Record<string, string> {
  const match = new RegExp(`${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`).exec(css);
  if (!match) throw new Error(`No ${selector} block in tokens.css`);
  const vars: Record<string, string> = {};
  for (const [, name, value] of match[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) vars[name] = value.trim();
  return vars;
}

const root = block(':root');
const dark = block('.dark');

/** Resolves a variable for a theme, following var() chains. */
function resolve(name: string, theme: Theme, depth = 0): string {
  if (depth > 10) throw new Error(`var() cycle at ${name}`);
  const raw = (theme === 'dark' ? (dark[name] ?? root[name]) : root[name]) ?? undefined;
  if (raw === undefined) throw new Error(`Undefined token ${name}`);
  return raw.replace(/var\((--[\w-]+)\)/g, (_, ref: string) => resolve(ref, theme, depth + 1));
}

/** Which primitive a semantic token points at (one level), e.g. "gray-50". */
function primitiveOf(name: string, theme: Theme): string {
  const raw = theme === 'dark' ? (dark[name] ?? root[name]) : root[name];
  return /^var\(--([\w-]+)\)$/.exec(raw ?? '')?.[1] ?? raw;
}

const semanticNames = Object.keys(root).filter((n) => n.startsWith('--color-'));
const resolvedTheme = (theme: Theme) => Object.fromEntries(semanticNames.map((n) => [n, resolve(n, theme).toLowerCase()]));

describe('primitives match DESIGN.md → Build direction (Open house)', () => {
  const design = {
    orange: ['#FFF7ED', '#FEEBD0', '#FCD49F', '#F9B85E', '#F7A330', '#F4900A', '#C87605', '#A35E04', '#834B08', '#6A3D0B', '#3A1F04'],
    gray: ['#F5F5F4', '#ECECEA', '#DDDDDB', '#C6C6C3', '#9B9B97', '#6C6C68', '#52524F', '#3C3C3A', '#272726', '#1A1A19', '#111110'],
  };
  const steps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

  it.each(Object.entries(design))('%s scale', (scale, values) => {
    steps.forEach((step, i) => expect(root[`--${scale}-${step}`]?.toUpperCase()).toBe(values[i]));
  });

  it('gray/0 is white (logo tile) and alpha/scrim is ink at 60%', () => {
    expect(root['--gray-0']).toBe('#ffffff');
    expect(root['--alpha-scrim'].replace(/\s/g, '')).toBe('rgba(17,17,16,0.6)');
  });
});

describe('semantic tokens match DESIGN.md → Build direction (Light / Dark)', () => {
  const design: Record<string, [light: string, dark: string]> = {
    '--color-bg-page': ['gray-50', 'gray-950'],
    '--color-bg-surface': ['gray-0', 'gray-900'],
    '--color-text-primary': ['gray-950', 'gray-50'],
    '--color-text-secondary': ['gray-600', 'gray-400'],
    '--color-text-tertiary': ['gray-500', 'gray-400'],
    '--color-text-brand': ['gray-950', 'gray-50'],
    '--color-action-primary': ['gray-950', 'gray-50'],
    '--color-text-on-brand': ['gray-0', 'gray-950'],
    '--color-action-primary-hover': ['gray-700', 'gray-300'],
    '--color-action-accent': ['orange-500', 'orange-500'],
    '--color-text-on-accent': ['gray-950', 'gray-950'],
    '--color-action-accent-hover': ['orange-400', 'orange-400'],
    '--color-border-focus': ['orange-700', 'orange-400'],
    '--color-border-brand': ['gray-950', 'gray-50'],
    '--color-mark': ['orange-700', 'orange-400'],
    '--color-bg-brand-subtle': ['gray-100', 'gray-800'],
    '--color-bg-brand-strong': ['gray-950', 'gray-800'],
    '--color-text-on-brand-strong': ['gray-0', 'gray-0'],
    '--color-status-brand-bg': ['orange-100', 'orange-950'],
    '--color-status-brand-fg': ['orange-800', 'orange-300'],
    '--color-status-warning-bg': ['amber-100', 'amber-950'],
    '--color-status-warning-fg': ['amber-800', 'amber-300'],
    '--color-bg-scrim': ['alpha-scrim', 'alpha-scrim'],
  };

  it.each(Object.entries(design))('%s → %j', (name, [light, darkValue]) => {
    expect(primitiveOf(name, 'light')).toBe(light);
    expect(primitiveOf(name, 'dark')).toBe(darkValue);
  });

  it('every semantic token has a Dark value', () => {
    expect(semanticNames.filter((n) => !(n in dark))).toEqual([]);
    expect(Object.keys(dark).filter((n) => n.startsWith('--color-') && !(n in root))).toEqual([]);
  });

  it('resolved values (snapshot)', () => {
    expect({ light: resolvedTheme('light'), dark: resolvedTheme('dark') }).toMatchSnapshot();
  });

  it('other DESIGN.md tokens: spacing, radius, size', () => {
    expect([1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20].map((s) => root[`--space-${s}`])).toEqual(
      ['4px', '8px', '12px', '16px', '20px', '24px', '32px', '40px', '48px', '64px', '80px'],
    );
    expect(['sm', 'md', 'lg', 'xl', '2xl', 'full'].map((r) => root[`--radius-${r}`])).toEqual(['6px', '10px', '16px', '24px', '32px', '999px']);
    expect(['sm', 'md', 'lg'].map((s) => root[`--size-control-${s}`])).toEqual(['36px', '44px', '52px']);
    expect(['sm', 'md', 'lg'].map((s) => root[`--size-avatar-${s}`])).toEqual(['32px', '40px', '56px']);
  });
});

// ---------- WCAG contrast ----------
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
const c = (name: string, theme: Theme) => resolve(`--color-${name}`, theme);

describe.each<Theme>(['light', 'dark'])('contrast in %s (NFR4, WCAG 2.1 AA)', (theme) => {
  const textOnBackgrounds: [string, string[]][] = [
    ['text-primary', ['bg-page', 'bg-surface', 'bg-muted', 'action-secondary']],
    ['text-secondary', ['bg-page', 'bg-surface', 'bg-muted', 'bg-brand-subtle']],
    ['text-tertiary', ['bg-page', 'bg-surface']],
    ['text-brand', ['bg-page', 'bg-surface', 'bg-muted', 'bg-brand-subtle']],
    ['text-danger', ['bg-page', 'bg-surface']],
    ['text-success', ['bg-page', 'bg-surface']],
    ['text-on-brand', ['action-primary', 'action-primary-hover']],
    ['text-on-accent', ['action-accent', 'action-accent-hover']],
    ['text-on-danger', ['action-danger', 'action-danger-hover']],
    ['text-on-brand-strong', ['bg-brand-strong']],
  ];
  const cases = textOnBackgrounds.flatMap(([fg, bgs]) => bgs.map((bg) => [fg, bg] as const));

  it.each(cases)('%s on %s ≥ 4.5:1', (fg, bg) => {
    expect(contrast(c(fg, theme), c(bg, theme))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(['brand', 'warning', 'success', 'danger', 'info', 'neutral'])('status %s badge text ≥ 4.5:1', (tone) => {
    expect(contrast(c(`status-${tone}-fg`, theme), c(`status-${tone}-bg`, theme))).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ['border-focus', 'bg-page'],
    ['border-focus', 'bg-surface'],
    ['border-focus', 'bg-muted'],
    ['mark', 'bg-page'],
    ['mark', 'bg-surface'],
    ['mark', 'bg-muted'],
    ['border-strong', 'bg-page'],
    ['border-strong', 'bg-surface'],
    ['border-danger', 'bg-surface'],
    ['chart-1', 'bg-surface'],
    ['chart-2', 'bg-surface'],
  ])('non-text %s on %s ≥ 3:1', (fg, bg) => {
    expect(contrast(c(fg, theme), c(bg, theme))).toBeGreaterThanOrEqual(3);
  });
});

describe('logo orange', () => {
  it('the logo orange is never body text on white', () => {
    expect(contrast(root['--orange-500'], '#ffffff')).toBeLessThan(4.5);
    expect(contrast(c('mark', 'light'), '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });
});

describe('public "crisp" scope (.site-crisp) keeps AA', () => {
  const crisp = { light: block('.site-crisp'), dark: block('.dark .site-crisp') };
  /** A semantic colour inside the scope: scope override first, then the theme's own value. */
  const s = (name: string, theme: Theme) => {
    const raw = crisp[theme][`--color-${name}`];
    return raw ? raw.replace(/var\((--[\w-]+)\)/g, (_, ref: string) => resolve(ref, theme)) : c(name, theme);
  };

  it.each<Theme>(['light', 'dark'])('text on page, surface and muted in %s', (theme) => {
    for (const bg of ['bg-page', 'bg-surface', 'bg-muted']) {
      for (const fg of ['text-primary', 'text-secondary', 'text-tertiary']) {
        expect(contrast(s(fg, theme), s(bg, theme)), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it.each<Theme>(['light', 'dark'])('stat numbers (mark, large text) and input borders in %s', (theme) => {
    expect(contrast(s('mark', theme), s('bg-page', theme))).toBeGreaterThanOrEqual(3);
    expect(contrast(s('border-strong', theme), s('bg-surface', theme))).toBeGreaterThanOrEqual(3);
    expect(contrast(s('border-strong', theme), s('bg-page', theme))).toBeGreaterThanOrEqual(3);
  });
});

describe('photo hero scrim (.hero-on-photo)', () => {
  const hero = block('.hero-on-photo');
  const prim = (v: string) => root[/var\((--[\w-]+)\)/.exec(v)![1]];
  const alpha = Number(root['--hero-scrim-text']);
  const [r, g, b] = root['--hero-scrim-rgb'].split(',').map((x) => Number(x.trim()));
  // Worst case: the scrim over a pure-white pixel of the photo.
  const mix = (ch: number) => Math.round(ch * alpha + 255 * (1 - alpha)).toString(16).padStart(2, '0');
  const worstBg = `#${mix(r)}${mix(g)}${mix(b)}`;

  it('scrim under text is at least 0.72', () => expect(alpha).toBeGreaterThanOrEqual(0.72));

  it.each([
    ['--color-text-primary', 4.5],
    ['--color-text-secondary', 4.5],
    ['--color-mark', 3], // stats: large bold numbers
    ['--color-border-focus', 3],
    ['--color-action-primary', 3], // the white CTA against the scrim
  ])('%s over the worst-case scrim ≥ %s:1', (name, min) => {
    expect(contrast(prim(hero[name]), worstBg)).toBeGreaterThanOrEqual(min);
  });

  it('CTA text (ink on white) ≥ 4.5:1', () => {
    expect(contrast(prim(hero['--color-text-on-brand']), prim(hero['--color-action-primary']))).toBeGreaterThanOrEqual(4.5);
  });
});
