-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TYPE "public"."base_legal_lgpd" AS ENUM('consentimento', 'obrigacao_legal', 'politicas_publicas', 'pesquisa', 'contrato', 'exercicio_regular', 'protecao_vida', 'tutela_saude', 'interesse_legitimo', 'protecao_credito');--> statement-breakpoint
CREATE TYPE "public"."operacao_auditoria" AS ENUM('INSERT', 'UPDATE', 'DELETE', 'SELECT', 'SELECT_SENSITIVE');--> statement-breakpoint
CREATE TYPE "public"."status_ocorrencia" AS ENUM('ativo', 'inativo');--> statement-breakpoint
CREATE TYPE "public"."status_solicitacao_lgpd" AS ENUM('pendente', 'em_analise', 'concluido', 'negado', 'cancelado');--> statement-breakpoint
CREATE TYPE "public"."tipo_solicitacao_lgpd" AS ENUM('acesso', 'correcao', 'exclusao', 'portabilidade', 'oposicao', 'anonimizacao', 'revogacao_consentimento');--> statement-breakpoint
CREATE TABLE "estudante_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"estudante_id" uuid NOT NULL,
	"email" varchar(254) NOT NULL,
	"tipo" varchar(20) NOT NULL,
	CONSTRAINT "chk_estudante_emails_tipo" CHECK ((tipo)::text = ANY ((ARRAY['proprio'::character varying, 'responsavel'::character varying])::text[]))
);
--> statement-breakpoint
CREATE TABLE "consentimentos_lgpd" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"finalidade" varchar(200) NOT NULL,
	"versao_politica" varchar(20) NOT NULL,
	"consentido" boolean NOT NULL,
	"ip_origem" varchar(45),
	"user_agent" text,
	"consentido_em" timestamp with time zone DEFAULT now() NOT NULL,
	"revogado_em" timestamp with time zone,
	"base_legal" "base_legal_lgpd" NOT NULL,
	"revogado_motivo" text
);
--> statement-breakpoint
CREATE TABLE "tokens_sessao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"token_hash" char(64) NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"revogado" boolean DEFAULT false NOT NULL,
	"ip_origem" varchar(45),
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent" text,
	CONSTRAINT "tokens_sessao_token_hash_key" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "tipos_ocorrencias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"descricao" varchar(200) NOT NULL,
	"status" "status_ocorrencia" DEFAULT 'ativo' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_tipos_ocorrencias_descricao" UNIQUE("descricao")
);
--> statement-breakpoint
CREATE TABLE "disciplina_ofertas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"disciplina_id" uuid NOT NULL,
	"curso_id" uuid NOT NULL,
	"turno_id" uuid NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_disciplina_oferta" UNIQUE("disciplina_id","curso_id","turno_id")
);
--> statement-breakpoint
CREATE TABLE "cursos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" varchar(150) NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"descricao" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"deletado_em" timestamp with time zone,
	CONSTRAINT "uq_cursos_nome" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE "turnos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" varchar(30) NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_turnos_nome" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE "disciplinas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" varchar(150) NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_encrypted" "bytea" NOT NULL,
	"senha_hash" varchar(255) NOT NULL,
	"codigo_acesso" varchar(20) NOT NULL,
	"primeiro_acesso" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"foto_url" text,
	"nome" varchar(120),
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"deletado_em" timestamp with time zone,
	"email_hash" char(64) NOT NULL,
	"email_verificado" boolean DEFAULT false NOT NULL,
	"tentativas_login_falhas" smallint DEFAULT 0 NOT NULL,
	"bloqueado_ate" timestamp with time zone,
	"ultimo_login_em" timestamp with time zone,
	CONSTRAINT "usuarios_codigo_acesso_unique" UNIQUE("codigo_acesso"),
	CONSTRAINT "uq_usuarios_email_hash" UNIQUE("email_hash")
);
--> statement-breakpoint
CREATE TABLE "estudante_necessidades_especiais" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"estudante_id" uuid NOT NULL,
	"tipo" varchar(100) NOT NULL,
	"descricao" text,
	"laudo_referencia" varchar(200),
	"ativo" boolean DEFAULT true NOT NULL,
	"registrado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"registrado_por" uuid NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ocorrencias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"estudante_id" uuid NOT NULL,
	"tipo_ocorrencia_id" uuid NOT NULL,
	"disciplina_id" uuid,
	"data_ocorrencia" date NOT NULL,
	"observacao" varchar(2000),
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"registrado_por_id" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"deletado_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "estudantes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" varchar(120) NOT NULL,
	"registro" varchar(20) NOT NULL,
	"foto_url" varchar(500),
	"observacao" varchar(2000),
	"turma_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"deletado_em" timestamp with time zone,
	CONSTRAINT "uq_estudantes_registro" UNIQUE("registro")
);
--> statement-breakpoint
CREATE TABLE "turmas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sigla" char(10) NOT NULL,
	"descricao" varchar(200) NOT NULL,
	"curso_id" uuid NOT NULL,
	"turno_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"deletado_em" timestamp with time zone,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_turmas_sigla_curso" UNIQUE("sigla","curso_id")
);
--> statement-breakpoint
CREATE TABLE "auditoria_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid,
	"tabela" varchar(63) NOT NULL,
	"operacao" "operacao_auditoria" NOT NULL,
	"registro_id" uuid,
	"dados_antes" jsonb,
	"dados_depois" jsonb,
	"ip_origem" varchar(45),
	"user_agent" text,
	"trace_id" varchar(64),
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"span_id" varchar(32),
	"servico_origem" varchar(100),
	"ambiente" varchar(20),
	"versao_app" varchar(20),
	"metodo_http" char(7),
	"endpoint" varchar(500),
	"status_http" smallint,
	"duracao_ms" integer
);
--> statement-breakpoint
CREATE TABLE "solicitacoes_lgpd" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"tipo" "tipo_solicitacao_lgpd" NOT NULL,
	"status" "status_solicitacao_lgpd" DEFAULT 'pendente' NOT NULL,
	"motivo" text,
	"resposta_dpo" text,
	"prazo_legal" timestamp with time zone,
	"concluido_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" varchar(80) NOT NULL,
	"descricao" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_nome_key" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE "permissoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recurso" varchar(80) NOT NULL,
	"acao" varchar(50) NOT NULL,
	"descricao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_permissoes_recurso_acao" UNIQUE("recurso","acao")
);
--> statement-breakpoint
CREATE TABLE "usuario_disciplinas" (
	"usuario_id" uuid NOT NULL,
	"disciplina_oferta_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuario_disciplinas_pkey" PRIMARY KEY("usuario_id","disciplina_oferta_id")
);
--> statement-breakpoint
CREATE TABLE "roles_permissoes" (
	"role_id" uuid NOT NULL,
	"permissao_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_permissoes_pkey" PRIMARY KEY("role_id","permissao_id")
);
--> statement-breakpoint
CREATE TABLE "usuarios_roles" (
	"usuario_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"concedido_em" timestamp with time zone DEFAULT now() NOT NULL,
	"concedido_por" uuid,
	"expira_em" timestamp with time zone,
	CONSTRAINT "usuarios_roles_pkey" PRIMARY KEY("usuario_id","role_id")
);
--> statement-breakpoint
ALTER TABLE "estudante_emails" ADD CONSTRAINT "estudante_emails_estudante_id_fkey" FOREIGN KEY ("estudante_id") REFERENCES "public"."estudantes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consentimentos_lgpd" ADD CONSTRAINT "consentimentos_lgpd_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens_sessao" ADD CONSTRAINT "tokens_sessao_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disciplina_ofertas" ADD CONSTRAINT "disciplina_ofertas_curso_id_fkey" FOREIGN KEY ("curso_id") REFERENCES "public"."cursos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disciplina_ofertas" ADD CONSTRAINT "disciplina_ofertas_disciplina_id_fkey" FOREIGN KEY ("disciplina_id") REFERENCES "public"."disciplinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disciplina_ofertas" ADD CONSTRAINT "disciplina_ofertas_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "public"."turnos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estudante_necessidades_especiais" ADD CONSTRAINT "fk_ane_estudante" FOREIGN KEY ("estudante_id") REFERENCES "public"."estudantes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estudante_necessidades_especiais" ADD CONSTRAINT "fk_ane_registrado_por" FOREIGN KEY ("registrado_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ocorrencias" ADD CONSTRAINT "fk_oc_disciplina" FOREIGN KEY ("disciplina_id") REFERENCES "public"."disciplinas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ocorrencias" ADD CONSTRAINT "fk_oc_registrador" FOREIGN KEY ("registrado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ocorrencias" ADD CONSTRAINT "ocorrencias_estudante_id_estudantes_id_fk" FOREIGN KEY ("estudante_id") REFERENCES "public"."estudantes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ocorrencias" ADD CONSTRAINT "ocorrencias_tipo_ocorrencia_id_tipos_ocorrencias_id_fk" FOREIGN KEY ("tipo_ocorrencia_id") REFERENCES "public"."tipos_ocorrencias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estudantes" ADD CONSTRAINT "estudantes_turma_id_turmas_id_fk" FOREIGN KEY ("turma_id") REFERENCES "public"."turmas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turmas" ADD CONSTRAINT "turmas_curso_id_cursos_id_fk" FOREIGN KEY ("curso_id") REFERENCES "public"."cursos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turmas" ADD CONSTRAINT "turmas_turno_id_turnos_id_fk" FOREIGN KEY ("turno_id") REFERENCES "public"."turnos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitacoes_lgpd" ADD CONSTRAINT "fk_sl_usuario" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_disciplinas" ADD CONSTRAINT "usuario_disciplinas_disciplina_oferta_id_fkey" FOREIGN KEY ("disciplina_oferta_id") REFERENCES "public"."disciplina_ofertas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_disciplinas" ADD CONSTRAINT "usuario_disciplinas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles_permissoes" ADD CONSTRAINT "roles_permissoes_permissao_id_fkey" FOREIGN KEY ("permissao_id") REFERENCES "public"."permissoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles_permissoes" ADD CONSTRAINT "roles_permissoes_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios_roles" ADD CONSTRAINT "usuarios_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios_roles" ADD CONSTRAINT "usuarios_roles_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ee_estudante_id" ON "estudante_emails" USING btree ("estudante_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_cl_finalidade" ON "consentimentos_lgpd" USING btree ("finalidade" text_ops,"consentido" text_ops);--> statement-breakpoint
CREATE INDEX "idx_cl_usuario_id" ON "consentimentos_lgpd" USING btree ("usuario_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_tokens_ativos" ON "tokens_sessao" USING btree ("usuario_id" timestamptz_ops,"expira_em" timestamptz_ops) WHERE (revogado = false);--> statement-breakpoint
CREATE INDEX "idx_to_status" ON "tipos_ocorrencias" USING btree ("status" enum_ops);--> statement-breakpoint
CREATE INDEX "idx_do_curso_id" ON "disciplina_ofertas" USING btree ("curso_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_do_disciplina_id" ON "disciplina_ofertas" USING btree ("disciplina_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_do_turno_id" ON "disciplina_ofertas" USING btree ("turno_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_cursos_ativo" ON "cursos" USING btree ("ativo" bool_ops) WHERE (deletado_em IS NULL);--> statement-breakpoint
CREATE INDEX "idx_usuarios_ativo" ON "usuarios" USING btree ("deletado_em" timestamptz_ops) WHERE (deletado_em IS NULL);--> statement-breakpoint
CREATE INDEX "idx_usuarios_bloqueado" ON "usuarios" USING btree ("bloqueado_ate" timestamptz_ops) WHERE (bloqueado_ate IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_ane_estudante_id" ON "estudante_necessidades_especiais" USING btree ("estudante_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_oc_data" ON "ocorrencias" USING btree ("data_ocorrencia" date_ops);--> statement-breakpoint
CREATE INDEX "idx_oc_deletado" ON "ocorrencias" USING btree ("deletado_em" timestamptz_ops) WHERE (deletado_em IS NULL);--> statement-breakpoint
CREATE INDEX "idx_oc_disciplina" ON "ocorrencias" USING btree ("disciplina_id" uuid_ops) WHERE (disciplina_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_oc_estudante_data" ON "ocorrencias" USING btree ("estudante_id" uuid_ops,"data_ocorrencia" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_oc_registrador" ON "ocorrencias" USING btree ("registrado_por_id" uuid_ops) WHERE (registrado_por_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_oc_tipo" ON "ocorrencias" USING btree ("tipo_ocorrencia_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_estudantes_ativo" ON "estudantes" USING btree ("deletado_em" timestamptz_ops) WHERE (deletado_em IS NULL);--> statement-breakpoint
CREATE INDEX "idx_estudantes_nome_trgm" ON "estudantes" USING gin ("nome" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_estudantes_turma_id" ON "estudantes" USING btree ("turma_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_turmas_ativo" ON "turmas" USING btree ("ativo" bool_ops) WHERE (deletado_em IS NULL);--> statement-breakpoint
CREATE INDEX "idx_turmas_turno_id" ON "turmas" USING btree ("turno_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_al_dados_antes_gin" ON "auditoria_logs" USING gin ("dados_antes" jsonb_ops);--> statement-breakpoint
CREATE INDEX "idx_al_registro_id" ON "auditoria_logs" USING btree ("registro_id" uuid_ops) WHERE (registro_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_al_tabela_operacao" ON "auditoria_logs" USING btree ("tabela" text_ops,"operacao" text_ops,"criado_em" text_ops);--> statement-breakpoint
CREATE INDEX "idx_al_trace_id" ON "auditoria_logs" USING btree ("trace_id" text_ops) WHERE (trace_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_al_usuario_criado" ON "auditoria_logs" USING btree ("usuario_id" uuid_ops,"criado_em" timestamptz_ops) WHERE (usuario_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_sl_prazo" ON "solicitacoes_lgpd" USING btree ("prazo_legal" timestamptz_ops) WHERE (prazo_legal IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_sl_usuario_status" ON "solicitacoes_lgpd" USING btree ("usuario_id" uuid_ops,"status" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_ur_role_id" ON "usuarios_roles" USING btree ("role_id" uuid_ops);
*/