// Test simples para verificar se os middlewares funcionam
import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";

console.log("✅ [TEST] Iniciando teste de middlewares...");

const app = express();

try {
  app.use(helmet());
  console.log("✅ [TEST] Helmet configurado");

  app.use(cors({
    origin: process.env.FRONTEND_URL ?? "http://localhost:5000",
    credentials: true,
  }));
  console.log("✅ [TEST] CORS configurado");

  app.use(cookieParser());
  console.log("✅ [TEST] Cookie parser configurado");

  app.use(express.json({ limit: "10mb" }));
  console.log("✅ [TEST] JSON parser configurado");

  app.use(pinoHttp({ level: process.env.LOG_LEVEL ?? "info" }));
  console.log("✅ [TEST] Pino HTTP configurado");

  app.get("/api/healthz", (_req, res) => {
    res.json({ status: "ok" });
  });
  console.log("✅ [TEST] Health check route registrada");

  const PORT = 8080;
  const server = app.listen(PORT, () => {
    console.log(`✅ [TEST] 🚀 Servidor rodando na porta ${PORT}`);
  });

  setTimeout(() => {
    console.log("✅ [TEST] Teste completado com sucesso!");
    server.close();
    process.exit(0);
  }, 2000);
} catch (err) {
  console.error("❌ [TEST] Erro:", err instanceof Error ? err.message : err);
  process.exit(1);
}
