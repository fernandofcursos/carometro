import express from "express";

const app = express();
app.use(express.json({ limit: "10mb" }));

app.get("/api/healthz", (_req, res) => {
  console.log("✅ Recebeu request em /healthz");
  res.json({ status: "ok" });
});

const PORT = 9999;
const server = app.listen(PORT, "127.0.0.1", () => {
  console.log(`✅ Servidor rodando em http://127.0.0.1:${PORT}`);
});

setTimeout(() => {
  console.log("Encerrando...");
  server.close();
  process.exit(0);
}, 30000);
