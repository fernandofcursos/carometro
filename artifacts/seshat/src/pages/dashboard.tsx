import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetStats } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Users, Building, Clock, Camera, BookOpen, AlertTriangle, CheckCircle2, GraduationCap, UserCircle, CalendarDays, UtensilsCrossed, ChevronRight, TableProperties } from "lucide-react";
import { LgpdBanner } from "@/components/lgpd-banner";
import { AvisosWidget } from "@/components/avisos-widget";
import { CardapioWidget } from "@/components/cardapio-widget";
import { Link } from "wouter";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─────────────────────────── tipos ───────────────────────────────────────────

type OcorrenciaResumo = {
  tipoId: string; tipoDescricao: string;
  total: number; semCiencia: number; ids: string[];
};
type AulaItem = { horaInicio: string; horaFim: string; disciplinaNome: string; disciplinaSigla: string; sala: string | null };
type DiaAgenda = { dia: number; diaNome: string; aulas: AulaItem[] };
type DiaCardapio = { dia: number; diaNome: string; data: string; itens: { refeicao: string; descricao: string }[] };

type DashboardData = {
  hoje: string; diaSemana: number;
  ocorrencias: { resumo: OcorrenciaResumo[]; totalGeral: number };
  agendaDisponivel: boolean; agenda: DiaAgenda[];
  cardapioDisponivel: boolean; cardapio: DiaCardapio[];
};

// ─────────────────────────── utilitários ─────────────────────────────────────

const DIAS = [
  { dia: 1, label: "Seg" }, { dia: 2, label: "Ter" },
  { dia: 3, label: "Qua" }, { dia: 4, label: "Qui" }, { dia: 5, label: "Sex" },
];

function saudacao(): string {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

function formatarHoje(d: string): string {
  return new Date(d + "T12:00:00").toLocaleDateString("pt-BR", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });
}

// ─────────────────────────── DiaTabs ─────────────────────────────────────────

function DiaTabs({
  diaSemana, accentColor, children,
}: { diaSemana: number; accentColor: string; children: (aba: number) => React.ReactNode }) {
  const inicial = diaSemana >= 1 && diaSemana <= 5 ? diaSemana : 1;
  const [aba, setAba] = useState(inicial);
  return (
    <div>
      <div className="flex gap-1.5 mb-4 flex-wrap">
        {DIAS.map((d) => (
          <button
            key={d.dia}
            onClick={() => setAba(d.dia)}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-semibold transition-all",
              aba === d.dia
                ? "text-white shadow-sm"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200",
            )}
            style={aba === d.dia ? { background: accentColor } : {}}
          >
            {d.label}{d.dia === diaSemana ? " ★" : ""}
          </button>
        ))}
      </div>
      {children(aba)}
    </div>
  );
}

// ─────────────────────────── OcorrenciasWidget ───────────────────────────────

function OcorrenciasWidget({
  resumo, podeDarCiencia, onDarCiencia,
}: { resumo: OcorrenciaResumo[]; podeDarCiencia: boolean; onDarCiencia: (ids: string[]) => void }) {
  if (resumo.length === 0)
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <CheckCircle2 className="w-8 h-8 text-green-400" />
        <p className="text-sm text-muted-foreground">Nenhuma ocorrência registrada</p>
      </div>
    );

  return (
    <div className="space-y-2">
      {resumo.map((r) => (
        <div
          key={r.tipoId}
          className="flex items-center justify-between rounded-xl border bg-white px-4 py-3 shadow-sm"
          style={{ borderColor: r.semCiencia > 0 ? "#fca5a5" : "#bbf7d0" }}
        >
          <div>
            <p className="font-medium text-slate-700 text-sm">{r.tipoDescricao}</p>
            <p className="text-xs text-slate-400">{r.total} ocorrência{r.total !== 1 ? "s" : ""}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              className="text-xs"
              style={{
                background: r.semCiencia > 0 ? "#fee2e2" : "#dcfce7",
                color: r.semCiencia > 0 ? "#b91c1c" : "#166534",
                border: "none",
              }}
            >
              {r.total}
            </Badge>
            {podeDarCiencia && r.semCiencia > 0 && (
              <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => onDarCiencia(r.ids)}>
                Ciência ({r.semCiencia})
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────── CardapioWidget ──────────────────────────────────

function CardapioLegadoWidget({ cardapio, cardapioDisponivel, diaSemana }: { cardapio: DiaCardapio[]; cardapioDisponivel: boolean; diaSemana: number }) {
  const byDia = new Map(cardapio.map((d) => [d.dia, d]));

  if (!cardapioDisponivel)
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <UtensilsCrossed className="w-8 h-8 text-amber-200" />
        <p className="text-sm text-muted-foreground">Cardápio não disponível ainda.</p>
        <p className="text-xs text-muted-foreground">Em breve o cardápio semanal será publicado.</p>
      </div>
    );

  return (
    <DiaTabs diaSemana={diaSemana} accentColor="#d97706">
      {(aba) => {
        const dia = byDia.get(aba);
        if (!dia || dia.itens.length === 0)
          return <p className="text-sm text-muted-foreground text-center py-6">Cardápio não publicado para este dia.</p>;
        return (
          <div className="space-y-2">
            {dia.itens.map((item, i) => (
              <div key={i} className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2.5">
                <p className="text-xs font-bold text-amber-700 uppercase tracking-wide">{item.refeicao}</p>
                <p className="text-sm text-slate-700 mt-0.5">{item.descricao}</p>
              </div>
            ))}
          </div>
        );
      }}
    </DiaTabs>
  );
}

// ─────────────────────────── QuadroHorariosWidget ────────────────────────────

const COR_DIA_BG: Record<number, string> = {
  1: "bg-blue-50 text-blue-800 border-blue-200",
  2: "bg-violet-50 text-violet-800 border-violet-200",
  3: "bg-emerald-50 text-emerald-800 border-emerald-200",
  4: "bg-amber-50 text-amber-800 border-amber-200",
  5: "bg-rose-50 text-rose-800 border-rose-200",
};
const COR_DIA_HEADER: Record<number, string> = {
  1: "bg-blue-600 text-white",
  2: "bg-violet-600 text-white",
  3: "bg-emerald-600 text-white",
  4: "bg-amber-600 text-white",
  5: "bg-rose-600 text-white",
};
const DIAS_ABREV = ["", "Seg", "Ter", "Qua", "Qui", "Sex"] as const;

function QuadroHorariosWidget({
  agenda, agendaDisponivel, diaSemana,
}: { agenda: DiaAgenda[]; agendaDisponivel: boolean; diaSemana: number }) {
  // Constrói mapa: "dia-horaInicio" → AulaItem
  const aulaMap = new Map<string, AulaItem>();
  // Coleta todos os horários únicos presentes em qualquer dia
  const slotsSet = new Map<string, { horaInicio: string; horaFim: string }>();
  for (const d of agenda) {
    for (const a of d.aulas) {
      const hi = String(a.horaInicio).slice(0, 5);
      const hf = String(a.horaFim).slice(0, 5);
      aulaMap.set(`${d.dia}-${hi}`, a);
      if (!slotsSet.has(hi)) slotsSet.set(hi, { horaInicio: hi, horaFim: hf });
    }
  }
  const linhas = [...slotsSet.values()].sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));

  if (!agendaDisponivel || linhas.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <TableProperties className="w-8 h-8 text-indigo-200" />
        <p className="text-sm text-muted-foreground">Quadro de horários não disponível ainda.</p>
        <p className="text-xs text-muted-foreground">Em breve a grade horária será publicada.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full border-collapse text-xs min-w-[480px]">
        <thead>
          <tr>
            <th className="py-2 px-2 text-left text-muted-foreground font-medium w-24 text-[11px]">
              <Clock className="w-3 h-3 inline mr-1 opacity-50" />Horário
            </th>
            {[1, 2, 3, 4, 5].map((dia) => (
              <th
                key={dia}
                className={cn(
                  "py-1.5 px-1 text-center text-[11px] font-semibold rounded-t",
                  COR_DIA_HEADER[dia],
                  dia === diaSemana && "ring-2 ring-offset-0 ring-white/60",
                )}
              >
                {DIAS_ABREV[dia]}
                {dia === diaSemana && <span className="ml-0.5 opacity-80">★</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha, i) => (
            <tr key={linha.horaInicio} className={i % 2 === 0 ? "bg-gray-50/60" : ""}>
              <td className="py-1.5 px-2 align-middle whitespace-nowrap text-[11px] text-muted-foreground font-medium">
                {linha.horaInicio}–{linha.horaFim}
              </td>
              {[1, 2, 3, 4, 5].map((dia) => {
                const aula = aulaMap.get(`${dia}-${linha.horaInicio}`);
                const isHoje = dia === diaSemana;
                return (
                  <td
                    key={dia}
                    className={cn(
                      "py-1 px-1 align-middle text-center",
                      isHoje && "bg-indigo-50/60",
                    )}
                  >
                    {aula ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className={cn(
                              "rounded px-1.5 py-1 leading-tight border text-[11px] font-medium cursor-default",
                              COR_DIA_BG[dia],
                            )}
                          >
                            <div className="truncate max-w-[80px] mx-auto font-bold">
                              {aula.disciplinaSigla ?? aula.disciplinaNome}
                            </div>
                            {aula.sala && (
                              <div className="opacity-60 truncate max-w-[80px] mx-auto text-[10px]">
                                {aula.sala}
                              </div>
                            )}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[200px] text-xs">
                          <p className="font-semibold">{aula.disciplinaNome}</p>
                          {aula.sala && <p className="opacity-70">Sala: {aula.sala}</p>}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-gray-300 text-[10px]">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────── DashboardEstudante ──────────────────────────────

function DashboardEstudante({ user }: { user: ReturnType<typeof useAuth>["user"] }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [cienciaIds, setCienciaIds] = useState<string[] | null>(null);
  const isEstudante = (user?.roles ?? []).includes("estudante");
  const isPaiResponsavel = (user?.roles ?? []).includes("pai_responsavel");

  const { data, isLoading, isError } = useQuery<DashboardData>({
    queryKey: ["portal-dashboard"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/portal/dashboard`, { credentials: "include" });
      if (!res.ok) throw new Error("Erro ao carregar dashboard");
      return res.json();
    },
  });

  const cienciaMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${BASE}/api/portal/ocorrencias/${id}/ciencia`, {
        method: "POST", credentials: "include",
      });
      if (!res.ok) throw new Error("Erro ao registrar ciência");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["portal-dashboard"] }),
    onError: () => toast({ title: "Erro ao registrar ciência", variant: "destructive" }),
  });

  const darCienciaEmTodos = async (ids: string[]) => {
    for (const id of ids) await cienciaMut.mutateAsync(id);
    setCienciaIds(null);
    toast({ title: "Ciência registrada com sucesso!" });
  };

  if (isLoading)
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-20 rounded-2xl bg-muted" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-48 rounded-2xl bg-muted" />)}
        </div>
      </div>
    );

  if (isError || !data)
    return (
      <div className="p-8 flex flex-col gap-2 items-center">
        <AlertTriangle className="w-8 h-8 text-destructive" />
        <p className="text-sm text-destructive">Não foi possível carregar o dashboard.</p>
      </div>
    );

  const { hoje, diaSemana, ocorrencias, agenda, agendaDisponivel, cardapio, cardapioDisponivel } = data;
  const podeDarCiencia = isPaiResponsavel || isEstudante; // isMaior é verificado no endpoint de ciência
  const totalSemCiencia = ocorrencias.resumo.reduce((s, r) => s + r.semCiencia, 0);

  return (
    <div className="space-y-6">
      {/* Saudação */}
      <div className="flex items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-sky-50 to-indigo-50 border border-sky-100 p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
            <UserCircle className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <p className="text-xs text-slate-500">{saudacao()},</p>
            <p className="font-semibold text-slate-800 capitalize">{user?.nome ?? (isEstudante ? "Estudante" : "Responsável")}</p>
          </div>
        </div>
        <p className="text-xs text-slate-500 hidden sm:block capitalize">{formatarHoje(hoje)}</p>
      </div>

      {/* Quadro de Horários — largura total */}
      <Card className="shadow-sm border-indigo-100">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <TableProperties className="w-4 h-4 text-indigo-500" />
            Quadro de Horários
            {!agendaDisponivel && <Badge variant="outline" className="text-xs ml-auto">Em breve</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <QuadroHorariosWidget agenda={agenda} agendaDisponivel={agendaDisponivel} diaSemana={diaSemana} />
        </CardContent>
      </Card>

      {/* Grid secundário: Ocorrências + Cardápio */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Ocorrências */}
        <Card className="shadow-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                Ocorrências
              </span>
              {totalSemCiencia > 0 && (
                <Badge style={{ background: "#fee2e2", color: "#b91c1c", border: "none" }} className="text-xs">
                  {totalSemCiencia} pendente{totalSemCiencia !== 1 ? "s" : ""}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <OcorrenciasWidget
              resumo={ocorrencias.resumo}
              podeDarCiencia={podeDarCiencia}
              onDarCiencia={setCienciaIds}
            />
          </CardContent>
        </Card>

        {/* Cardápio */}
        <Card className="shadow-sm border-amber-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <UtensilsCrossed className="w-4 h-4 text-amber-500" />
              Cardápio da Semana
              {!cardapioDisponivel && <Badge variant="outline" className="text-xs ml-auto">Em breve</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CardapioLegadoWidget cardapio={cardapio} cardapioDisponivel={cardapioDisponivel} diaSemana={diaSemana} />
          </CardContent>
        </Card>
      </div>

      {/* Calendário do mês */}
      <CalendarioMesWidget hoje={hoje} />

      {/* Atalho para Meu Perfil */}
      <Link href="/portal">
        <button className="w-full flex items-center justify-between rounded-xl border border-dashed border-indigo-200 bg-indigo-50/50 px-4 py-3 text-sm text-indigo-600 hover:bg-indigo-50 transition-colors">
          <span className="flex items-center gap-2"><GraduationCap className="w-4 h-4" /> Meu Perfil — carteira, cartão de liberação e mais</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </Link>

      {/* Dialog de ciência */}
      <Dialog open={cienciaIds !== null} onOpenChange={() => setCienciaIds(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dar ciência nas ocorrências</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Você está prestes a confirmar ciência em {cienciaIds?.length ?? 0} ocorrência{(cienciaIds?.length ?? 0) !== 1 ? "s" : ""}.
          </p>
          <div className="flex gap-2 justify-end mt-2">
            <Button variant="outline" onClick={() => setCienciaIds(null)}>Cancelar</Button>
            <Button
              onClick={() => cienciaIds && darCienciaEmTodos(cienciaIds)}
              disabled={cienciaMut.isPending}
            >
              {cienciaMut.isPending ? "Registrando..." : "Confirmar ciência"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─────────────────────────── CalendarioMesWidget ─────────────────────────────

type CalendarioEvento = {
  id: string; categoria: string; titulo: string | null; cor: string; icone: string;
};
type CalendarioDia = { data: string; diaSemana: number; eventos: CalendarioEvento[] };
type CalendarioMes = { mes: number; mesNome: string; dias: CalendarioDia[] };
type CalendarioResp = { ano: number; semestres: { semestre: 1|2; inicio: string; fim: string }[]; meses: CalendarioMes[] };

const DIAS_CAB = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: "include" });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? r.statusText);
  return r.json();
}

function CalendarioMesWidget({ hoje }: { hoje: string }) {
  const [ano, mes] = hoje.split("-").map(Number);

  const { data, isLoading } = useQuery<CalendarioResp>({
    queryKey: ["calendario-dash", ano],
    queryFn: () => fetchJson(`${BASE}/api/calendario?ano=${ano}`),
    staleTime: 5 * 60 * 1000,
  });

  const mesData = data?.meses.find((m) => m.mes === mes);
  const semestres = data?.semestres ?? [];

  const emSemestre = (dataStr: string) =>
    semestres.some((s) => dataStr >= s.inicio && dataStr <= s.fim);

  const offset = mesData?.dias[0]?.diaSemana ?? 0;

  return (
    <Card className="shadow-sm border-border/50">
      <CardHeader className="pb-2 flex-row items-center justify-between">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-cyan-600" />
          {mesData?.mesNome ?? "Calendário"} {ano}
        </CardTitle>
        <Link href="/calendario">
          <span className="text-xs text-cyan-600 hover:underline cursor-pointer flex items-center gap-0.5">
            Ver completo <ChevronRight className="w-3 h-3" />
          </span>
        </Link>
      </CardHeader>
      <CardContent className="pt-1">
        {isLoading ? (
          <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">
            Carregando...
          </div>
        ) : !mesData ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Calendário não configurado para {ano}.</p>
        ) : (
          <div>
            {/* Cabeçalho dias da semana */}
            <div className="grid grid-cols-7 mb-1">
              {DIAS_CAB.map((d) => (
                <div key={d} className="text-[10px] text-center text-muted-foreground font-medium py-0.5">{d}</div>
              ))}
            </div>
            {/* Grade */}
            <div className="grid grid-cols-7 gap-px">
              {Array.from({ length: offset }).map((_, i) => <div key={`o${i}`} />)}
              {mesData.dias.map((dia) => {
                const isHoje = dia.data === hoje;
                const fds = dia.diaSemana === 0 || dia.diaSemana === 6;
                const ativo = emSemestre(dia.data);
                const primEv = dia.eventos[0];
                return (
                  <Tooltip key={dia.data}>
                    <TooltipTrigger asChild>
                      <div
                        className={cn(
                          "rounded p-0.5 min-h-[34px] flex flex-col items-center justify-start",
                          fds ? "opacity-50" : !ativo ? "opacity-40" : "",
                          isHoje && "ring-2 ring-indigo-400 rounded bg-indigo-50",
                          primEv && !isHoje && "bg-opacity-30 rounded",
                        )}
                        style={primEv && !isHoje ? { background: primEv.cor + "22" } : undefined}
                      >
                        <span className={cn(
                          "text-[11px] font-semibold leading-tight",
                          isHoje ? "text-indigo-600" : fds ? "text-slate-400" : "text-slate-700",
                        )}>
                          {new Date(dia.data + "T12:00:00").getDate()}
                        </span>
                        {dia.eventos.slice(0, 2).map((ev) => (
                          <span key={ev.id} className="text-[10px] leading-none">{ev.icone}</span>
                        ))}
                      </div>
                    </TooltipTrigger>
                    {dia.eventos.length > 0 && (
                      <TooltipContent side="top" className="max-w-[180px] space-y-1">
                        {dia.eventos.map((ev) => (
                          <p key={ev.id} className="text-xs">
                            {ev.icone} {ev.titulo ?? ev.categoria}
                          </p>
                        ))}
                      </TooltipContent>
                    )}
                  </Tooltip>
                );
              })}
            </div>
            {/* Legenda dos eventos do mês */}
            {mesData.dias.some((d) => d.eventos.length > 0) && (
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
                {Array.from(
                  new Map(
                    mesData.dias.flatMap((d) => d.eventos).map((ev) => [ev.categoria, ev])
                  ).values()
                ).map((ev) => (
                  <span key={ev.categoria} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <span className="w-2 h-2 rounded-full inline-block" style={{ background: ev.cor }} />
                    {ev.icone} {ev.categoria.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────── DashboardResponsavel ────────────────────────────

type EstudanteResumo = {
  id: string; nome: string; fotoUrl: string | null;
  turmaSigla: string; cursoNome: string;
  agendaDisponivel: boolean;
  agenda: DiaAgenda[];
  ocorrencias: { resumo: OcorrenciaResumo[]; totalGeral: number };
};

type DashboardResponsavelData = {
  hoje: string; diaSemana: number;
  estudantes: EstudanteResumo[];
  cardapioDisponivel: boolean;
  cardapio: DiaCardapio[];
};

// Paleta de cores por índice de estudante (para diferenciar cartões)
const STUDENT_GRADIENTS = [
  "from-indigo-500 to-violet-600",
  "from-teal-500 to-cyan-600",
  "from-rose-500 to-pink-600",
  "from-amber-500 to-orange-600",
  "from-emerald-500 to-green-600",
];

function EstudanteCard({
  estudante, diaSemana, onDarCiencia, gradientClass,
}: {
  estudante: EstudanteResumo;
  diaSemana: number;
  onDarCiencia: (ids: string[]) => void;
  gradientClass: string;
}) {
  const [aba, setAba] = useState<"horarios" | "ocorrencias">("horarios");
  const totalSemCiencia = estudante.ocorrencias.resumo.reduce((s, r) => s + r.semCiencia, 0);

  return (
    <Card className="shadow-md border-0 overflow-hidden">
      {/* Cabeçalho com gradiente */}
      <div className={cn("bg-gradient-to-r px-4 py-4 flex items-center gap-3", gradientClass)}>
        {estudante.fotoUrl ? (
          <img
            src={estudante.fotoUrl}
            className="w-12 h-12 rounded-full object-cover ring-2 ring-white/40 shrink-0"
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center shrink-0">
            <UserCircle className="w-7 h-7 text-white/80" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-white text-base leading-tight truncate">{estudante.nome}</p>
          <p className="text-xs text-white/70 truncate mt-0.5">
            {estudante.turmaSigla && estudante.cursoNome
              ? `${estudante.turmaSigla} · ${estudante.cursoNome}`
              : estudante.turmaSigla || estudante.cursoNome || "Não enturmado"}
          </p>
        </div>
        {totalSemCiencia > 0 && (
          <div className="shrink-0 bg-white/20 text-white rounded-full px-2.5 py-1 text-xs font-semibold flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            {totalSemCiencia}
          </div>
        )}
      </div>

      {/* Abas internas */}
      <div className="flex border-b bg-muted/30">
        <button
          onClick={() => setAba("horarios")}
          className={cn(
            "flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border-b-2",
            aba === "horarios"
              ? "border-indigo-500 text-indigo-700 bg-white"
              : "border-transparent text-muted-foreground hover:text-slate-700",
          )}
        >
          <TableProperties className="w-3.5 h-3.5" /> Horários
          {!estudante.agendaDisponivel && (
            <span className="text-[10px] bg-muted rounded-full px-1.5 py-0.5 text-muted-foreground ml-0.5">Em breve</span>
          )}
        </button>
        <button
          onClick={() => setAba("ocorrencias")}
          className={cn(
            "flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border-b-2",
            aba === "ocorrencias"
              ? "border-red-400 text-red-700 bg-white"
              : "border-transparent text-muted-foreground hover:text-slate-700",
          )}
        >
          <AlertTriangle className="w-3.5 h-3.5" /> Ocorrências
          {totalSemCiencia > 0 && (
            <span className="bg-red-100 text-red-700 rounded-full px-1.5 py-0.5 text-[10px] font-bold ml-0.5">
              {totalSemCiencia}
            </span>
          )}
        </button>
      </div>

      <CardContent className="pt-4 pb-4">
        {aba === "horarios" && (
          <QuadroHorariosWidget
            agenda={estudante.agenda}
            agendaDisponivel={estudante.agendaDisponivel}
            diaSemana={diaSemana}
          />
        )}
        {aba === "ocorrencias" && (
          <OcorrenciasWidget
            resumo={estudante.ocorrencias.resumo}
            podeDarCiencia
            onDarCiencia={onDarCiencia}
          />
        )}
      </CardContent>
    </Card>
  );
}

function DashboardResponsavel({ user }: { user: ReturnType<typeof useAuth>["user"] }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [cienciaIds, setCienciaIds] = useState<string[] | null>(null);
  const [estudanteSelecionadoId, setEstudanteSelecionadoId] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery<DashboardResponsavelData>({
    queryKey: ["portal-responsavel-dashboard"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/portal-responsavel/dashboard`, { credentials: "include" });
      if (!res.ok) throw new Error("Erro ao carregar dashboard");
      return res.json();
    },
  });

  useEffect(() => {
    if (data?.estudantes?.[0]?.id && !estudanteSelecionadoId) {
      setEstudanteSelecionadoId(data.estudantes[0].id);
    }
  }, [data]);

  const cienciaMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${BASE}/api/portal-responsavel/ocorrencias/${id}/ciencia`, {
        method: "POST", credentials: "include",
      });
      if (!res.ok) throw new Error("Erro ao registrar ciência");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["portal-responsavel-dashboard"] }),
    onError: () => toast({ title: "Erro ao registrar ciência", variant: "destructive" }),
  });

  const darCienciaEmTodos = async (ids: string[]) => {
    for (const id of ids) await cienciaMut.mutateAsync(id);
    setCienciaIds(null);
    toast({ title: "Ciência registrada com sucesso!" });
  };

  if (isLoading)
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-20 rounded-2xl bg-muted" />
        <div className="flex gap-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-9 flex-1 rounded-full bg-muted" />)}
        </div>
        <div className="h-72 rounded-2xl bg-muted" />
      </div>
    );

  if (isError || !data)
    return (
      <div className="p-8 flex flex-col gap-2 items-center">
        <AlertTriangle className="w-8 h-8 text-destructive" />
        <p className="text-sm text-destructive">Não foi possível carregar o dashboard.</p>
      </div>
    );

  const { hoje, diaSemana, estudantes, cardapio, cardapioDisponivel } = data;

  const estAtual = estudantes.find((e) => e.id === estudanteSelecionadoId) ?? estudantes[0] ?? null;
  const estIndex = estudantes.findIndex((e) => e.id === estAtual?.id);

  return (
    <div className="space-y-5">
      {/* Saudação */}
      <div className="flex items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-sky-50 to-indigo-50 border border-sky-100 p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
            <UserCircle className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <p className="text-xs text-slate-500">{saudacao()},</p>
            <p className="font-semibold text-slate-800 capitalize">{user?.nome ?? "Responsável"}</p>
          </div>
        </div>
        <div className="hidden sm:block text-right">
          <p className="text-xs text-slate-500 capitalize">{formatarHoje(hoje)}</p>
          {estudantes.length > 0 && (
            <p className="text-xs text-indigo-500 font-medium mt-0.5">
              {estudantes.length} filho{estudantes.length !== 1 ? "s" : ""} vinculado{estudantes.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      </div>

      {/* Sem dependentes vinculados */}
      {estudantes.length === 0 && (
        <Card className="shadow-sm">
          <CardContent className="py-14 flex flex-col items-center gap-3 text-center">
            <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center">
              <GraduationCap className="w-8 h-8 text-indigo-300" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-700">Nenhum estudante vinculado</p>
              <p className="text-xs text-muted-foreground mt-1">Entre em contato com a coordenação para registrar o vínculo.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Seletor de estudante (pill nav) — visível só se houver mais de um */}
      {estudantes.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {estudantes.map((e, idx) => {
            const pendentes = e.ocorrencias.resumo.reduce((s, r) => s + r.semCiencia, 0);
            const isAtivo = e.id === estAtual?.id;
            const grad = STUDENT_GRADIENTS[idx % STUDENT_GRADIENTS.length];
            return (
              <button
                key={e.id}
                onClick={() => setEstudanteSelecionadoId(e.id)}
                className={cn(
                  "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all shadow-sm border",
                  isAtivo
                    ? `bg-gradient-to-r ${grad} text-white border-transparent shadow-md`
                    : "bg-white text-slate-600 border-border hover:bg-muted",
                )}
              >
                {e.fotoUrl ? (
                  <img src={e.fotoUrl} className="w-5 h-5 rounded-full object-cover" />
                ) : (
                  <UserCircle className={cn("w-4 h-4", isAtivo ? "text-white/70" : "text-slate-400")} />
                )}
                <span className="truncate max-w-[120px]">{e.nome.split(" ")[0]}</span>
                {pendentes > 0 && (
                  <span className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none",
                    isAtivo ? "bg-white/25 text-white" : "bg-red-100 text-red-600",
                  )}>
                    {pendentes}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Cartão do estudante selecionado */}
      {estAtual && (
        <EstudanteCard
          key={estAtual.id}
          estudante={estAtual}
          diaSemana={diaSemana}
          onDarCiencia={setCienciaIds}
          gradientClass={STUDENT_GRADIENTS[estIndex % STUDENT_GRADIENTS.length]}
        />
      )}

      {/* Cardápio da semana — compartilhado */}
      {estudantes.length > 0 && (
        <Card className="shadow-sm border-amber-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <UtensilsCrossed className="w-4 h-4 text-amber-500" />
              Cardápio da Semana
              {!cardapioDisponivel && <Badge variant="outline" className="text-xs ml-auto">Em breve</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CardapioLegadoWidget cardapio={cardapio} cardapioDisponivel={cardapioDisponivel} diaSemana={diaSemana} />
          </CardContent>
        </Card>
      )}

      {/* Calendário do mês */}
      {estudantes.length > 0 && <CalendarioMesWidget hoje={hoje} />}

      {/* Dialog de ciência */}
      <Dialog open={cienciaIds !== null} onOpenChange={() => setCienciaIds(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dar ciência nas ocorrências</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Você está prestes a confirmar ciência em {cienciaIds?.length ?? 0} ocorrência{(cienciaIds?.length ?? 0) !== 1 ? "s" : ""}.
          </p>
          <div className="flex gap-2 justify-end mt-2">
            <Button variant="outline" onClick={() => setCienciaIds(null)}>Cancelar</Button>
            <Button onClick={() => cienciaIds && darCienciaEmTodos(cienciaIds)} disabled={cienciaMut.isPending}>
              {cienciaMut.isPending ? "Registrando..." : "Confirmar ciência"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─────────────────────────── DashboardAdmin ──────────────────────────────────

function DashboardAdmin() {
  const { data: stats, isLoading } = useGetStats();
  const { data: hojeData } = useQuery<{ hoje: string }>({
    queryKey: ["servidor-hoje"],
    queryFn: () => fetchJson(`${BASE}/api/hoje`),
    staleTime: 60 * 60 * 1000,
  });
  const hojeServer = hojeData?.hoje ?? new Date().toISOString().slice(0, 10);
  const coveragePercentage = stats?.totalEstudantes
    ? Math.round((stats.comFoto / stats.totalEstudantes) * 100)
    : 0;

  if (isLoading)
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-muted rounded-md" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Card key={i}><CardContent className="p-6"><div className="h-12 bg-muted rounded-md" /></CardContent></Card>
          ))}
        </div>
      </div>
    );

  return (
    <div className="space-y-8">
      <LgpdBanner />
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-primary">Painel</h1>
        <p className="text-muted-foreground mt-2">Visão geral do sistema de registros.</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {[
          { label: "Estudantes", value: stats?.totalEstudantes ?? 0, icon: Users, color: "bg-primary/10 text-primary" },
          { label: "Cursos",     value: stats?.totalCursos ?? 0,     icon: BookOpen, color: "bg-violet-500/10 text-violet-600" },
          { label: "Turmas",     value: stats?.totalTurmas ?? 0,     icon: Building, color: "bg-amber-500/10 text-amber-600" },
          { label: "Turnos",     value: stats?.totalTurnos ?? 0,     icon: Clock,    color: "bg-blue-500/10 text-blue-600" },
          { label: "Com Foto",   value: stats?.comFoto ?? 0,         icon: Camera,   color: "bg-green-500/10 text-green-600" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="shadow-sm border-border/50">
            <CardContent className="p-6 flex items-center gap-4">
              <div className={cn("p-3 rounded-lg", color)}><Icon className="w-6 h-6" /></div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">{label}</p>
                <h2 className="text-3xl font-bold">{value}</h2>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <Card className="shadow-sm border-border/50">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Camera className="w-5 h-5 text-muted-foreground" /> Cobertura Fotográfica
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Progresso geral</span>
              <span className="font-medium text-primary">{coveragePercentage}% concluído</span>
            </div>
            <Progress value={coveragePercentage} className="h-3 bg-muted" />
            <p className="text-sm text-muted-foreground">
              {stats?.semFoto
                ? `Faltam fotos de ${stats.semFoto} estudante${stats.semFoto !== 1 ? "s" : ""} no sistema.`
                : "Todos os estudantes possuem foto."}
            </p>
          </CardContent>
        </Card>
        <CalendarioMesWidget hoje={hojeServer} />
      </div>
      <AvisosWidget perfil="todos" limite={5} />
      <CardapioWidget className="mt-4" />
    </div>
  );
}

// ─────────────────────────── export default ──────────────────────────────────

export default function Dashboard() {
  const { user } = useAuth();
  const roles = user?.roles ?? [];
  const isEstudante = roles.includes("estudante");
  const isPaiResponsavel = roles.includes("pai_responsavel");

  if (isEstudante) return <DashboardEstudante user={user} />;
  if (isPaiResponsavel) return <DashboardResponsavel user={user} />;
  return <DashboardAdmin />;
}
