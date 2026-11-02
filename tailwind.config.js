import plugin from 'tailwindcss/plugin';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', '"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      colors: {
        canvas: { DEFAULT: '#F5F5F7', dark: '#0B0D12' },
        surface: { DEFAULT: '#FFFFFF', dark: '#12151C', raised: '#171B24' },
        line: { DEFAULT: '#E4E4E7', dark: 'rgba(255,255,255,0.07)' },
        ink: '#18181B',
        peach: { DEFAULT: '#F5BE86', soft: '#F8CBA0', deep: '#F97316' },
        rose: { soft: '#F5D0C5' },
        taupe: '#D6C7BC',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'rise-in': { from: { opacity: '0', transform: 'translate3d(0, 8px, 0)' }, to: { opacity: '1', transform: 'translate3d(0, 0, 0)' } },
        // Solar Horizon: every keyframe touches only transform or opacity.
        breathe: { '0%, 100%': { transform: 'scale(1)' }, '50%': { transform: 'scale(1.06)' } },
        sheen: { from: { transform: 'translate3d(-120%, 0, 0) skewX(-20deg)' }, to: { transform: 'translate3d(320%, 0, 0) skewX(-20deg)' } },
        'gold-pulse': { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.4' } },
        'tick-pulse': { '0%': { transform: 'scale(1)' }, '35%': { transform: 'scale(1.015)' }, '100%': { transform: 'scale(1)' } },
        'glow-pulse': { '0%, 100%': { opacity: '0.45' }, '50%': { opacity: '1' } },
        'bar-rise': { from: { transform: 'scaleY(0)', opacity: '0' }, to: { transform: 'scaleY(1)', opacity: '1' } },
        'bar-grow': { from: { transform: 'scaleX(0)' }, to: { transform: 'scaleX(1)' } },
      },
      animation: {
        'fade-in': 'fade-in 200ms cubic-bezier(0.22, 1, 0.36, 1)',
        'rise-in': 'rise-in 280ms cubic-bezier(0.22, 1, 0.36, 1)',
        breathe: 'breathe 5s ease-in-out infinite',
        sheen: 'sheen 4s ease-in-out infinite',
        'gold-pulse': 'gold-pulse 1s ease-in-out infinite',
        'tick-pulse': 'tick-pulse 320ms cubic-bezier(0.22, 1, 0.36, 1)',
        'glow-pulse': 'glow-pulse 2.4s ease-in-out infinite',
        'bar-rise': 'bar-rise 600ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'bar-grow': 'bar-grow 700ms cubic-bezier(0.22, 1, 0.36, 1) both',
      },
      // Performance budget: transitions only ever touch opacity and transform.
      transitionProperty: {
        DEFAULT: 'opacity, transform',
        colors: 'opacity, transform',
        all: 'opacity, transform',
        shadow: 'opacity, transform',
      },
      transitionTimingFunction: {
        DEFAULT: 'cubic-bezier(0.22, 1, 0.36, 1)',
        out: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      transitionDuration: {
        DEFAULT: '200ms',
      },
    },
  },
  plugins: [
    // `short:` for phones held sideways (wide but short), used by the clock and break layouts.
    // A plugin variant instead of a raw `screens` entry, which would turn off min-* and max-* variants.
    // Plugin variants are emitted before the sm/md/lg screens, so `:root &` adds one level of
    // specificity and a sideways phone (wider than 640 or 768 px) still gets the `short:` value.
    plugin(({ addVariant }) => addVariant('short', '@media (orientation: landscape) and (max-height: 540px) { :root & }')),
  ],
};
