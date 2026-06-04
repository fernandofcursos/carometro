import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth } from "../lib/auth.js";
import { registrarAuditoria } from "../lib/audit.js";

// Fase 3: Rota de LGPD para consentimentos e solicitações de direitos
const router = Router();

// Todos os endpoints exigem autenticação
router.use(requireAuth);

// Fase 3: Schema de validação para consentimento LGPD
// Mapeia as finalidades de uso de dados do carômetro
const consentimentoSchema = z.object({
  // Finalidade do consentimento (ex: "biometric", "analytics", "marketing")
  finalidade: z.string().min(1, "Finalidade obrigatória"),
  // Se o usuário concedeu ou revogou consentimento
  consentido: z.boolean(),
  // Versão da política de privacidade que o usuário aceitou
  versaoPolitica: z.string().default("1.0"),
  // Base legal para o tratamento (Art. 7 LGPD)
  baseLegal: z.enum([
    "consentimento",           // O usuário consentiu
    "obrigacao_legal",         // Lei obriga armazenar (ex: registros escolares)
    "contrato",                // Necessário para cumprir contrato
    "interesse_legitimo",      // Interesse legítimo da instituição
  ]).default("consentimento"),
});

// Fase 3: POST /api/consentimentos — registrar ou atualizar consentimento LGPD
// Requer autenticação (usuário autenticado)
router.post("/consentimentos", async (req: Request, res: Response) => {
  try {
    // Validar payload com Zod
    const parsed = consentimentoSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Dados inválidos",
        issues: parsed.error.issues,
      });
    }

    const { finalidade, consentido, versaoPolitica, baseLegal } = parsed.data;

    // TODO: Buscar consentimento anterior para mesma finalidade
    // const consentimentoAnterior = await db
    //   .select()
    //   .from(consentimentosLgpdTable)
    //   .where(and(
    //     eq(consentimentosLgpdTable.usuarioId, req.usuarioId),
    //     eq(consentimentosLgpdTable.finalidade, finalidade),
    //     isNull(consentimentosLgpdTable.revogadoEm),
    //   ))
    //   .limit(1);

    // TODO: Se houver consentimento anterior, marcá-lo como revogado
    // if (consentimentoAnterior) {
    //   await db.update(consentimentosLgpdTable)
    //     .set({
    //       revogadoEm: new Date(),
    //       revogadoMotivo: "substituído por novo registro",
    //     })
    //     .where(eq(consentimentosLgpdTable.id, consentimentoAnterior.id));
    // }

    // TODO: Inserir novo consentimento no banco
    // const [novoConsentimento] = await db.insert(consentimentosLgpdTable).values({
    //   usuarioId: req.usuarioId,
    //   finalidade,
    //   versaoPolitica,
    //   consentido,
    //   ipOrigem: req.ip,
    //   userAgent: req.headers["user-agent"],
    //   baseLegal,
    // }).returning();

    // Fase 3: Registrar auditoria de consentimento (LGPD Art. 37)
    // Consentimentos são dados sensíveis que DEVEM ser auditados
    await registrarAuditoria({
      tabela: "consentimentos_lgpd",
      operacao: "INSERT",
      usuarioId: req.usuarioId,
      ipOrigem: req.ip,
      endpoint: "POST /api/consentimentos",
      statusHttp: 201,
      metodoHttp: "POST",
    });

    // Retornar consentimento criado
    res.status(201).json({
      message: "Consentimento registrado com sucesso",
      consentimento: {
        // TODO: Retornar dados do banco quando conectar
        finalidade,
        consentido,
        versaoPolitica,
        baseLegal,
        registradoEm: new Date(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    res.status(500).json({ error: message });
  }
});

// Fase 3: Schema para solicitações de direitos LGPD (Art. 18)
// O usuário pode exercer seus direitos de acesso, correção, exclusão, etc
const solicitacaoSchema = z.object({
  // Tipo de solicitação (Art. 18 LGPD)
  tipo: z.enum([
    "acesso",                  // Direito de acessar seus dados (Art. 18 I)
    "correcao",                // Direito de corrigir dados incorretos (Art. 18 III)
    "exclusao",                // Direito ao esquecimento (Art. 18 II)
    "portabilidade",           // Direito à portabilidade (Art. 18 V)
    "oposicao",                // Direito de se opor ao tratamento (Art. 18 VI)
    "anonimizacao",            // Direito à anonimização (Art. 18 IV)
    "revogacao_consentimento", // Revogar consentimento (Art. 8 §4)
  ]),
  // Motivo da solicitação (opcional)
  motivo: z.string().optional(),
});

// Fase 3: POST /api/solicitacoes-lgpd — criar solicitação de direito
// Qualquer usuário autenticado pode fazer uma solicitação de seus direitos
router.post("/solicitacoes-lgpd", async (req: Request, res: Response) => {
  try {
    // Validar payload com Zod
    const parsed = solicitacaoSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Dados inválidos",
        issues: parsed.error.issues,
      });
    }

    const { tipo, motivo } = parsed.data;

    // Fase 3: LGPD Art. 18 §5 — prazo de 15 dias para responder
    // A instituição tem até 15 dias para responder à solicitação
    const dataAtual = new Date();
    const prazoLegal = new Date(dataAtual.getTime() + 15 * 24 * 60 * 60 * 1000);

    // TODO: Inserir solicitação no banco
    // const [solicitacao] = await db.insert(solicitacoesLgpdTable).values({
    //   usuarioId: req.usuarioId,
    //   tipo,
    //   motivo,
    //   prazoLegal,
    //   status: "pendente",
    //   criadoEm: dataAtual,
    // }).returning();

    // Fase 3: Registrar auditoria de solicitação de direito (LGPD Art. 37)
    // Solicitações de direitos são eventos críticos que devem ser auditados
    await registrarAuditoria({
      tabela: "solicitacoes_lgpd",
      operacao: "INSERT",
      usuarioId: req.usuarioId,
      ipOrigem: req.ip,
      endpoint: "POST /api/solicitacoes-lgpd",
      statusHttp: 201,
      metodoHttp: "POST",
    });

    // Retornar solicitação criada
    res.status(201).json({
      message: "Solicitação criada com sucesso",
      solicitacao: {
        // TODO: Retornar dados do banco quando conectar
        tipo,
        motivo,
        status: "pendente",
        prazoLegal,
        criadoEm: dataAtual,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    res.status(500).json({ error: message });
  }
});

// Fase 3: GET /api/consentimentos — listar consentimentos do usuário autenticado
// Mostra histórico completo de consentimentos (ativo e revogados)
router.get("/consentimentos", async (req: Request, res: Response) => {
  try {
    // TODO: Buscar todos os consentimentos do usuário (ativos e revogados)
    // const consentimentos = await db
    //   .select()
    //   .from(consentimentosLgpdTable)
    //   .where(eq(consentimentosLgpdTable.usuarioId, req.usuarioId))
    //   .orderBy(desc(consentimentosLgpdTable.registradoEm));

    // Retornar lista de consentimentos
    res.json({
      message: "Consentimentos do usuário (banco ainda não conectado)",
      consentimentos: [],
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Erro ao listar consentimentos",
    });
  }
});

// Fase 3: GET /api/solicitacoes-lgpd — listar solicitações de direitos do usuário
router.get("/solicitacoes-lgpd", async (req: Request, res: Response) => {
  try {
    // TODO: Buscar solicitações do usuário ordenadas por data
    // const solicitacoes = await db
    //   .select()
    //   .from(solicitacoesLgpdTable)
    //   .where(eq(solicitacoesLgpdTable.usuarioId, req.usuarioId))
    //   .orderBy(desc(solicitacoesLgpdTable.criadoEm));

    // Retornar lista de solicitações
    res.json({
      message: "Solicitações LGPD do usuário (banco ainda não conectado)",
      solicitacoes: [],
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Erro ao listar solicitações",
    });
  }
});

export default router;
