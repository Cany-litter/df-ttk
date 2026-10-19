import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const server = await createServer({
  root: __dirname,
  configFile: false,
  base: '/',
  plugins: [vue()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: { host: '127.0.0.1', port: 5174, strictPort: false },
  logLevel: 'warn',
});
await server.listen();
const port = server.config.server.port;
console.log('VITE_DEV_READY ' + port);
setInterval(() => {}, 1 << 30);
