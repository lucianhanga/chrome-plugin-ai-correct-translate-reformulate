import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/popup/**/*.{ts,tsx}',
    './src/options/**/*.{ts,tsx}',
    './popup.html',
  ],
  theme: {
    extend: {
      colors: {
        success: '#22c55e',
        failure: '#ef4444',
        warning: '#eab308',
      },
    },
  },
  plugins: [],
};

export default config;
