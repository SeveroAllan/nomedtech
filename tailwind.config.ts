import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/features/**/*.{js,ts,jsx,tsx,mdx}',
    './src/shared/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        'background-2': 'var(--background-2)',
        'background-3': 'var(--background-3)',
        card: 'var(--card)',
        border: 'var(--border)',
        hover: 'var(--hover)',
        ring: 'var(--ring)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-placeholder': 'var(--text-placeholder)',
        'ds-white': 'var(--ds-white)',
        'ds-page': 'var(--ds-page)',
        'ds-raised': 'var(--ds-raised)',
        'ds-ink': 'var(--ds-ink)',
        'ds-ink-2': 'var(--ds-ink-2)',
        'ds-ink-4': 'var(--ds-ink-4)',
        'ds-teal': 'var(--ds-teal)',
        'ds-red': 'var(--ds-red)',
        'ds-hairline': 'var(--ds-hairline)',
        'ds-hover': 'var(--ds-hover)',
        'ds-hover-red': 'var(--ds-hover-red)',
        'ds-scrim': 'var(--ds-scrim)',
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
        sm: 'var(--radius)',
        md: 'var(--radius)',
        lg: 'var(--radius)',
        ui: 'var(--radius)',
      },
      boxShadow: {
        control: 'var(--ds-shadow-control)',
        modal: 'var(--ds-shadow-modal)',
      },
      fontFamily: {
        display: ['var(--ds-font-display)', "'Bricolage Grotesque'", 'sans-serif'],
        text: ['var(--ds-font-text)', "'Familjen Grotesk'", 'sans-serif'],
        sans: ['var(--ds-font-text)', "'Familjen Grotesk'", 'sans-serif'],
        mono: ['Source Code Pro', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
