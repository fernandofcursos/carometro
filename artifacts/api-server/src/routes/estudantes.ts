import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth } from "../lib/auth.js";
import { requirePermissao } from "../lib/permissions.js";
// Fase 2: importar funções de criptografia para fotos
import {
  criptografarFoto,
  descriptografarFoto,
  verificarIntegridade,
} from "../lib/crypto.js";
import { v4 as randomUUID } from "crypto";

// Placeholder para rota /api/estudantes
const router = Router();
// Todos os endpoints exigem autenticação
router.use(requireAuth);

// Fase 2: Schema de validação para upload de foto
// Aceita data URL em base64 (ex: "data:image/jpeg;base64,...")
const uploadFotoSchema = z.object({
  // Base64 data URL da foto capturada
  fotoBase64: z.string().min(1, "Foto é obrigatória"),
});

// Fase 2: POST /api/estudantes/:id/foto — fazer upload de foto com criptografia AES-256
// Requer permissão estudantes:manage
router.post(
  "/:id/foto",
  requirePermissao("estudantes:manage"),
  async (req: Request, res: Response) => {
    try {
      // Validar payload com Zod
      const parsed = uploadFotoSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Dados inválidos",
          issues: parsed.error.issues,
        });
      }

      const { fotoBase64 } = parsed.data;

      // Validar tamanho da foto (LGPD: minimização de dados)
      // Máximo 5MB em base64 (~3.7MB em binário)
      const tamanhoBase64 = fotoBase64.length;
      if (tamanhoBase64 > 5_000_000) {
        return res.status(413).json({
          error: "Foto muito grande. Máximo: 3MB",
        });
      }

      // Criptografar foto com AES-256-CBC
      // Retorna: dados criptografados + IV + hash para integridade
      const foto = criptografarFoto(fotoBase64);

      // Gerar UUID para storage key (referência interna da foto)
      const storageKey = randomUUID();

      // TODO: Atualizar estudante no banco com dados da foto
      // await db.update(estudantesTable)
      //   .set({
      //     fotoStorageKey: storageKey,
      //     fotoDados: foto.dadosCriptografados,
      //     fotoIv: foto.iv,
      //     fotoMimeType: foto.mimeType,
      //     fotoTamanhoBytes: foto.tamanhoBytes,
      //     fotoHashIntegridade: foto.hash,
      //     atualizadoEm: new Date(),
      //   })
      //   .where(eq(estudantesTable.id, req.params.id));

      // TODO: Registrar auditoria de foto (LGPD Art. 11 — dado biométrico)
      // await registrarAuditoria({
      //   tabela: "estudantes",
      //   operacao: "UPDATE",
      //   registroId: req.params.id,
      //   usuarioId: req.usuarioId,
      //   ipOrigem: req.ip,
      //   endpoint: `POST /api/estudantes/${req.params.id}/foto`,
      //   statusHttp: 200,
      // });

      // Retornar estudante com dados da foto
      res.json({
        message: "Foto uploadada com sucesso (ainda não persistida no banco)",
        storageKey,
        mimeType: foto.mimeType,
        tamanhoBytes: foto.tamanhoBytes,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      res.status(400).json({ error: message });
    }
  }
);

// Fase 2: GET /api/estudantes/:id/foto — servir foto descriptografada
// Retorna imagem binária com headers corretos
router.get("/:id/foto", async (req: Request, res: Response) => {
  try {
    // TODO: Buscar estudante no banco
    // const [estudante] = await db
    //   .select({
    //     fotoDados: estudantesTable.fotoDados,
    //     fotoIv: estudantesTable.fotoIv,
    //     fotoMimeType: estudantesTable.fotoMimeType,
    //     fotoHashIntegridade: estudantesTable.fotoHashIntegridade,
    //   })
    //   .from(estudantesTable)
    //   .where(eq(estudantesTable.id, req.params.id));

    // if (!estudante?.fotoDados) {
    //   // Estudante não tem foto — retornar 404
    //   return res.status(404).end();
    // }

    // TODO: Descriptografar foto usando IV armazenado
    // const dadosBrutos = descriptografarFoto(
    //   estudante.fotoDados!,
    //   estudante.fotoIv!
    // );

    // TODO: Verificar integridade — ISO 27001 A.8.20 (integridade de dados)
    // const integridadeOk = verificarIntegridade(
    //   dadosBrutos,
    //   estudante.fotoHashIntegridade!
    // );

    // if (!integridadeOk) {
    //   // Foto foi corrompida — alerta de segurança
    //   req.log?.error({ estudanteId: req.params.id }, "ALERTA: integridade da foto comprometida");
    //   return res.status(500).json({ error: "Erro de integridade" });
    // }

    // TODO: Cache agressivo — foto só muda com novo upload
    // res.set("Cache-Control", "private, max-age=604800");  // 7 dias
    // res.set("Content-Type", estudante.fotoMimeType ?? "image/jpeg");
    // res.send(dadosBrutos);

    // Resposta temporária enquanto banco não conecta
    res.status(501).json({ error: "Não implementado (banco não conectado)" });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Erro ao servir foto",
    });
  }
});

// GET /api/estudantes — listar todos os estudantes
// LGPD Art. 7 — retorna apenas dados públicos (nomes, registros)
router.get("/", async (_req: Request, res: Response) => {
  try {
    // TODO: Implementar query ao banco com joins
    // const estudantes = await db
    //   .select({
    //     id: estudantesTable.id,
    //     nome: estudantesTable.nome,
    //     registro: estudantesTable.registro,
    //     fotoUrl: sql`CONCAT('/api/estudantes/', ${estudantesTable.id}, '/foto')`,
    //     turmaId: estudantesTable.turmaId,
    //     // ... outros campos públicos
    //   })
    //   .from(estudantesTable)
    //   .where(isNull(estudantesTable.deletadoEm))
    //   .orderBy(estudantesTable.nome);

    res.json([]);
  } catch (err) {
    res.status(500).json({ error: "Erro ao listar estudantes" });
  }
});

// POST /api/estudantes — criar novo estudante
// Requer permissão estudantes:manage
router.post("/", requirePermissao("estudantes:manage"), async (_req: Request, res: Response) => {
  try {
    // TODO: Validação com Zod e insert ao banco
    res.status(201).json({ message: "Não implementado" });
  } catch (err) {
    res.status(500).json({ error: "Erro ao criar estudante" });
  }
});

// PUT /api/estudantes/:id — atualizar dados do estudante
// Requer permissão estudantes:manage
router.put("/:id", requirePermissao("estudantes:manage"), async (_req: Request, res: Response) => {
  try {
    // TODO: Validação e update ao banco
    res.json({ message: "Não implementado" });
  } catch (err) {
    res.status(500).json({ error: "Erro ao atualizar estudante" });
  }
});

// DELETE /api/estudantes/:id — deletar estudante (soft delete)
// Requer permissão estudantes:manage
router.delete("/:id", requirePermissao("estudantes:manage"), async (_req: Request, res: Response) => {
  try {
    // TODO: Soft delete (marcar deletadoEm)
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: "Erro ao deletar estudante" });
  }
});

export default router;
