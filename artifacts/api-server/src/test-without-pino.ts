// Teste sem Pino para isolar o problema
import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";

const app = express();

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL ?? "http://localhost:5000",
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));

// ⚠️ Pulando pinoHttp por enquanto

app.get("/api/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

const PORT = 8080;
app.listen(PORT, () => {
  console.log(`✅ API rodando na porta ${PORT} (sem Pino para debug)`);
});
