import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import handler from './index';

// 環境変数の読み込み
const PORT = parseInt(process.env.PORT || '3333', 10);
const env = {
  BACKEND_URL: process.env.BACKEND_URL || 'http://localhost:4444',
  ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN || '*',
  TARGET_IFRAME_URL: process.env.TARGET_IFRAME_URL || 'http://localhost:3000'
};

// Honoアプリケーションの作成
const app = new Hono();

// 既存のCloudFlare WorkersハンドラーをHonoで使用
app.all('*', async (c) => {
  return await handler.fetch(c.req.raw, env);
});

// サーバーの起動
console.log(`Frontend server running on http://localhost:${PORT}`);
console.log('Environment:', env);

serve({
  fetch: app.fetch,
  port: PORT,
});