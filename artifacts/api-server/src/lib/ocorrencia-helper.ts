import {
  db, ocorrenciasTable, tiposOcorrenciasTable, estudantesTable,
  estudanteEmailsTable, usuariosTable,
  eq, and,
} from "@workspace/db";
import { registrarAuditoria } from "./audit.js";
import { enviarEmailOcorrencia } from "./mailer.js";

export async function registrarOcorrenciaComEmail(opts: {
  estudanteId: string;
  tipo: "saida-antecipada";
  registradoPorId: string;
  horarioSaida: string;
  tipoCartao: "cartao-semestral" | "diario";
  ip: string;
}): Promise<{ ocorrenciaId: string; emailEnviado: boolean }> {
  // 1. Busca tipo de ocorrência pelo slug
  const [tipoOcorrencia] = await db.select()
    .from(tiposOcorrenciasTable)
    .where(eq(tiposOcorrenciasTable.slug, opts.tipo))
    .limit(1);

  if (!tipoOcorrencia) throw new Error(`Tipo de ocorrência '${opts.tipo}' não encontrado. Execute a migração SQL.`);

  // 2. Insere ocorrência
  const obs = `Saída antecipada via cartão ${opts.tipoCartao === "cartao-semestral" ? "semestral" : "diário"} — horário ${opts.horarioSaida}`;
  const [ocorrencia] = await db.insert(ocorrenciasTable).values({
    estudanteId:      opts.estudanteId,
    tipoOcorrenciaId: tipoOcorrencia.id,
    registradoPorId:  opts.registradoPorId,
    observacao:       obs,
  }).returning({ id: ocorrenciasTable.id });

  // 3. Auditoria (tolerante a falha)
  await registrarAuditoria({
    tabela: "ocorrencias", operacao: "INSERT",
    registroId: ocorrencia.id, usuarioId: opts.registradoPorId,
    ipOrigem: opts.ip, endpoint: "leitura-qr", metodoHttp: "POST", statusHttp: 201,
  }).catch(() => {});

  // 4. Dispara e-mail para responsáveis ou estudante (tolerante a falha)
  let emailEnviado = false;
  try {
    const [estudante] = await db.select({
      dataNascimento: estudantesTable.dataNascimento,
      nome: usuariosTable.nome,
    }).from(estudantesTable)
      .innerJoin(usuariosTable, eq(usuariosTable.id, estudantesTable.usuarioId))
      .where(eq(estudantesTable.id, opts.estudanteId))
      .limit(1);

    if (!estudante) throw new Error("Estudante não encontrado");

    const agora = new Date();
    const nascimento = estudante.dataNascimento ? new Date(estudante.dataNascimento) : null;
    const menor = nascimento
      ? (agora.getFullYear() - nascimento.getFullYear() -
         (agora < new Date(agora.getFullYear(), nascimento.getMonth(), nascimento.getDate()) ? 1 : 0)) < 18
      : false;

    const tipoEmail = menor ? "responsavel" : "proprio";
    const [emailRow] = await db.select({ email: estudanteEmailsTable.email })
      .from(estudanteEmailsTable)
      .where(and(
        eq(estudanteEmailsTable.estudanteId, opts.estudanteId),
        eq(estudanteEmailsTable.tipo, tipoEmail),
      ))
      .limit(1);

    if (emailRow) {
      await enviarEmailOcorrencia({
        para:            emailRow.email,
        estudanteNome:   estudante.nome ?? "Estudante",
        tipoOcorrencia:  tipoOcorrencia.descricao,
        dataOcorrencia:  new Date().toISOString().substring(0, 10),
        observacao:      obs,
      });
      emailEnviado = true;
    }
  } catch { /* tolerante */ }

  return { ocorrenciaId: ocorrencia.id, emailEnviado };
}
