import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// During `vite dev`, requests to /api/* are handled by Vercel's CLI
// (`vercel dev`) or by the platform in production. For a pure `vite dev`
// run you can point /api at a local handler via a proxy if desired.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
})
