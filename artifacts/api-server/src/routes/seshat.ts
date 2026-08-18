import { Router, Request, Response } from "express";
import { createHash, createDecipheriv } from "crypto";
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

// ─── Tipo retornado pelos endpoints de grupo (alinhado com o frontend) ────────

type UsuarioCardAPI = {
  id: string;
  nome: string | null;
  email: string;
  fotoUrl: string | null;
  codigoAcesso: string;
  roles: { id: string; nome: string }[];
  ofertas: {
    ofertaId: string;
    disciplinaId: string;
    disciplinaNome: string;
    cursoId: string;
    cursoNome: string;
    turnoId: string;
    turnoNome: string;
  }[];
};

// ─── Função auxiliar ──────────────────────────────────────────────────────────

function decryptEmail(encrypted: string, secret: string): string {
  try {
    const key = createHash("sha256").update(secret).digest();
    const [ivHex, encHex] = encrypted.split(":");
    if (!ivHex || !encHex) return "";
    const decipher = createDecipheriv("aes-256-cbc", key, Buffer.from(ivHex, "hex"));
    return Buffer.concat([decipher.update(Buffer.from(encHex, "hex")), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

async function getUsuariosPorRoles(nomes: string[]): Promise<UsuarioCardAPI[]> {
  const secret = process.env["SESSION_SECRET"] ?? "default-dev-secret-change-in-production";

  // 1. Buscar usuários com as roles informadas
  const usuariosRows = await db
    .select({
      id:               usuariosTable.id,
      nome:             usuariosTable.nome,
      emailEncrypted:   usuariosTable.emailEncrypted,
      codigoAcesso:     usuariosTable.codigoAcesso,
      fotoStorageKey:   usuariosTable.fotoStorageKey,
      fotoDados:        usuariosTable.fotoDados,
      roleId:           rolesTable.id,
      roleName:         rolesTable.nome,
    })
    .from(usuariosTable)
    .innerJoin(usuariosRolesTable, eq(usuariosRolesTable.usuarioId, usuariosTable.id))
    .innerJoin(rolesTable, eq(rolesTable.id, usuariosRolesTable.roleId))
    .where(inArray(rolesTable.nome, nomes));

  // Consolidar por usuário
  const usuarioMap = new Map<string, {
    id: string; nome: string | null; email: string; codigoAcesso: string;
    fotoStorageKey: string | null; fotoDados: Buffer | null;
    roles: Map<string, string>; // id → nome
  }>();

  for (const row of usuariosRows) {
    if (!usuarioMap.has(row.id)) {
      usuarioMap.set(row.id, {
        id: row.id, nome: row.nome,
        email: decryptEmail(row.emailEncrypted, secret),
        codigoAcesso: row.codigoAcesso,
        fotoStorageKey: row.fotoStorageKey ?? null,
        fotoDados: (row.fotoDados as Buffer | null) ?? null,
        roles: new Map(),
      });
    }
    usuarioMap.get(row.id)!.roles.set(row.roleId, row.roleName);
  }

  const usuarioIds = [...usuarioMap.keys()];
  if (usuarioIds.length === 0) return [];

  // 2. Buscar ofertas (disciplina/curso/turno) de cada usuário
  const ofertaRows = await db
    .select({
      usuarioId:      usuarioDisciplinasTable.usuarioId,
      ofertaId:       disciplinaOfertasTable.id,
      disciplinaId:   disciplinasTable.id,
      disciplinaNome: disciplinasTable.nome,
      cursoId:        cursosTable.id,
      cursoNome:      cursosTable.nome,
      turnoId:        turnosTable.id,
      turnoNome:      turnosTable.nome,
    })
    .from(usuarioDisciplinasTable)
    .innerJoin(disciplinaOfertasTable, eq(disciplinaOfertasTable.id, usuarioDisciplinasTable.disciplinaOfertaId))
    .innerJoin(disciplinasTable, eq(disciplinasTable.id, disciplinaOfertasTable.disciplinaId))
    .innerJoin(cursosTable, eq(cursosTable.id, disciplinaOfertasTable.cursoId))
    .innerJoin(turnosTable, eq(turnosTable.id, disciplinaOfertasTable.turnoId))
    .where(inArray(usuarioDisciplinasTable.usuarioId, usuarioIds));

  // Indexar ofertas por usuário
  const ofertaMap = new Map<string, UsuarioCardAPI["ofertas"]>();
  for (const o of ofertaRows) {
    if (!ofertaMap.has(o.usuarioId)) ofertaMap.set(o.usuarioId, []);
    ofertaMap.get(o.usuarioId)!.push({
      ofertaId: o.ofertaId,
      disciplinaId: o.disciplinaId,
      disciplinaNome: o.disciplinaNome,
      cursoId: o.cursoId,
      cursoNome: o.cursoNome,
      turnoId: o.turnoId,
      turnoNome: o.turnoNome,
    });
  }

  // 3. Montar UsuarioCardAPI[]
  return [...usuarioMap.values()].map((u) => ({
    id: u.id,
    nome: u.nome,
    email: u.email,
    codigoAcesso: u.codigoAcesso,
    fotoUrl: u.fotoStorageKey && u.fotoDados ? `/api/usuarios/${u.id}/foto` : null,
    roles: [...u.roles.entries()].map(([id, nome]) => ({ id, nome })),
    ofertas: ofertaMap.get(u.id) ?? [],
  }));
}

// ─── Novos endpoints ──────────────────────────────────────────────────────────

// GET /api/carometro/equipe-gestora
router.get("/equipe-gestora", requirePermissao("carometro:view"), async (_req: Request, res: Response) => {
  try {
    res.json(await getUsuariosPorRoles(["equipe_gestora"]));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao carregar equipe gestora" });
  }
});

// GET /api/carometro/administracao
router.get("/administracao", requirePermissao("carometro:view"), async (_req: Request, res: Response) => {
  try {
    res.json(await getUsuariosPorRoles(["secretaria", "administracao"]));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao carregar administração" });
  }
});

// GET /api/carometro/equipe-pedagogica
router.get("/equipe-pedagogica", requirePermissao("carometro:view"), async (_req: Request, res: Response) => {
  try {
    res.json(await getUsuariosPorRoles(["coordenador", "soe", "aee", "supervisao_pedagogica"]));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao carregar equipe pedagógica" });
  }
});

// GET /api/carometro/corpo-docente
router.get("/corpo-docente", requirePermissao("carometro:view"), async (_req: Request, res: Response) => {
  try {
    res.json(await getUsuariosPorRoles(["professor", "educador"]));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao carregar corpo docente" });
  }
});

// GET /api/carometro/apoio-operacional
router.get("/apoio-operacional", requirePermissao("carometro:view"), async (_req: Request, res: Response) => {
  try {
    res.json(await getUsuariosPorRoles(["inspetor", "limpeza", "portaria", "merendeira", "seguranca"]));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao carregar apoio operacional" });
  }
});

// GET /api/carometro/usuarios — pai_responsavel e estudante
router.get("/usuarios", requirePermissao("carometro:view"), async (_req: Request, res: Response) => {
  try {
    res.json(await getUsuariosPorRoles(["pai_responsavel", "estudante"]));
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
