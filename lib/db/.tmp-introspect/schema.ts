import { pgTable, index, foreignKey, check, uuid, varchar, boolean, text, timestamp, unique, char, smallint, date, jsonb, integer, primaryKey, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const baseLegalLgpd = pgEnum("base_legal_lgpd", ['consentimento', 'obrigacao_legal', 'politicas_publicas', 'pesquisa', 'contrato', 'exercicio_regular', 'protecao_vida', 'tutela_saude', 'interesse_legitimo', 'protecao_credito'])
export const operacaoAuditoria = pgEnum("operacao_auditoria", ['INSERT', 'UPDATE', 'DELETE', 'SELECT', 'SELECT_SENSITIVE'])
export const statusOcorrencia = pgEnum("status_ocorrencia", ['ativo', 'inativo'])
export const statusSolicitacaoLgpd = pgEnum("status_solicitacao_lgpd", ['pendente', 'em_analise', 'concluido', 'negado', 'cancelado'])
export const tipoSolicitacaoLgpd = pgEnum("tipo_solicitacao_lgpd", ['acesso', 'correcao', 'exclusao', 'portabilidade', 'oposicao', 'anonimizacao', 'revogacao_consentimento'])


export const estudanteEmails = pgTable("estudante_emails", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	estudanteId: uuid("estudante_id").notNull(),
	email: varchar({ length: 254 }).notNull(),
	tipo: varchar({ length: 20 }).notNull(),
}, (table) => [
	index("idx_ee_estudante_id").using("btree", table.estudanteId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.estudanteId],
			foreignColumns: [estudantes.id],
			name: "estudante_emails_estudante_id_fkey"
		}).onDelete("cascade"),
	check("chk_estudante_emails_tipo", sql`(tipo)::text = ANY ((ARRAY['proprio'::character varying, 'responsavel'::character varying])::text[])`),
]);

export const consentimentosLgpd = pgTable("consentimentos_lgpd", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	usuarioId: uuid("usuario_id").notNull(),
	finalidade: varchar({ length: 200 }).notNull(),
	versaoPolitica: varchar("versao_politica", { length: 20 }).notNull(),
	consentido: boolean().notNull(),
	ipOrigem: varchar("ip_origem", { length: 45 }),
	userAgent: text("user_agent"),
	consentidoEm: timestamp("consentido_em", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	revogadoEm: timestamp("revogado_em", { withTimezone: true, mode: 'string' }),
	baseLegal: baseLegalLgpd("base_legal").notNull(),
	revogadoMotivo: text("revogado_motivo"),
}, (table) => [
	index("idx_cl_finalidade").using("btree", table.finalidade.asc().nullsLast().op("text_ops"), table.consentido.asc().nullsLast().op("text_ops")),
	index("idx_cl_usuario_id").using("btree", table.usuarioId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.usuarioId],
			foreignColumns: [usuarios.id],
			name: "consentimentos_lgpd_usuario_id_fkey"
		}).onDelete("restrict"),
]);

export const tokensSessao = pgTable("tokens_sessao", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	usuarioId: uuid("usuario_id").notNull(),
	tokenHash: char("token_hash", { length: 64 }).notNull(),
	expiraEm: timestamp("expira_em", { withTimezone: true, mode: 'string' }).notNull(),
	revogado: boolean().default(false).notNull(),
	ipOrigem: varchar("ip_origem", { length: 45 }),
	criadoEm: timestamp("criado_em", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	userAgent: text("user_agent"),
}, (table) => [
	index("idx_tokens_ativos").using("btree", table.usuarioId.asc().nullsLast().op("timestamptz_ops"), table.expiraEm.asc().nullsLast().op("timestamptz_ops")).where(sql`(revogado = false)`),
	foreignKey({
			columns: [table.usuarioId],
			foreignColumns: [usuarios.id],
			name: "tokens_sessao_usuario_id_fkey"
		}).onDelete("cascade"),
	unique("tokens_sessao_token_hash_key").on(table.tokenHash),
]);

export const tiposOcorrencias = pgTable("tipos_ocorrencias", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	descricao: varchar({ length: 200 }).notNull(),
	status: statusOcorrencia().default('ativo').notNull(),
	criadoEm: timestamp("criado_em", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	atualizadoEm: timestamp("atualizado_em", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_to_status").using("btree", table.status.asc().nullsLast().op("enum_ops")),
	unique("uq_tipos_ocorrencias_descricao").on(table.descricao),
]);

export const disciplinaOfertas = pgTable("disciplina_ofertas", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	disciplinaId: uuid("disciplina_id").notNull(),
	cursoId: uuid("curso_id").notNull(),
	turnoId: uuid("turno_id").notNull(),
	ativo: boolean().default(true).notNull(),
	criadoEm: timestamp("criado_em", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_do_curso_id").using("btree", table.cursoId.asc().nullsLast().op("uuid_ops")),
	index("idx_do_disciplina_id").using("btree", table.disciplinaId.asc().nullsLast().op("uuid_ops")),
	index("idx_do_turno_id").using("btree", table.turnoId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.cursoId],
			foreignColumns: [cursos.id],
			name: "disciplina_ofertas_curso_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.disciplinaId],
			foreignColumns: [disciplinas.id],
			name: "disciplina_ofertas_disciplina_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.turnoId],
			foreignColumns: [turnos.id],
			name: "disciplina_ofertas_turno_id_fkey"
		}).onDelete("cascade"),
	unique("uq_disciplina_oferta").on(table.disciplinaId, table.cursoId, table.turnoId),
]);

export const cursos = pgTable("cursos", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	nome: varchar({ length: 150 }).notNull(),
	criadoEm: timestamp("criado_em", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	atualizadoEm: timestamp("atualizado_em", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	descricao: text(),
	ativo: boolean().default(true).notNull(),
	deletadoEm: timestamp("deletado_em", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_cursos_ativo").using("btree", table.ativo.asc().nullsLast().op("bool_ops")).where(sql`(deletado_em IS NULL)`),
	unique("uq_cursos_nome").on(table.nome),
]);

export const turnos = pgTable("turnos", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	nome: varchar({ length: 30 }).notNull(),
	criadoEm: timestamp("criado_em", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("uq_turnos_nome").on(table.nome),
]);

export const disciplinas = pgTable("disciplinas", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	nome: varchar({ length: 150 }).notNull(),
	criadoEm: timestamp("criado_em", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	atualizadoEm: timestamp("atualizado_em", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const usuarios = pgTable("usuarios", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	// TODO: failed to parse database type 'bytea'
	emailEncrypted: unknown("email_encrypted").notNull(),
	senhaHash: varchar("senha_hash", { length: 255 }).notNull(),
	codigoAcesso: varchar("codigo_acesso", { length: 20 }).notNull(),
	primeiroAcesso: boolean("primeiro_acesso").default(true).notNull(),
	criadoEm: timestamp("criado_em", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	fotoUrl: text("foto_url"),
	nome: varchar({ length: 120 }),
	atualizadoEm: timestamp("atualizado_em", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletadoEm: timestamp("deletado_em", { withTimezone: true, mode: 'string' }),
	emailHash: char("email_hash", { length: 64 }).notNull(),
	emailVerificado: boolean("email_verificado").default(false).notNull(),
	tentativasLoginFalhas: smallint("tentativas_login_falhas").default(0).notNull(),
	bloqueadoAte: timestamp("bloqueado_ate", { withTimezone: true, mode: 'string' }),
	ultimoLoginEm: timestamp("ultimo_login_em", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_usuarios_ativo").using("btree", table.deletadoEm.asc().nullsLast().op("timestamptz_ops")).where(sql`(deletado_em IS NULL)`),
	index("idx_usuarios_bloqueado").using("btree", table.bloqueadoAte.asc().nullsLast().op("timestamptz_ops")).where(sql`(bloqueado_ate IS NOT NULL)`),
	unique("usuarios_codigo_acesso_unique").on(table.codigoAcesso),
	unique("uq_usuarios_email_hash").on(table.emailHash),
]);

export const estudanteNecessidadesEspeciais = pgTable("estudante_necessidades_especiais", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	estudanteId: uuid("estudante_id").notNull(),
	tipo: varchar({ length: 100 }).notNull(),
	descricao: text(),
	laudoReferencia: varchar("laudo_referencia", { length: 200 }),
	ativo: boolean().default(true).notNull(),
	registradoEm: timestamp("registrado_em", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	registradoPor: uuid("registrado_por").notNull(),
	atualizadoEm: timestamp("atualizado_em", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_ane_estudante_id").using("btree", table.estudanteId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.estudanteId],
			foreignColumns: [estudantes.id],
			name: "fk_ane_estudante"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.registradoPor],
			foreignColumns: [usuarios.id],
			name: "fk_ane_registrado_por"
		}).onDelete("restrict"),
]);

export const ocorrencias = pgTable("ocorrencias", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	estudanteId: uuid("estudante_id").notNull(),
	tipoOcorrenciaId: uuid("tipo_ocorrencia_id").notNull(),
	disciplinaId: uuid("disciplina_id"),
	dataOcorrencia: date("data_ocorrencia").notNull(),
	observacao: varchar({ length: 2000 }),
	criadoEm: timestamp("criado_em", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	registradoPorId: uuid("registrado_por_id"),
	atualizadoEm: timestamp("atualizado_em", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletadoEm: timestamp("deletado_em", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_oc_data").using("btree", table.dataOcorrencia.desc().nullsFirst().op("date_ops")),
	index("idx_oc_deletado").using("btree", table.deletadoEm.asc().nullsLast().op("timestamptz_ops")).where(sql`(deletado_em IS NULL)`),
	index("idx_oc_disciplina").using("btree", table.disciplinaId.asc().nullsLast().op("uuid_ops")).where(sql`(disciplina_id IS NOT NULL)`),
	index("idx_oc_estudante_data").using("btree", table.estudanteId.asc().nullsLast().op("uuid_ops"), table.dataOcorrencia.desc().nullsFirst().op("uuid_ops")),
	index("idx_oc_registrador").using("btree", table.registradoPorId.asc().nullsLast().op("uuid_ops")).where(sql`(registrado_por_id IS NOT NULL)`),
	index("idx_oc_tipo").using("btree", table.tipoOcorrenciaId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.disciplinaId],
			foreignColumns: [disciplinas.id],
			name: "fk_oc_disciplina"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.registradoPorId],
			foreignColumns: [usuarios.id],
			name: "fk_oc_registrador"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.estudanteId],
			foreignColumns: [estudantes.id],
			name: "ocorrencias_estudante_id_estudantes_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.tipoOcorrenciaId],
			foreignColumns: [tiposOcorrencias.id],
			name: "ocorrencias_tipo_ocorrencia_id_tipos_ocorrencias_id_fk"
		}),
]);

export const estudantes = pgTable("estudantes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	nome: varchar({ length: 120 }).notNull(),
	registro: varchar({ length: 20 }).notNull(),
	fotoUrl: varchar("foto_url", { length: 500 }),
	observacao: varchar({ length: 2000 }),
	turmaId: uuid("turma_id").notNull(),
	criadoEm: timestamp("criado_em", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	atualizadoEm: timestamp("atualizado_em", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletadoEm: timestamp("deletado_em", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_estudantes_ativo").using("btree", table.deletadoEm.asc().nullsLast().op("timestamptz_ops")).where(sql`(deletado_em IS NULL)`),
	index("idx_estudantes_nome_trgm").using("gin", table.nome.asc().nullsLast().op("gin_trgm_ops")),
	index("idx_estudantes_turma_id").using("btree", table.turmaId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.turmaId],
			foreignColumns: [turmas.id],
			name: "estudantes_turma_id_turmas_id_fk"
		}),
	unique("uq_estudantes_registro").on(table.registro),
]);

export const turmas = pgTable("turmas", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	sigla: char({ length: 10 }).notNull(),
	descricao: varchar({ length: 200 }).notNull(),
	cursoId: uuid("curso_id").notNull(),
	turnoId: uuid("turno_id").notNull(),
	criadoEm: timestamp("criado_em", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	ativo: boolean().default(true).notNull(),
	deletadoEm: timestamp("deletado_em", { withTimezone: true, mode: 'string' }),
	atualizadoEm: timestamp("atualizado_em", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_turmas_ativo").using("btree", table.ativo.asc().nullsLast().op("bool_ops")).where(sql`(deletado_em IS NULL)`),
	index("idx_turmas_turno_id").using("btree", table.turnoId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.cursoId],
			foreignColumns: [cursos.id],
			name: "turmas_curso_id_cursos_id_fk"
		}),
	foreignKey({
			columns: [table.turnoId],
			foreignColumns: [turnos.id],
			name: "turmas_turno_id_turnos_id_fk"
		}),
	unique("uq_turmas_sigla_curso").on(table.sigla, table.cursoId),
]);

export const auditoriaLogs = pgTable("auditoria_logs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	usuarioId: uuid("usuario_id"),
	tabela: varchar({ length: 63 }).notNull(),
	operacao: operacaoAuditoria().notNull(),
	registroId: uuid("registro_id"),
	dadosAntes: jsonb("dados_antes"),
	dadosDepois: jsonb("dados_depois"),
	ipOrigem: varchar("ip_origem", { length: 45 }),
	userAgent: text("user_agent"),
	traceId: varchar("trace_id", { length: 64 }),
	criadoEm: timestamp("criado_em", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	spanId: varchar("span_id", { length: 32 }),
	servicoOrigem: varchar("servico_origem", { length: 100 }),
	ambiente: varchar({ length: 20 }),
	versaoApp: varchar("versao_app", { length: 20 }),
	metodoHttp: char("metodo_http", { length: 7 }),
	endpoint: varchar({ length: 500 }),
	statusHttp: smallint("status_http"),
	duracaoMs: integer("duracao_ms"),
}, (table) => [
	index("idx_al_dados_antes_gin").using("gin", table.dadosAntes.asc().nullsLast().op("jsonb_ops")),
	index("idx_al_registro_id").using("btree", table.registroId.asc().nullsLast().op("uuid_ops")).where(sql`(registro_id IS NOT NULL)`),
	index("idx_al_tabela_operacao").using("btree", table.tabela.asc().nullsLast().op("text_ops"), table.operacao.asc().nullsLast().op("text_ops"), table.criadoEm.desc().nullsFirst().op("text_ops")),
	index("idx_al_trace_id").using("btree", table.traceId.asc().nullsLast().op("text_ops")).where(sql`(trace_id IS NOT NULL)`),
	index("idx_al_usuario_criado").using("btree", table.usuarioId.asc().nullsLast().op("uuid_ops"), table.criadoEm.desc().nullsFirst().op("timestamptz_ops")).where(sql`(usuario_id IS NOT NULL)`),
]);

export const solicitacoesLgpd = pgTable("solicitacoes_lgpd", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	usuarioId: uuid("usuario_id").notNull(),
	tipo: tipoSolicitacaoLgpd().notNull(),
	status: statusSolicitacaoLgpd().default('pendente').notNull(),
	motivo: text(),
	respostaDpo: text("resposta_dpo"),
	prazoLegal: timestamp("prazo_legal", { withTimezone: true, mode: 'string' }),
	concluidoEm: timestamp("concluido_em", { withTimezone: true, mode: 'string' }),
	criadoEm: timestamp("criado_em", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	atualizadoEm: timestamp("atualizado_em", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_sl_prazo").using("btree", table.prazoLegal.asc().nullsLast().op("timestamptz_ops")).where(sql`(prazo_legal IS NOT NULL)`),
	index("idx_sl_usuario_status").using("btree", table.usuarioId.asc().nullsLast().op("uuid_ops"), table.status.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.usuarioId],
			foreignColumns: [usuarios.id],
			name: "fk_sl_usuario"
		}).onDelete("restrict"),
]);

export const roles = pgTable("roles", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	nome: varchar({ length: 80 }).notNull(),
	descricao: text(),
	ativo: boolean().default(true).notNull(),
	criadoEm: timestamp("criado_em", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	atualizadoEm: timestamp("atualizado_em", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("roles_nome_key").on(table.nome),
]);

export const permissoes = pgTable("permissoes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	recurso: varchar({ length: 80 }).notNull(),
	acao: varchar({ length: 50 }).notNull(),
	descricao: text(),
	criadoEm: timestamp("criado_em", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("uq_permissoes_recurso_acao").on(table.recurso, table.acao),
]);

export const usuarioDisciplinas = pgTable("usuario_disciplinas", {
	usuarioId: uuid("usuario_id").notNull(),
	disciplinaOfertaId: uuid("disciplina_oferta_id").notNull(),
	criadoEm: timestamp("criado_em", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.disciplinaOfertaId],
			foreignColumns: [disciplinaOfertas.id],
			name: "usuario_disciplinas_disciplina_oferta_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.usuarioId],
			foreignColumns: [usuarios.id],
			name: "usuario_disciplinas_usuario_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.usuarioId, table.disciplinaOfertaId], name: "usuario_disciplinas_pkey"}),
]);

export const rolesPermissoes = pgTable("roles_permissoes", {
	roleId: uuid("role_id").notNull(),
	permissaoId: uuid("permissao_id").notNull(),
	criadoEm: timestamp("criado_em", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.permissaoId],
			foreignColumns: [permissoes.id],
			name: "roles_permissoes_permissao_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.roleId],
			foreignColumns: [roles.id],
			name: "roles_permissoes_role_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.roleId, table.permissaoId], name: "roles_permissoes_pkey"}),
]);

export const usuariosRoles = pgTable("usuarios_roles", {
	usuarioId: uuid("usuario_id").notNull(),
	roleId: uuid("role_id").notNull(),
	concedidoEm: timestamp("concedido_em", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	concedidoPor: uuid("concedido_por"),
	expiraEm: timestamp("expira_em", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_ur_role_id").using("btree", table.roleId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.roleId],
			foreignColumns: [roles.id],
			name: "usuarios_roles_role_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.usuarioId],
			foreignColumns: [usuarios.id],
			name: "usuarios_roles_usuario_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.usuarioId, table.roleId], name: "usuarios_roles_pkey"}),
]);
