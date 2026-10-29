import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Two pages: the dashboard (index.html) and RD Expenses, the cardholder app
// (card/index.html, served at /card/ with its own manifest and icons).
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        card: 'card/index.html',
      },
    },
  },
})
