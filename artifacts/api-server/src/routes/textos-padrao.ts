import { Router } from "express";
import multer from "multer";
import mammoth from "mammoth";
import { createRequire } from "module";
const _require = createRequire(import.meta.url);
const { PDFParse } = _require("pdf-parse") as { PDFParse: new () => { loadPDF(buf: Buffer): Promise<{ pages: { content: string }[] }> } };
import {
  db,
  textosPadraoOcorrenciasTable,
  insertTextoPadraoSchema,
  ocorrenciasTable,
  tiposOcorrenciasTable,
  estudantesTable,
  eq,
  isNull,
  and,
} from "@workspace/db";
import { requireAuth } from "../lib/auth.js";
import { requirePermissao } from "../lib/permissions.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const router = Router();

const PLACEHOLDERS: Record<string, string> = {
  "{{NOME_ESTUDANTE}}": "Nome do Estudante",
  "{{DATA_REGISTRO}}": "Data do Registro",
  "{{DATA_OCORRENCIA}}": "Data da Ocorrência",
  "{{TIPO_OCORRENCIA}}": "Tipo de Ocorrência",
  "{{DESCRICAO}}": "Descrição da Ocorrência",
};

function renderizarTexto(
  corpo: string,
  dados: {
    nomeEstudante?: string;
    dataRegistro?: string;
    dataOcorrencia?: string;
    tipoOcorrencia?: string;
    descricao?: string;
  }
): string {
  return corpo
    .replace(/\{\{NOME_ESTUDANTE\}\}/g, dados.nomeEstudante ?? "{{NOME_ESTUDANTE}}")
    .replace(/\{\{DATA_REGISTRO\}\}/g, dados.dataRegistro ?? "{{DATA_REGISTRO}}")
    .replace(/\{\{DATA_OCORRENCIA\}\}/g, dados.dataOcorrencia ?? "{{DATA_OCORRENCIA}}")
    .replace(/\{\{TIPO_OCORRENCIA\}\}/g, dados.tipoOcorrencia ?? "{{TIPO_OCORRENCIA}}")
    .replace(/\{\{DESCRICAO\}\}/g, dados.descricao ?? "{{DESCRICAO}}");
}

// GET /api/textos-padrao — lista todos (com soft delete filtrado)
router.get(
  "/",
  requireAuth,
  requirePermissao("tipos-ocorrencias:manage"),
  async (req, res) => {
    try {
      const rows = await db
        .select({
          id: textosPadraoOcorrenciasTable.id,
          tipoOcorrenciaId: textosPadraoOcorrenciasTable.tipoOcorrenciaId,
          tipoDescricao: tiposOcorrenciasTable.descricao,
          titulo: textosPadraoOcorrenciasTable.titulo,
          corpo: textosPadraoOcorrenciasTable.corpo,
          ativo: textosPadraoOcorrenciasTable.ativo,
          criadoEm: textosPadraoOcorrenciasTable.criadoEm,
          atualizadoEm: textosPadraoOcorrenciasTable.atualizadoEm,
        })
        .from(textosPadraoOcorrenciasTable)
        .leftJoin(
          tiposOcorrenciasTable,
          eq(tiposOcorrenciasTable.id, textosPadraoOcorrenciasTable.tipoOcorrenciaId)
        )
        .where(isNull(textosPadraoOcorrenciasTable.deletadoEm))
        .orderBy(tiposOcorrenciasTable.descricao, textosPadraoOcorrenciasTable.titulo);
      res.json(rows);
    } catch (err) {
      req.log?.error(err);
      res.status(500).json({ error: "Erro ao buscar textos padrão." });
    }
  }
);

// GET /api/textos-padrao/placeholders — lista placeholders disponíveis
router.get("/placeholders", requireAuth, (_req, res) => {
  res.json(
    Object.entries(PLACEHOLDERS).map(([placeholder, descricao]) => ({
      placeholder,
      descricao,
    }))
  );
});

// GET /api/textos-padrao/tipo/:tipoOcorrenciaId — texto ativo para o tipo
router.get("/tipo/:tipoOcorrenciaId", requireAuth, async (req, res) => {
  try {
    const [row] = await db
      .select()
      .from(textosPadraoOcorrenciasTable)
      .where(
        and(
          eq(textosPadraoOcorrenciasTable.tipoOcorrenciaId, req.params.tipoOcorrenciaId),
          eq(textosPadraoOcorrenciasTable.ativo, true),
          isNull(textosPadraoOcorrenciasTable.deletadoEm)
        )
      )
      .limit(1);
    if (!row) return res.status(404).json({ error: "Nenhum texto padrão ativo para este tipo." });
    res.json(row);
  } catch (err) {
    req.log?.error(err);
    res.status(500).json({ error: "Erro ao buscar texto padrão." });
  }
});

// GET /api/textos-padrao/:id/render?ocorrenciaId= — renderiza com dados reais
router.get("/:id/render", requireAuth, async (req, res) => {
  try {
    const [texto] = await db
      .select()
      .from(textosPadraoOcorrenciasTable)
      .where(
        and(
          eq(textosPadraoOcorrenciasTable.id, req.params.id),
          isNull(textosPadraoOcorrenciasTable.deletadoEm)
        )
      )
      .limit(1);
    if (!texto) return res.status(404).json({ error: "Texto padrão não encontrado." });

    const dados: Parameters<typeof renderizarTexto>[1] = {};

    if (req.query.ocorrenciaId) {
      const [oc] = await db
        .select({
          dataOcorrencia: ocorrenciasTable.dataOcorrencia,
          criadoEm: ocorrenciasTable.criadoEm,
          observacao: ocorrenciasTable.observacao,
          tipoDescricao: tiposOcorrenciasTable.descricao,
          estudanteNome: estudantesTable.nome,
        })
        .from(ocorrenciasTable)
        .leftJoin(tiposOcorrenciasTable, eq(tiposOcorrenciasTable.id, ocorrenciasTable.tipoOcorrenciaId))
        .leftJoin(estudantesTable, eq(estudantesTable.id, ocorrenciasTable.estudanteId))
        .where(eq(ocorrenciasTable.id, req.query.ocorrenciaId as string))
        .limit(1);
      if (oc) {
        dados.nomeEstudante = oc.estudanteNome ?? undefined;
        dados.dataRegistro = oc.criadoEm?.toLocaleDateString("pt-BR") ?? undefined;
        dados.dataOcorrencia = oc.dataOcorrencia
          ? new Date(oc.dataOcorrencia).toLocaleDateString("pt-BR")
          : undefined;
        dados.tipoOcorrencia = oc.tipoDescricao ?? undefined;
        dados.descricao = oc.observacao ?? undefined;
      }
    }

    res.json({
      ...texto,
      corpoRenderizado: renderizarTexto(texto.corpo, dados),
    });
  } catch (err) {
    req.log?.error(err);
    res.status(500).json({ error: "Erro ao renderizar texto padrão." });
  }
});

// POST /api/textos-padrao
router.post(
  "/",
  requireAuth,
  requirePermissao("tipos-ocorrencias:manage"),
  async (req, res) => {
    try {
      const parsed = insertTextoPadraoSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Dados inválidos.", detalhes: parsed.error.flatten() });
      }
      const data = parsed.data;

      // Verificar se já existe texto ativo para o tipo
      if (data.ativo !== false) {
        const [existente] = await db
          .select({ id: textosPadraoOcorrenciasTable.id })
          .from(textosPadraoOcorrenciasTable)
          .where(
            and(
              eq(textosPadraoOcorrenciasTable.tipoOcorrenciaId, data.tipoOcorrenciaId),
              eq(textosPadraoOcorrenciasTable.ativo, true),
              isNull(textosPadraoOcorrenciasTable.deletadoEm)
            )
          )
          .limit(1);
        if (existente) {
          return res.status(409).json({
            error: "Já existe um texto padrão ativo para este tipo de ocorrência. Desative ou remova o existente antes de criar um novo.",
          });
        }
      }

      const [novo] = await db
        .insert(textosPadraoOcorrenciasTable)
        .values(data)
        .returning();
      res.status(201).json(novo);
    } catch (err) {
      req.log?.error(err);
      res.status(500).json({ error: "Erro ao criar texto padrão." });
    }
  }
);

// PUT /api/textos-padrao/:id
router.put(
  "/:id",
  requireAuth,
  requirePermissao("tipos-ocorrencias:manage"),
  async (req, res) => {
    try {
      const parsed = insertTextoPadraoSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Dados inválidos.", detalhes: parsed.error.flatten() });
      }

      const [existente] = await db
        .select()
        .from(textosPadraoOcorrenciasTable)
        .where(
          and(
            eq(textosPadraoOcorrenciasTable.id, req.params.id),
            isNull(textosPadraoOcorrenciasTable.deletadoEm)
          )
        )
        .limit(1);
      if (!existente) return res.status(404).json({ error: "Texto padrão não encontrado." });

      // Se ativando, verificar conflito
      if (parsed.data.ativo === true && !existente.ativo) {
        const tipoId = parsed.data.tipoOcorrenciaId ?? existente.tipoOcorrenciaId;
        const [conflito] = await db
          .select({ id: textosPadraoOcorrenciasTable.id })
          .from(textosPadraoOcorrenciasTable)
          .where(
            and(
              eq(textosPadraoOcorrenciasTable.tipoOcorrenciaId, tipoId),
              eq(textosPadraoOcorrenciasTable.ativo, true),
              isNull(textosPadraoOcorrenciasTable.deletadoEm)
            )
          )
          .limit(1);
        if (conflito && conflito.id !== req.params.id) {
          return res.status(409).json({
            error: "Já existe um texto padrão ativo para este tipo de ocorrência.",
          });
        }
      }

      const [atualizado] = await db
        .update(textosPadraoOcorrenciasTable)
        .set({ ...parsed.data, atualizadoEm: new Date() })
        .where(eq(textosPadraoOcorrenciasTable.id, req.params.id))
        .returning();
      res.json(atualizado);
    } catch (err) {
      req.log?.error(err);
      res.status(500).json({ error: "Erro ao atualizar texto padrão." });
    }
  }
);

// DELETE /api/textos-padrao/:id — soft delete
router.delete(
  "/:id",
  requireAuth,
  requirePermissao("tipos-ocorrencias:manage"),
  async (req, res) => {
    try {
      const [existente] = await db
        .select({ id: textosPadraoOcorrenciasTable.id })
        .from(textosPadraoOcorrenciasTable)
        .where(
          and(
            eq(textosPadraoOcorrenciasTable.id, req.params.id),
            isNull(textosPadraoOcorrenciasTable.deletadoEm)
          )
        )
        .limit(1);
      if (!existente) return res.status(404).json({ error: "Texto padrão não encontrado." });

      await db
        .update(textosPadraoOcorrenciasTable)
        .set({ deletadoEm: new Date(), ativo: false, atualizadoEm: new Date() })
        .where(eq(textosPadraoOcorrenciasTable.id, req.params.id));
      res.status(204).send();
    } catch (err) {
      req.log?.error(err);
      res.status(500).json({ error: "Erro ao remover texto padrão." });
    }
  }
);

// POST /api/textos-padrao/extrair-texto — extrai texto de .md, .docx ou .pdf
router.post(
  "/extrair-texto",
  requireAuth,
  requirePermissao("tipos-ocorrencias:manage"),
  upload.single("arquivo"),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado." });
      const { originalname, buffer, mimetype } = req.file;
      const ext = originalname.split(".").pop()?.toLowerCase();

      let texto = "";

      if (ext === "md" || mimetype === "text/markdown" || mimetype === "text/plain") {
        texto = buffer.toString("utf-8");
      } else if (ext === "docx" || mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        const result = await mammoth.extractRawText({ buffer });
        texto = result.value;
      } else if (ext === "pdf" || mimetype === "application/pdf") {
        const parser = new PDFParse();
        const result = await parser.loadPDF(buffer);
        texto = result.pages.map((p) => p.content).join("\n");
      } else {
        return res.status(400).json({ error: "Formato não suportado. Use .md, .docx ou .pdf." });
      }

      res.json({ texto: texto.trim() });
    } catch (err) {
      req.log?.error(err);
      res.status(500).json({ error: "Erro ao extrair texto do arquivo." });
    }
  }
);

export default router;
