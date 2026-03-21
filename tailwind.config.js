/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    fontSize: {
      'xs': ['0.95rem', { lineHeight: '1.4' }],
      'sm': ['1.05rem', { lineHeight: '1.5' }],
      'base': ['1.15rem', { lineHeight: '1.6' }],
      'lg': ['1.3rem', { lineHeight: '1.5' }],
      'xl': ['1.5rem', { lineHeight: '1.4' }],
      '2xl': ['1.8rem', { lineHeight: '1.3' }],
      '3xl': ['2.2rem', { lineHeight: '1.2' }],
      '4xl': ['2.8rem', { lineHeight: '1.1' }]
    },
    extend: {}
  },
  plugins: []
}
