import express from "express";

const app = express();
app.use(express.json({ limit: "10mb" }));

app.get("/api/healthz", (_req, res) => {
  console.log("📍 Recebeu requisição em /api/healthz");
  res.json({ status: "ok" });
});

const PORT = 8080;
const server = app.listen(PORT, () => {
  console.log(`✅ Servidor mínimo rodando na porta ${PORT}`);
});

setTimeout(() => {
  console.log("⏱️ Encerrando após 30s");
  server.close();
  process.exit(0);
}, 30000);
