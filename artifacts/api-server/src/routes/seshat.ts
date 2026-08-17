import { Router, Request, Response } from "express";
import {
  db,
  estudantesTable,
  turmasTable,
  turmaTurnosTable,
  cursosTable,
  turnosTable,
  eq,
  isNull,
  and,
  inArray,
  usuariosTable,
  usuariosRolesTable,
  rolesTable,
  usuarioDisciplinasTable,
  disciplinaOfertasTable,
  disciplinasTable,
} from "@workspace/db";
import { descriptografarFoto, verificarIntegridade } from "../lib/crypto.js";
import { requireAuth } from "../lib/auth.js";
import { requirePermissao } from "../lib/permissions.js";

const router = Router();
router.use(requireAuth);

// ─── Tipos internos ───────────────────────────────────────────────────────────

type GrupoSection = {
  turnoNome: string;
  cursoNome: string | null;
  usuarios: {
    id: string;
    nome: string | null;
    fotoUrl: string | null;
    roles: string[];
    disciplinas: string[];
  }[];
};

// ─── Função auxiliar ──────────────────────────────────────────────────────────

async function getUsuariosPorRoles(
  nomes: string[],
  opts: { incluirDisciplinas?: boolean }
): Promise<{ sections: GrupoSection[] }> {
  // 1. Buscar usuários que possuem uma das roles informadas
  const usuariosRows = await db
    .select({
      id:               usuariosTable.id,
      nome:             usuariosTable.nome,
      fotoStorageKey:   usuariosTable.fotoStorageKey,
      fotoDados:        usuariosTable.fotoDados,
      roleName:         rolesTable.nome,
    })
    .from(usuariosTable)
    .innerJoin(usuariosRolesTable, eq(usuariosRolesTable.usuarioId, usuariosTable.id))
    .innerJoin(rolesTable, eq(rolesTable.id, usuariosRolesTable.roleId))
    .where(inArray(rolesTable.nome, nomes));

  // Consolidar por usuário
  const usuarioMap = new Map<string, {
    id: string;
    nome: string | null;
    fotoStorageKey: string | null;
    fotoDados: Buffer | null;
    roles: Set<string>;
  }>();

  for (const row of usuariosRows) {
    if (!usuarioMap.has(row.id)) {
      usuarioMap.set(row.id, {
        id: row.id,
        nome: row.nome,
        fotoStorageKey: row.fotoStorageKey ?? null,
        fotoDados: (row.fotoDados as Buffer | null) ?? null,
        roles: new Set(),
      });
    }
    usuarioMap.get(row.id)!.roles.add(row.roleName);
  }

  const usuarioIds = [...usuarioMap.keys()];

  if (usuarioIds.length === 0) {
    return { sections: [] };
  }

  // 2. Para cada usuário, buscar disciplinas (turno/curso)
  type DisciplinaRow = {
    usuarioId: string;
    disciplinaNome: string;
    cursoNome: string | null;
    turnoNome: string | null;
  };

  let disciplinaRows: DisciplinaRow[] = [];

  if (opts.incluirDisciplinas !== false) {
    disciplinaRows = await db
      .select({
        usuarioId:      usuarioDisciplinasTable.usuarioId,
        disciplinaNome: disciplinasTable.nome,
        cursoNome:      cursosTable.nome,
        turnoNome:      turnosTable.nome,
      })
      .from(usuarioDisciplinasTable)
      .innerJoin(disciplinaOfertasTable, eq(disciplinaOfertasTable.id, usuarioDisciplinasTable.disciplinaOfertaId))
      .innerJoin(disciplinasTable, eq(disciplinasTable.id, disciplinaOfertasTable.disciplinaId))
      .innerJoin(cursosTable, eq(cursosTable.id, disciplinaOfertasTable.cursoId))
      .innerJoin(turnosTable, eq(turnosTable.id, disciplinaOfertasTable.turnoId))
      .where(inArray(usuarioDisciplinasTable.usuarioId, usuarioIds));
  }

  // Indexar disciplinas por usuário
  const discMap = new Map<string, { disciplinas: Set<string>; turnoNome: string | null; cursoNome: string | null }>();
  for (const d of disciplinaRows) {
    if (!discMap.has(d.usuarioId)) {
      discMap.set(d.usuarioId, { disciplinas: new Set(), turnoNome: d.turnoNome, cursoNome: d.cursoNome });
    }
    discMap.get(d.usuarioId)!.disciplinas.add(d.disciplinaNome);
  }

  // 3. Agrupar por turnoNome+cursoNome
  const sectionKey = (turnoNome: string, cursoNome: string | null) =>
    `${turnoNome}||${cursoNome ?? ""}`;

  const sectionMap = new Map<string, GrupoSection>();

  for (const u of usuarioMap.values()) {
    const disc = discMap.get(u.id);
    const turnoNome = disc?.turnoNome ?? "Sem turno específico";
    const cursoNome = disc?.cursoNome ?? null;
    const key = sectionKey(turnoNome, cursoNome);

    if (!sectionMap.has(key)) {
      sectionMap.set(key, { turnoNome, cursoNome, usuarios: [] });
    }

    const fotoUrl =
      u.fotoStorageKey && u.fotoDados
        ? `/api/usuarios/${u.id}/foto`
        : null;

    sectionMap.get(key)!.usuarios.push({
      id: u.id,
      nome: u.nome,
      fotoUrl,
      roles: [...u.roles],
      disciplinas: disc ? [...disc.disciplinas] : [],
    });
  }

  const sections = [...sectionMap.values()].sort((a, b) =>
    a.turnoNome.localeCompare(b.turnoNome)
  );

  return { sections };
}

// ─── Novos endpoints ──────────────────────────────────────────────────────────

// GET /api/carometro/equipe-gestora
router.get("/equipe-gestora", requirePermissao("carometro:view"), async (_req: Request, res: Response) => {
  try {
    const result = await getUsuariosPorRoles(["equipe_gestora"], { incluirDisciplinas: true });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao carregar equipe gestora" });
  }
});

// GET /api/carometro/administracao
router.get("/administracao", requirePermissao("carometro:view"), async (_req: Request, res: Response) => {
  try {
    const result = await getUsuariosPorRoles(["secretaria", "administracao"], { incluirDisciplinas: true });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao carregar administração" });
  }
});

// GET /api/carometro/equipe-pedagogica
router.get("/equipe-pedagogica", requirePermissao("carometro:view"), async (_req: Request, res: Response) => {
  try {
    const result = await getUsuariosPorRoles(["coordenador", "soe", "aee", "supervisao_pedagogica"], { incluirDisciplinas: true });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao carregar equipe pedagógica" });
  }
});

// GET /api/carometro/corpo-docente
router.get("/corpo-docente", requirePermissao("carometro:view"), async (_req: Request, res: Response) => {
  try {
    const result = await getUsuariosPorRoles(["professor", "educador"], { incluirDisciplinas: true });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao carregar corpo docente" });
  }
});

// GET /api/carometro/apoio-operacional
router.get("/apoio-operacional", requirePermissao("carometro:view"), async (_req: Request, res: Response) => {
  try {
    const result = await getUsuariosPorRoles(["inspetor", "limpeza", "portaria", "merendeira", "seguranca"], { incluirDisciplinas: true });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao carregar apoio operacional" });
  }
});

// GET /api/carometro/usuarios — pai_responsavel e estudante
router.get("/usuarios", requirePermissao("carometro:view"), async (_req: Request, res: Response) => {
  try {
    const result = await getUsuariosPorRoles(["pai_responsavel", "estudante"], { incluirDisciplinas: true });

    // Diferenciar pai_responsavel (vinculados: []) de estudante (sem campo extra)
    const sections = result.sections.map((section) => ({
      ...section,
      usuarios: section.usuarios.map((u) => {
        if (u.roles.includes("pai_responsavel")) {
          return { ...u, vinculados: [] };
        }
        return u;
      }),
    }));

    res.json({ sections });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao carregar usuários" });
  }
});

// ─── GET / existente (estudantes) ─────────────────────────────────────────────

// GET /api/carometro — retorna CarometroGroup[] agrupado por turma
// Filtros: ?turmaId=uuid&cursoId=uuid&turnoId=uuid&busca=texto
router.get("/", requirePermissao("carometro:view"), async (req: Request, res: Response) => {
  try {
    const { turmaId, cursoId, turnoId, busca } = req.query;

    const condicoes = [isNull(estudantesTable.deletadoEm)];
    if (turmaId) condicoes.push(eq(estudantesTable.turmaId, turmaId as string));
    if (cursoId) condicoes.push(eq(turmasTable.cursoId, cursoId as string));
    if (turnoId) condicoes.push(eq(turmaTurnosTable.turnoId, turnoId as string));

    const rows = await db
      .select({
        id:              estudantesTable.id,
        nome:            estudantesTable.nome,
        registro:        estudantesTable.registro,
        dataNascimento:  estudantesTable.dataNascimento,
        turmaId:         estudantesTable.turmaId,
        turmaSigla:      turmasTable.sigla,
        turmaDescricao:  turmasTable.descricao,
        cursoId:         cursosTable.id,
        cursoNome:       cursosTable.nome,
        turnoId:         turnosTable.id,
        turnoNome:       turnosTable.nome,
        fotoDados:           estudantesTable.fotoDados,
        fotoIv:              estudantesTable.fotoIv,
        fotoMimeType:        estudantesTable.fotoMimeType,
        fotoHashIntegridade: estudantesTable.fotoHashIntegridade,
        fotoStorageKey:      estudantesTable.fotoStorageKey,
      })
      .from(estudantesTable)
      .leftJoin(turmasTable,      eq(estudantesTable.turmaId,  turmasTable.id))
      .leftJoin(cursosTable,      eq(turmasTable.cursoId,      cursosTable.id))
      .leftJoin(turmaTurnosTable, eq(turmaTurnosTable.turmaId, estudantesTable.turmaId))
      .leftJoin(turnosTable,      eq(turmaTurnosTable.turnoId, turnosTable.id))
      .where(and(...condicoes))
      .orderBy(turnosTable.nome, cursosTable.nome, turmasTable.sigla, estudantesTable.nome);

    // Filtro de busca em memória
    const filtrados = busca
      ? rows.filter((r) =>
          r.nome.toLowerCase().includes((busca as string).toLowerCase()) ||
          r.registro.includes(busca as string)
        )
      : rows;

    // Descriptografar fotos e agrupar por turma
    // (JOIN com turmaTurnosTable pode gerar linhas duplicadas por estudante se turma tiver N turnos)
    const turmaMap = new Map<string, {
      turmaId: string; turmaSigla: string; turmaDescricao: string;
      cursoId: string; cursoNome: string;
      turnoId: string; turnoNome: string;
      estudantes: Map<string, { id: string; nome: string; registro: string; dataNascimento: string | null; fotoUrl: string | null }>;
    }>();

    for (const r of filtrados) {
      const tid = r.turmaId;
      if (!turmaMap.has(tid)) {
        turmaMap.set(tid, {
          turmaId:        tid,
          turmaSigla:     r.turmaSigla ?? "",
          turmaDescricao: r.turmaDescricao ?? "",
          cursoId:        r.cursoId ?? "",
          cursoNome:      r.cursoNome ?? "",
          turnoId:        r.turnoId ?? "",
          turnoNome:      r.turnoNome ?? "",
          estudantes:     new Map(),
        });
      }

      const grupo = turmaMap.get(tid)!;

      // Deduplica estudante por id (pode aparecer N vezes se turma tem N turnos)
      if (!grupo.estudantes.has(r.id)) {
        let fotoUrl: string | null = null;
        if (r.fotoDados && r.fotoIv) {
          try {
            const dadosBrutos = descriptografarFoto(r.fotoDados, r.fotoIv);
            if (!r.fotoHashIntegridade || verificarIntegridade(dadosBrutos, r.fotoHashIntegridade)) {
              fotoUrl = `data:${r.fotoMimeType ?? "image/jpeg"};base64,${dadosBrutos.toString("base64")}`;
            }
          } catch {
            // foto corrompida — incluir estudante sem foto
          }
        }
        grupo.estudantes.set(r.id, { id: r.id, nome: r.nome, registro: r.registro, dataNascimento: r.dataNascimento, fotoUrl });
      }
    }

    const groups = [...turmaMap.values()]
      .sort((a, b) => a.turnoNome.localeCompare(b.turnoNome) || a.cursoNome.localeCompare(b.cursoNome) || a.turmaSigla.localeCompare(b.turmaSigla))
      .map((g) => ({ ...g, estudantes: [...g.estudantes.values()] }));
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao carregar carômetro" });
  }
});

export default router;
