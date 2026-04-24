import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    preserveSymlinks: false,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        ws: false,
        // 不给 SSE 设超时，避免代理主动断流。
        proxyTimeout: 0,
        timeout: 0,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes, _req, res) => {
            const contentType = proxyRes.headers['content-type'];
            if (typeof contentType === 'string' && contentType.includes('text/event-stream')) {
              // `proxyRes` 事件触发时，上游响应头还没被 http-proxy 回写到浏览器响应。
              // 如果这里直接 flushHeaders()，浏览器拿到的是一个"没有 Content-Type 的分块响应"，
              // Chrome 就不会把它识别成 EventStream。
              res.statusCode = proxyRes.statusCode ?? res.statusCode;
              res.setHeader('Content-Type', contentType);

              const cacheControl = proxyRes.headers['cache-control'];
              if (cacheControl !== undefined) {
                res.setHeader('Cache-Control', cacheControl);
              }

              const xAccelBuffering = proxyRes.headers['x-accel-buffering'];
              if (xAccelBuffering !== undefined) {
                res.setHeader('X-Accel-Buffering', xAccelBuffering);
              }

              // 关闭 Nagle，让每个 chunk 立即下发；flushHeaders 让响应头先出去。
              // 否则 Chrome DevTools 不会把响应识别为 EventStream，面板为空。
              res.socket?.setNoDelay(true);
              res.flushHeaders();
            }
          });
        },
      },
    },
  },
});
