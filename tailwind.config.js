/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#0a0a0a',
        surface: '#111111',
        surfaceHover: '#1a1a1a',
        border: '#222222',
        accent: '#22c55e', // Green like github/leetcode
        accentHover: '#16a34a',
        textMain: '#ededed',
        textMuted: '#888888',
      },
      fontFamily: {
        sans: ['Inter', 'Geist', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-in-out',
        'pop': 'pop 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        'slide-up-fade': 'slideUpFade 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: 0 },
          '100%': { opacity: 1 },
        },
        pop: {
          '0%': { transform: 'scale(0.95)', opacity: 0.8 },
          '100%': { transform: 'scale(1)', opacity: 1 },
        },
        slideUpFade: {
          '0%': { opacity: 0, transform: 'translateY(16px)', filter: 'blur(4px)' },
          '100%': { opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' },
        }
      }
    },
  },
  plugins: [require('tailwindcss-animate')],
}
