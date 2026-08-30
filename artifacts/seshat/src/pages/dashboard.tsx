import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetStats } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Users, Building, Clock, Camera, BookOpen, AlertTriangle, CheckCircle2, GraduationCap, UserCircle, CalendarDays, UtensilsCrossed, ChevronRight } from "lucide-react";
import { LgpdBanner } from "@/components/lgpd-banner";
import { Link } from "wouter";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useState } from "react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─────────────────────────── tipos ───────────────────────────────────────────

type OcorrenciaResumo = {
  tipoId: string; tipoDescricao: string;
  total: number; semCiencia: number; ids: string[];
};
type AulaItem = { horaInicio: string; horaFim: string; disciplinaNome: string; sala: string | null; laboratorio: string | null };
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

// ─────────────────────────── AgendaWidget ────────────────────────────────────

function AgendaWidget({ agenda, agendaDisponivel, diaSemana }: { agenda: DiaAgenda[]; agendaDisponivel: boolean; diaSemana: number }) {
  const byDia = new Map(agenda.map((d) => [d.dia, d]));

  if (!agendaDisponivel)
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <CalendarDays className="w-8 h-8 text-indigo-200" />
        <p className="text-sm text-muted-foreground">Horário de aulas não disponível ainda.</p>
        <p className="text-xs text-muted-foreground">Em breve a grade horária será publicada.</p>
      </div>
    );

  return (
    <DiaTabs diaSemana={diaSemana} accentColor="#4f46e5">
      {(aba) => {
        const dia = byDia.get(aba);
        if (!dia || dia.aulas.length === 0)
          return <p className="text-sm text-muted-foreground text-center py-6">Sem aulas programadas.</p>;
        return (
          <div className="space-y-2">
            {dia.aulas.map((a, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg border border-indigo-100 bg-white px-3 py-2.5 shadow-sm">
                <div className="text-right min-w-[70px]">
                  <p className="text-xs font-bold text-indigo-600">{String(a.horaInicio).substring(0, 5)}</p>
                  <p className="text-xs text-slate-400">{String(a.horaFim).substring(0, 5)}</p>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-700">{a.disciplinaNome}</p>
                  {(a.sala || a.laboratorio) && (
                    <p className="text-xs text-slate-400">
                      {a.laboratorio ? `Lab. ${a.laboratorio}` : `Sala ${a.sala}`}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        );
      }}
    </DiaTabs>
  );
}

// ─────────────────────────── CardapioWidget ──────────────────────────────────

function CardapioWidget({ cardapio, cardapioDisponivel, diaSemana }: { cardapio: DiaCardapio[]; cardapioDisponivel: boolean; diaSemana: number }) {
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

      {/* Grid principal */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">

        {/* Ocorrências */}
        <Card className="shadow-sm border-border/50 md:col-span-1">
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

        {/* Agenda */}
        <Card className="shadow-sm border-border/50 md:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-indigo-400" />
              Agenda da Semana
              {!agendaDisponivel && <Badge variant="outline" className="text-xs ml-auto">Em breve</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AgendaWidget agenda={agenda} agendaDisponivel={agendaDisponivel} diaSemana={diaSemana} />
          </CardContent>
        </Card>

        {/* Cardápio */}
        <Card className="shadow-sm border-amber-100 md:col-span-2 xl:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <UtensilsCrossed className="w-4 h-4 text-amber-500" />
              Cardápio da Semana
              {!cardapioDisponivel && <Badge variant="outline" className="text-xs ml-auto">Em breve</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CardapioWidget cardapio={cardapio} cardapioDisponivel={cardapioDisponivel} diaSemana={diaSemana} />
          </CardContent>
        </Card>
      </div>

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

// ─────────────────────────── DashboardAdmin ──────────────────────────────────

function DashboardAdmin() {
  const { data: stats, isLoading } = useGetStats();
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
      <Card className="shadow-sm border-border/50 max-w-2xl">
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
    </div>
  );
}

// ─────────────────────────── export default ──────────────────────────────────

export default function Dashboard() {
  const { user } = useAuth();
  const roles = user?.roles ?? [];
  const isEstudante = roles.includes("estudante");
  const isPaiResponsavel = roles.includes("pai_responsavel");

  if (isEstudante || isPaiResponsavel) return <DashboardEstudante user={user} />;
  return <DashboardAdmin />;
}
