import plugin from 'tailwindcss/plugin';

/**
 * Tailwind maps to the design-token CSS variables in src/theme/tokens.css (F2). Raw palette colours are
 * deliberately NOT available, so components can only use semantic tokens and both themes stay correct.
 *
 *   bg-page, bg-surface, bg-primary, text-primary, text-brand, border-strong, ring-focus, bg-status-success-bg …
 */
const v = (name) => `var(--color-${name})`;

const statusTones = ['brand', 'warning', 'success', 'danger', 'info', 'neutral'];
const statusBg = Object.fromEntries(statusTones.map((t) => [`status-${t}-bg`, v(`status-${t}-bg`)]));
const statusFg = Object.fromEntries(statusTones.map((t) => [`status-${t}-fg`, v(`status-${t}-fg`)]));

/**
 * DESIGN.md → Build direction → Text styles: [weight, size/line-height px, tracking px, flags].
 * One family (Hanken Grotesk). Headlines are heavy with tight leading and negative tracking; amounts use
 * tabular figures. caps = uppercase (table headers only).
 */
const textStyles = {
  'display-l': [800, 76, 74, -3],
  'display-m': [800, 44, 46, -1.6],
  h1: [750, 34, 40, -1],
  h2: [750, 28, 34, -0.7],
  h3: [700, 20, 28, -0.3],
  h4: [700, 17, 24, -0.1],
  'amount-l': [750, 36, 42, -1, 'tabular'],
  'amount-m': [700, 20, 28, -0.3, 'tabular'],
  'body-l': [400, 18, 28, 0],
  'body-m': [400, 16, 24, 0],
  'body-m-strong': [600, 16, 24, 0],
  'body-s': [400, 14, 20, 0],
  'body-s-strong': [600, 14, 20, 0],
  'label-m': [600, 16, 24, 0],
  'label-s': [600, 14, 20, 0],
  'label-xs': [600, 12, 16, 0.1],
  caption: [400, 12, 16, 0],
  overline: [600, 12, 16, 0.6, 'caps'],
};

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      inherit: 'inherit',
    },
    backgroundColor: {
      transparent: 'transparent',
      current: 'currentColor',
      page: v('bg-page'),
      surface: v('bg-surface'),
      muted: v('bg-muted'),
      'brand-subtle': v('bg-brand-subtle'),
      'brand-strong': v('bg-brand-strong'),
      scrim: v('bg-scrim'),
      'logo-tile': v('bg-logo-tile'),
      primary: v('action-primary'),
      'primary-hover': v('action-primary-hover'),
      accent: v('action-accent'),
      'accent-hover': v('action-accent-hover'),
      secondary: v('action-secondary'),
      'secondary-hover': v('action-secondary-hover'),
      danger: v('action-danger'),
      mark: v('mark'),
      'danger-hover': v('action-danger-hover'),
      ...statusBg,
    },
    textColor: {
      transparent: 'transparent',
      current: 'currentColor',
      inherit: 'inherit',
      primary: v('text-primary'),
      secondary: v('text-secondary'),
      tertiary: v('text-tertiary'),
      brand: v('text-brand'),
      'on-brand': v('text-on-brand'),
      'on-accent': v('text-on-accent'),
      'on-brand-strong': v('text-on-brand-strong'),
      'on-danger': v('text-on-danger'),
      danger: v('text-danger'),
      success: v('text-success'),
      ...statusFg,
    },
    borderColor: {
      transparent: 'transparent',
      current: 'currentColor',
      DEFAULT: v('border-default'),
      default: v('border-default'),
      strong: v('border-strong'),
      focus: v('border-focus'),
      brand: v('border-brand'),
      danger: v('border-danger'),
    },
    ringColor: { DEFAULT: v('border-focus'), focus: v('border-focus'), danger: v('border-danger') },
    outlineColor: { focus: v('border-focus') },
    ringOffsetColor: { page: v('bg-page'), surface: v('bg-surface') },
    borderRadius: {
      none: 'var(--radius-none)',
      sm: 'var(--radius-sm)',
      DEFAULT: 'var(--radius-md)',
      md: 'var(--radius-md)',
      lg: 'var(--radius-lg)',
      xl: 'var(--radius-xl)',
      '2xl': 'var(--radius-2xl)',
      full: 'var(--radius-full)',
    },
    fontFamily: {
      heading: 'var(--font-heading)',
      body: 'var(--font-body)',
      sans: 'var(--font-body)',
    },
    boxShadow: {
      none: 'none',
      'elevation-1': 'var(--elevation-1)',
      'elevation-2': 'var(--elevation-2)',
      'elevation-3': 'var(--elevation-3)',
    },
    extend: {
      // Default Tailwind spacing is already the 4 px scale of DESIGN.md (space/1 = 1 = 4 px).
      spacing: {
        'control-sm': 'var(--size-control-sm)',
        'control-md': 'var(--size-control-md)',
        'control-lg': 'var(--size-control-lg)',
        'icon-sm': 'var(--size-icon-sm)',
        'icon-md': 'var(--size-icon-md)',
        'icon-lg': 'var(--size-icon-lg)',
        'avatar-sm': 'var(--size-avatar-sm)',
        'avatar-md': 'var(--size-avatar-md)',
        'avatar-lg': 'var(--size-avatar-lg)',
      },
      minHeight: { touch: 'var(--size-control-md)' },
      minWidth: { touch: 'var(--size-control-md)' },
      borderWidth: { thin: 'var(--border-thin)', thick: 'var(--border-thick)' },
      transitionDuration: { modal: 'var(--duration-modal)', fast: 'var(--duration-fast)' },
      transitionTimingFunction: { out: 'var(--ease-out)' },
      // Modal enter (DESIGN.md Interactions & Motion). The global reduced-motion rule in index.css cuts these to ~0ms.
      keyframes: {
        'scrim-in': { from: { opacity: '0' } },
        'dialog-in': { from: { opacity: '0', transform: 'translateY(8px) scale(0.97)' } },
        'sheet-in': { from: { transform: 'translateY(100%)' } },
      },
      animation: {
        'scrim-in': 'scrim-in var(--duration-modal) var(--ease-out)',
        'dialog-in': 'dialog-in var(--duration-modal) var(--ease-out)',
        'sheet-in': 'sheet-in 320ms var(--ease-out)',
      },
    },
  },
  plugins: [
    // `type-<style>` classes: one class per DESIGN.md text style (family, weight, size, line height, tracking).
    plugin(({ addComponents }) => {
      addComponents(
        Object.fromEntries(
          Object.entries(textStyles).map(([name, [weight, size, lineHeight, tracking, flag]]) => [
            `.type-${name}`,
            {
              fontFamily: 'var(--font-body)',
              fontWeight: String(weight),
              fontSize: `${size / 16}rem`,
              lineHeight: `${lineHeight / 16}rem`,
              letterSpacing: `${tracking}px`,
              ...(flag === 'tabular' ? { fontVariantNumeric: 'tabular-nums' } : {}),
              ...(flag === 'caps' ? { textTransform: 'uppercase' } : {}),
            },
          ]),
        ),
      );
    }),
  ],
};
