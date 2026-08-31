import { Router } from "express";
import { z } from "zod";
import {
  db,
  calendarioSemestresTable,
  calendarioDiasTable,
  eq, and, sql,
} from "@workspace/db";
import { requireAuth } from "../lib/auth.js";
import { requirePermissao } from "../lib/permissions.js";
import { getCor, getIcone } from "../lib/calendario-categorias.js";
import { CALENDARIO_SEEDF_2026, SEMESTRES_SEEDF_2026 } from "../lib/seedf-2026.js";

const router = Router();
router.use(requireAuth);

const MESES_PT = [
  "", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

// GET /api/calendario?ano=2026
router.get("/", async (req, res) => {
  try {
    const ano = Number(req.query.ano ?? new Date().getFullYear());
    if (isNaN(ano) || ano < 2020 || ano > 2100) {
      return res.status(400).json({ error: "Ano inválido." });
    }

    const semestres = await db
      .select()
      .from(calendarioSemestresTable)
      .where(eq(calendarioSemestresTable.ano, ano));

    const dias = await db
      .select()
      .from(calendarioDiasTable)
      .where(sql`EXTRACT(year FROM ${calendarioDiasTable.data})::integer = ${ano}`)
      .orderBy(calendarioDiasTable.data);

    // Agrupar por mês
    const porMes: Record<number, typeof dias> = {};
    for (const dia of dias) {
      const mes = new Date(dia.data + "T12:00:00").getMonth() + 1;
      if (!porMes[mes]) porMes[mes] = [];
      porMes[mes].push(dia);
    }

    // Montar estrutura de meses
    const meses = [];
    for (let mes = 1; mes <= 12; mes++) {
      const diasDoMes = porMes[mes] ?? [];

      // Agrupar eventos por data
      const porData: Record<string, typeof dias> = {};
      for (const d of diasDoMes) {
        const key = d.data as string;
        if (!porData[key]) porData[key] = [];
        porData[key].push(d);
      }

      // Gerar todos os dias do mês
      const diasMes = [];
      const totalDias = new Date(ano, mes, 0).getDate();
      for (let d = 1; d <= totalDias; d++) {
        const dataStr = `${ano}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const diaSemana = new Date(dataStr + "T12:00:00").getDay();
        const eventos = (porData[dataStr] ?? []).map((e) => ({
          id: e.id,
          categoria: e.categoria,
          titulo: e.titulo ?? null,
          descricao: e.descricao ?? null,
          cor: getCor(e.categoria, e.corOverride),
          icone: getIcone(e.categoria, e.icone),
          iconeOverride: e.icone ?? null,   // valor bruto — null = usa padrão da categoria
        }));
        diasMes.push({ data: dataStr, diaSemana, eventos });
      }

      meses.push({ mes, mesNome: MESES_PT[mes], dias: diasMes });
    }

    res.json({
      ano,
      semestres: semestres.map((s) => ({
        semestre: s.semestre,
        inicio: s.inicio,
        fim: s.fim,
      })),
      meses,
    });
  } catch (err) {
    req.log?.error(err);
    res.status(500).json({ error: "Erro ao buscar calendário." });
  }
});

// GET /api/calendario/semestres?ano=2026
router.get("/semestres", async (req, res) => {
  try {
    const ano = Number(req.query.ano ?? new Date().getFullYear());
    const semestres = await db
      .select()
      .from(calendarioSemestresTable)
      .where(eq(calendarioSemestresTable.ano, ano));
    res.json(semestres);
  } catch (err) {
    req.log?.error(err);
    res.status(500).json({ error: "Erro ao buscar semestres." });
  }
});

// PUT /api/calendario/semestres
router.put("/semestres", requirePermissao("calendario:manage"), async (req, res) => {
  try {
    const schema = z.object({
      ano: z.number().int().min(2020).max(2100),
      semestre: z.union([z.literal(1), z.literal(2)]),
      inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    });
    const body = schema.parse(req.body);

    const [row] = await db
      .insert(calendarioSemestresTable)
      .values({
        ano: body.ano,
        semestre: body.semestre,
        inicio: body.inicio,
        fim: body.fim,
      })
      .onConflictDoUpdate({
        target: [calendarioSemestresTable.ano, calendarioSemestresTable.semestre],
        set: { inicio: body.inicio, fim: body.fim, atualizadoEm: new Date() },
      })
      .returning();

    res.json(row);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    req.log?.error(err);
    res.status(500).json({ error: "Erro ao salvar semestre." });
  }
});

// POST /api/calendario/dias — criar evento(s)
router.post("/dias", requirePermissao("calendario:manage"), async (req, res) => {
  try {
    const schema = z.object({
      datas: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1),
      categoria: z.string().min(1),
      titulo: z.string().max(200).nullable().optional(),
      descricao: z.string().nullable().optional(),
      corOverride: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
      icone: z.string().max(10).nullable().optional(),
    });
    const body = schema.parse(req.body);

    const userId = (req as any).userId as string;
    const rows = await db
      .insert(calendarioDiasTable)
      .values(
        body.datas.map((data) => ({
          data,
          categoria: body.categoria,
          titulo: body.titulo ?? null,
          descricao: body.descricao ?? null,
          corOverride: body.corOverride ?? null,
          icone: body.icone ?? null,
          criadoPor: userId,
        }))
      )
      .returning();

    res.status(201).json({ criados: rows.length, ids: rows.map((r) => r.id) });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    req.log?.error(err);
    res.status(500).json({ error: "Erro ao criar eventos." });
  }
});

// PUT /api/calendario/dias/:id
router.put("/dias/:id", requirePermissao("calendario:manage"), async (req, res) => {
  try {
    const schema = z.object({
      categoria: z.string().min(1).optional(),
      titulo: z.string().max(200).nullable().optional(),
      descricao: z.string().nullable().optional(),
      corOverride: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
      icone: z.string().max(10).nullable().optional(),
    });
    const body = schema.parse(req.body);

    const [row] = await db
      .update(calendarioDiasTable)
      .set({ ...body, atualizadoEm: new Date() })
      .where(eq(calendarioDiasTable.id, req.params.id))
      .returning();

    if (!row) return res.status(404).json({ error: "Evento não encontrado." });
    res.json(row);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    req.log?.error(err);
    res.status(500).json({ error: "Erro ao atualizar evento." });
  }
});

// DELETE /api/calendario/dias/:id
router.delete("/dias/:id", requirePermissao("calendario:manage"), async (req, res) => {
  try {
    const [row] = await db
      .delete(calendarioDiasTable)
      .where(eq(calendarioDiasTable.id, req.params.id))
      .returning({ id: calendarioDiasTable.id });
    if (!row) return res.status(404).json({ error: "Evento não encontrado." });
    res.json({ ok: true });
  } catch (err) {
    req.log?.error(err);
    res.status(500).json({ error: "Erro ao excluir evento." });
  }
});

// POST /api/calendario/importar-seedf
router.post("/importar-seedf", requirePermissao("calendario:manage"), async (req, res) => {
  try {
    const schema = z.object({ ano: z.number().int().min(2020).max(2100) });
    const { ano } = schema.parse(req.body);

    if (ano !== 2026) {
      return res.status(400).json({ error: "Apenas o ano 2026 está disponível para importação SEEDF." });
    }

    // Importar semestres
    for (const s of SEMESTRES_SEEDF_2026) {
      await db
        .insert(calendarioSemestresTable)
        .values({ ano, semestre: s.semestre, inicio: s.inicio, fim: s.fim })
        .onConflictDoUpdate({
          target: [calendarioSemestresTable.ano, calendarioSemestresTable.semestre],
          set: { inicio: s.inicio, fim: s.fim, atualizadoEm: new Date() },
        });
    }

    // Importar dias: upsert por (data, categoria, titulo)
    let importados = 0;
    let atualizados = 0;

    for (const d of CALENDARIO_SEEDF_2026) {
      const existing = await db
        .select({ id: calendarioDiasTable.id })
        .from(calendarioDiasTable)
        .where(
          and(
            eq(calendarioDiasTable.data, d.data),
            eq(calendarioDiasTable.categoria, d.categoria),
            eq(sql`COALESCE(${calendarioDiasTable.titulo}, '')`, d.titulo ?? "")
          )
        )
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(calendarioDiasTable)
          .set({
            descricao: d.descricao ?? null,
            atualizadoEm: new Date(),
          })
          .where(eq(calendarioDiasTable.id, existing[0].id));
        atualizados++;
      } else {
        await db.insert(calendarioDiasTable).values({
          data: d.data,
          categoria: d.categoria,
          titulo: d.titulo ?? null,
          descricao: d.descricao ?? null,
        });
        importados++;
      }
    }

    // Resumo por categoria para o preview
    const resumo: Record<string, number> = {};
    for (const d of CALENDARIO_SEEDF_2026) {
      resumo[d.categoria] = (resumo[d.categoria] ?? 0) + 1;
    }

    res.json({
      ok: true,
      importados,
      atualizados,
      semestresConfigurados: SEMESTRES_SEEDF_2026.length,
      resumo,
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    req.log?.error(err);
    res.status(500).json({ error: "Erro ao importar calendário SEEDF." });
  }
});

export default router;
