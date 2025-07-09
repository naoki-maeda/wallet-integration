import { Hono } from "hono";
import { serve } from "@hono/node-server";
import handler from "./index";

// 環境変数の読み込み
const PORT = parseInt(process.env.PORT || "4444", 10);
const env = {
  TARGET_API_URL: process.env.TARGET_API_URL || "https://api.example.com",
  ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN || "*",
  COOKIE_NAME: process.env.COOKIE_NAME || "auth-token",
  PUBLIC_KEY: process.env.PUBLIC_KEY || "",
};

// Honoアプリケーションの作成
const app = new Hono();

// 既存のCloudFlare WorkersハンドラーをHonoで使用
app.all("*", async (c) => {
  return await handler.fetch(c.req.raw, env);
});

// サーバーの起動
console.log(`Backend server running on http://localhost:${PORT}`);
console.log("Environment:", env);

serve({
  fetch: app.fetch,
  port: PORT,
});
