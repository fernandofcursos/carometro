import { relations } from "drizzle-orm/relations";
import { estudantes, estudanteEmails, usuarios, consentimentosLgpd, tokensSessao, cursos, disciplinaOfertas, disciplinas, turnos, estudanteNecessidadesEspeciais, ocorrencias, tiposOcorrencias, turmas, solicitacoesLgpd, usuarioDisciplinas, permissoes, rolesPermissoes, roles, usuariosRoles } from "./schema";

export const estudanteEmailsRelations = relations(estudanteEmails, ({one}) => ({
	estudante: one(estudantes, {
		fields: [estudanteEmails.estudanteId],
		references: [estudantes.id]
	}),
}));

export const estudantesRelations = relations(estudantes, ({one, many}) => ({
	estudanteEmails: many(estudanteEmails),
	estudanteNecessidadesEspeciais: many(estudanteNecessidadesEspeciais),
	ocorrencias: many(ocorrencias),
	turma: one(turmas, {
		fields: [estudantes.turmaId],
		references: [turmas.id]
	}),
}));

export const consentimentosLgpdRelations = relations(consentimentosLgpd, ({one}) => ({
	usuario: one(usuarios, {
		fields: [consentimentosLgpd.usuarioId],
		references: [usuarios.id]
	}),
}));

export const usuariosRelations = relations(usuarios, ({many}) => ({
	consentimentosLgpds: many(consentimentosLgpd),
	tokensSessaos: many(tokensSessao),
	estudanteNecessidadesEspeciais: many(estudanteNecessidadesEspeciais),
	ocorrencias: many(ocorrencias),
	solicitacoesLgpds: many(solicitacoesLgpd),
	usuarioDisciplinas: many(usuarioDisciplinas),
	usuariosRoles: many(usuariosRoles),
}));

export const tokensSessaoRelations = relations(tokensSessao, ({one}) => ({
	usuario: one(usuarios, {
		fields: [tokensSessao.usuarioId],
		references: [usuarios.id]
	}),
}));

export const disciplinaOfertasRelations = relations(disciplinaOfertas, ({one, many}) => ({
	curso: one(cursos, {
		fields: [disciplinaOfertas.cursoId],
		references: [cursos.id]
	}),
	disciplina: one(disciplinas, {
		fields: [disciplinaOfertas.disciplinaId],
		references: [disciplinas.id]
	}),
	turno: one(turnos, {
		fields: [disciplinaOfertas.turnoId],
		references: [turnos.id]
	}),
	usuarioDisciplinas: many(usuarioDisciplinas),
}));

export const cursosRelations = relations(cursos, ({many}) => ({
	disciplinaOfertas: many(disciplinaOfertas),
	turmas: many(turmas),
}));

export const disciplinasRelations = relations(disciplinas, ({many}) => ({
	disciplinaOfertas: many(disciplinaOfertas),
	ocorrencias: many(ocorrencias),
}));

export const turnosRelations = relations(turnos, ({many}) => ({
	disciplinaOfertas: many(disciplinaOfertas),
	turmas: many(turmas),
}));

export const estudanteNecessidadesEspeciaisRelations = relations(estudanteNecessidadesEspeciais, ({one}) => ({
	estudante: one(estudantes, {
		fields: [estudanteNecessidadesEspeciais.estudanteId],
		references: [estudantes.id]
	}),
	usuario: one(usuarios, {
		fields: [estudanteNecessidadesEspeciais.registradoPor],
		references: [usuarios.id]
	}),
}));

export const ocorrenciasRelations = relations(ocorrencias, ({one}) => ({
	disciplina: one(disciplinas, {
		fields: [ocorrencias.disciplinaId],
		references: [disciplinas.id]
	}),
	usuario: one(usuarios, {
		fields: [ocorrencias.registradoPorId],
		references: [usuarios.id]
	}),
	estudante: one(estudantes, {
		fields: [ocorrencias.estudanteId],
		references: [estudantes.id]
	}),
	tiposOcorrencia: one(tiposOcorrencias, {
		fields: [ocorrencias.tipoOcorrenciaId],
		references: [tiposOcorrencias.id]
	}),
}));

export const tiposOcorrenciasRelations = relations(tiposOcorrencias, ({many}) => ({
	ocorrencias: many(ocorrencias),
}));

export const turmasRelations = relations(turmas, ({one, many}) => ({
	estudantes: many(estudantes),
	curso: one(cursos, {
		fields: [turmas.cursoId],
		references: [cursos.id]
	}),
	turno: one(turnos, {
		fields: [turmas.turnoId],
		references: [turnos.id]
	}),
}));

export const solicitacoesLgpdRelations = relations(solicitacoesLgpd, ({one}) => ({
	usuario: one(usuarios, {
		fields: [solicitacoesLgpd.usuarioId],
		references: [usuarios.id]
	}),
}));

export const usuarioDisciplinasRelations = relations(usuarioDisciplinas, ({one}) => ({
	disciplinaOferta: one(disciplinaOfertas, {
		fields: [usuarioDisciplinas.disciplinaOfertaId],
		references: [disciplinaOfertas.id]
	}),
	usuario: one(usuarios, {
		fields: [usuarioDisciplinas.usuarioId],
		references: [usuarios.id]
	}),
}));

export const rolesPermissoesRelations = relations(rolesPermissoes, ({one}) => ({
	permissoe: one(permissoes, {
		fields: [rolesPermissoes.permissaoId],
		references: [permissoes.id]
	}),
	role: one(roles, {
		fields: [rolesPermissoes.roleId],
		references: [roles.id]
	}),
}));

export const permissoesRelations = relations(permissoes, ({many}) => ({
	rolesPermissoes: many(rolesPermissoes),
}));

export const rolesRelations = relations(roles, ({many}) => ({
	rolesPermissoes: many(rolesPermissoes),
	usuariosRoles: many(usuariosRoles),
}));

export const usuariosRolesRelations = relations(usuariosRoles, ({one}) => ({
	role: one(roles, {
		fields: [usuariosRoles.roleId],
		references: [roles.id]
	}),
	usuario: one(usuarios, {
		fields: [usuariosRoles.usuarioId],
		references: [usuarios.id]
	}),
}));