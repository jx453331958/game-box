import type { Config } from 'tailwindcss'

export default {
  content: ['./src/app/**/*.{ts,tsx}', './src/components/**/*.{ts,tsx}', './src/games/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
} satisfies Config
