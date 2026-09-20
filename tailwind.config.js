/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand: deep navy "ink" on a cool paper background.
        ink: {
          50: '#F5F7FA',
          100: '#ECEFF5',
          200: '#D9DFEA',
          300: '#B7C0D1',
          400: '#8592AD',
          500: '#5A6B8C',
          600: '#3E5075',
          700: '#24365A',
          800: '#16233B',
          900: '#0D1729',
        },
        paper: '#F5F7FA',
        // Screening bands. These mirror the colours on a real MUAC tape.
        normal: { DEFAULT: '#1E9E63', ink: '#0B6B41', tint: '#E1F4EA' },
        mam: { DEFAULT: '#F2B01E', ink: '#7A5200', tint: '#FFF1CC' },
        sam: { DEFAULT: '#D63B3B', ink: '#A11F1F', tint: '#FCE6E6' },
        signal: '#2F6BFF',
      },
      fontFamily: {
        sans: ['"Manrope Variable"', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['"Fraunces Variable"', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
}
