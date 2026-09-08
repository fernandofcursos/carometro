export const CATEGORIAS_CONFIG: Record<string, { nome: string; cor: string; icone: string }> = {
  letivo:                { nome: "Dia letivo",               cor: "#4ade80", icone: "📗" },
  feriado_nacional:      { nome: "Feriado nacional",         cor: "#f87171", icone: "🇧🇷" },
  feriado_distrital:     { nome: "Feriado distrital",        cor: "#fb923c", icone: "🏛️" },
  recesso:               { nome: "Recesso / Férias",         cor: "#fbbf24", icone: "☀️" },
  evento:                { nome: "Evento escolar",           cor: "#60a5fa", icone: "📅" },
  formacao:              { nome: "Formação de professores",  cor: "#a78bfa", icone: "📚" },
  atividade_pedagogica:  { nome: "Atividade pedagógica",     cor: "#f472b6", icone: "🎓" },
  nao_letivo:            { nome: "Dia não letivo",           cor: "#94a3b8", icone: "🚫" },
  semana_pedagogica:     { nome: "Semana pedagógica",        cor: "#c084fc", icone: "🗓️" },
};

export function getCor(categoria: string, corOverride?: string | null): string {
  if (corOverride) return corOverride;
  return CATEGORIAS_CONFIG[categoria]?.cor ?? "#94a3b8";
}

export function getIcone(categoria: string, iconeOverride?: string | null): string {
  if (iconeOverride) return iconeOverride;
  return CATEGORIAS_CONFIG[categoria]?.icone ?? "📅";
}
