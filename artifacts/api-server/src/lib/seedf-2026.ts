export interface SeedfDia {
  data: string;
  categoria: string;
  titulo: string;
  descricao?: string;
}

export interface SeedfSemestre {
  semestre: 1 | 2;
  inicio: string;
  fim: string;
}

export const SEMESTRES_SEEDF_2026: SeedfSemestre[] = [
  { semestre: 1, inicio: "2026-02-02", fim: "2026-07-11" },
  { semestre: 2, inicio: "2026-08-10", fim: "2026-12-19" },
];

export const CALENDARIO_SEEDF_2026: SeedfDia[] = [
  // ── Semana Pedagógica 1º Semestre ────────────────────────────────────────────
  { data: "2026-01-26", categoria: "semana_pedagogica", titulo: "Semana Pedagógica 1º Sem." },
  { data: "2026-01-27", categoria: "semana_pedagogica", titulo: "Semana Pedagógica 1º Sem." },
  { data: "2026-01-28", categoria: "semana_pedagogica", titulo: "Semana Pedagógica 1º Sem." },
  { data: "2026-01-29", categoria: "semana_pedagogica", titulo: "Semana Pedagógica 1º Sem." },
  { data: "2026-01-30", categoria: "semana_pedagogica", titulo: "Semana Pedagógica 1º Sem.", descricao: "Também feriado distrital — Dia de São Sebastião" },

  // ── Feriados Distritais ───────────────────────────────────────────────────────
  { data: "2026-01-30", categoria: "feriado_distrital", titulo: "Dia de São Sebastião", descricao: "Padroeiro do Distrito Federal" },
  { data: "2026-11-30", categoria: "feriado_distrital", titulo: "Dia do Evangélico" },

  // ── Carnaval (recesso) ────────────────────────────────────────────────────────
  { data: "2026-02-16", categoria: "recesso", titulo: "Carnaval", descricao: "Segunda-feira de Carnaval" },
  { data: "2026-02-17", categoria: "recesso", titulo: "Carnaval", descricao: "Terça-feira de Carnaval" },
  { data: "2026-02-18", categoria: "recesso", titulo: "Carnaval", descricao: "Quarta-feira de Cinzas (recesso)" },
  { data: "2026-02-19", categoria: "recesso", titulo: "Carnaval" },
  { data: "2026-02-20", categoria: "recesso", titulo: "Carnaval" },

  // ── Feriados Nacionais ────────────────────────────────────────────────────────
  { data: "2026-04-03", categoria: "feriado_nacional", titulo: "Sexta-feira Santa" },
  { data: "2026-04-21", categoria: "feriado_nacional", titulo: "Tiradentes" },
  { data: "2026-05-01", categoria: "feriado_nacional", titulo: "Dia do Trabalhador" },
  { data: "2026-06-04", categoria: "feriado_nacional", titulo: "Corpus Christi" },
  { data: "2026-09-07", categoria: "feriado_nacional", titulo: "Independência do Brasil" },
  { data: "2026-10-12", categoria: "feriado_nacional", titulo: "Nossa Senhora Aparecida" },
  { data: "2026-11-02", categoria: "feriado_nacional", titulo: "Finados" },
  { data: "2026-11-15", categoria: "feriado_nacional", titulo: "Proclamação da República" },
  { data: "2026-12-25", categoria: "feriado_nacional", titulo: "Natal" },

  // ── Recesso de Páscoa ─────────────────────────────────────────────────────────
  { data: "2026-04-02", categoria: "recesso", titulo: "Recesso de Páscoa" },
  { data: "2026-04-06", categoria: "recesso", titulo: "Recesso de Páscoa" },

  // ── Recesso de Julho ──────────────────────────────────────────────────────────
  { data: "2026-07-13", categoria: "recesso", titulo: "Recesso de Julho" },
  { data: "2026-07-14", categoria: "recesso", titulo: "Recesso de Julho" },
  { data: "2026-07-15", categoria: "recesso", titulo: "Recesso de Julho" },
  { data: "2026-07-16", categoria: "recesso", titulo: "Recesso de Julho" },
  { data: "2026-07-17", categoria: "recesso", titulo: "Recesso de Julho" },
  { data: "2026-07-20", categoria: "recesso", titulo: "Recesso de Julho" },
  { data: "2026-07-21", categoria: "recesso", titulo: "Recesso de Julho" },
  { data: "2026-07-22", categoria: "recesso", titulo: "Recesso de Julho" },
  { data: "2026-07-23", categoria: "recesso", titulo: "Recesso de Julho" },
  { data: "2026-07-24", categoria: "recesso", titulo: "Recesso de Julho" },
  { data: "2026-07-27", categoria: "recesso", titulo: "Recesso de Julho" },
  { data: "2026-07-28", categoria: "recesso", titulo: "Recesso de Julho" },
  { data: "2026-07-29", categoria: "recesso", titulo: "Recesso de Julho" },
  { data: "2026-07-30", categoria: "recesso", titulo: "Recesso de Julho" },
  { data: "2026-07-31", categoria: "recesso", titulo: "Recesso de Julho" },

  // ── Semana Pedagógica 2º Semestre ─────────────────────────────────────────────
  { data: "2026-08-03", categoria: "semana_pedagogica", titulo: "Semana Pedagógica 2º Sem." },
  { data: "2026-08-04", categoria: "semana_pedagogica", titulo: "Semana Pedagógica 2º Sem." },
  { data: "2026-08-05", categoria: "semana_pedagogica", titulo: "Semana Pedagógica 2º Sem." },
  { data: "2026-08-06", categoria: "semana_pedagogica", titulo: "Semana Pedagógica 2º Sem." },
  { data: "2026-08-07", categoria: "semana_pedagogica", titulo: "Semana Pedagógica 2º Sem." },

  // ── Recesso de Outubro ────────────────────────────────────────────────────────
  { data: "2026-10-19", categoria: "recesso", titulo: "Recesso de Outubro" },
  { data: "2026-10-20", categoria: "recesso", titulo: "Recesso de Outubro" },
  { data: "2026-10-21", categoria: "recesso", titulo: "Recesso de Outubro" },
  { data: "2026-10-22", categoria: "recesso", titulo: "Recesso de Outubro" },
  { data: "2026-10-23", categoria: "recesso", titulo: "Recesso de Outubro" },

  // ── Recesso Final ─────────────────────────────────────────────────────────────
  { data: "2026-12-21", categoria: "recesso", titulo: "Recesso Final de Ano" },
  { data: "2026-12-22", categoria: "recesso", titulo: "Recesso Final de Ano" },
  { data: "2026-12-23", categoria: "recesso", titulo: "Recesso Final de Ano" },
  { data: "2026-12-24", categoria: "recesso", titulo: "Recesso Final de Ano" },
  { data: "2026-12-28", categoria: "recesso", titulo: "Recesso Final de Ano" },
  { data: "2026-12-29", categoria: "recesso", titulo: "Recesso Final de Ano" },
  { data: "2026-12-30", categoria: "recesso", titulo: "Recesso Final de Ano" },
  { data: "2026-12-31", categoria: "recesso", titulo: "Recesso Final de Ano" },

  // ── Agenda Pedagógica 2º Semestre ─────────────────────────────────────────────
  { data: "2026-08-10", categoria: "atividade_pedagogica", titulo: "Acolhimento de estudantes", descricao: "1ª semana — Retomada das atividades" },
  { data: "2026-08-17", categoria: "atividade_pedagogica", titulo: "Diagnóstico inicial", descricao: "2ª semana — Sondagem de aprendizagem" },
];
