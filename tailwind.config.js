/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Sora', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
      },
      colors: {
        navy: {
          900: '#0A1F38',
          800: '#0F2A4A',
          700: '#153860',
        },
        blue: {
          600: '#2457C5',
          500: '#3B6FE0',
          100: '#E8EFFC',
        },
        green: {
          700: '#136B3B',
          600: '#178A4C',
          100: '#E3F6EA',
        },
        amber: {
          600: '#B9760F',
          100: '#FBEED9',
        },
        red: {
          600: '#C43636',
          100: '#FBE7E7',
        },
        ink: {
          900: '#121826',
          700: '#374053',
          500: '#6B7383',
          400: '#9AA1B0',
        },
        line: {
          DEFAULT: '#E5E9F0',
          soft: '#EEF1F6',
        },
        surface: '#F3F5F9',
      },
      borderRadius: {
        lg: '16px',
        md: '12px',
        sm: '8px',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(16,24,40,0.04)',
        md: '0 4px 16px rgba(16,24,40,0.06)',
        lg: '0 12px 32px rgba(16,24,40,0.10)',
      },
    },
  },
  plugins: [],
}
