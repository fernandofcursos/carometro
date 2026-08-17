import { useState } from "react";
import { Link } from "wouter";
import {
  useGetCarometro, useListTurnos, useListTurmas, useListCursos,
  useListTiposOcorrencias,
} from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Camera, Filter, AlertTriangle, Save, CheckCircle2, Clock, Send, ChevronDown, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth, useHasPermission, useHasRole } from "@/contexts/auth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const hoje = new Date().toISOString().slice(0, 10);

// ── Funções utilitárias ───────────────────────────────────────────────────────

function calcularIdade(dataNascimento: string): number {
  const nasc = new Date(dataNascimento);
  const hoje_ = new Date();
  let idade = hoje_.getFullYear() - nasc.getFullYear();
  const m = hoje_.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje_.getDate() < nasc.getDate())) idade--;
  return idade;
}

function isMenor(dataNascimento: string | null): boolean {
  if (!dataNascimento) return false;
  return calcularIdade(dataNascimento) < 18;
}

function formatarData(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit", month: "long", year: "numeric",
  });
}

// ── Tipos ─────────────────────────────────────────────────────────────────────

type EstudanteCard = {
  id: string;
  nome: string;
  registro: string;
  dataNascimento: string | null;
  fotoUrl: string | null;
  turmaId: string;
  turmaSigla: string;
  turmaDescricao: string;
  cursoId: string;
  cursoNome: string;
  turnoId: string;
  turnoNome: string;
};

type CarometroGroup = {
  turmaId: string;
  turmaSigla: string;
  turmaDescricao: string;
  cursoId: string;
  cursoNome: string;
  turnoId: string;
  turnoNome: string;
  estudantes: EstudanteCard[];
};

type Ocorrencia = {
  id: string;
  dataOcorrencia: string;
  criadoEm: string;
  observacao: string | null;
  tipoDescricao: string | null;
  disciplinaNome: string | null;
  turnoNome: string | null;
  cienteEm: string | null;
  cientePorId: string | null;
  notificacaoPaisEnviadaEm: string | null;
};

// ── Lista de ocorrências ──────────────────────────────────────────────────────

function OcorrenciaItem({
  ocorrencia,
  isPaiResponsavel,
  isEstudante,
  estudanteMenor,
  onCiente,
  onNotificar,
  canCreate,
  onDelete,
}: {
  ocorrencia: Ocorrencia;
  isPaiResponsavel: boolean;
  isEstudante: boolean;
  estudanteMenor: boolean;
  onCiente: (id: string) => void;
  onNotificar: (id: string) => void;
  canCreate: boolean;
  onDelete: (id: string) => void;
}) {
  const [expandido, setExpandido] = useState(false);
  const jaTemCiencia = !!ocorrencia.cienteEm;
  // Menor de idade: somente pai/responsável pode dar ciência
  const podeMarcarCiente = isPaiResponsavel || (isEstudante && !estudanteMenor);

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setExpandido((v) => !v)}
      >
        <div className="shrink-0 mt-0.5">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{ocorrencia.tipoDescricao ?? "Ocorrência"}</p>
          <p className="text-xs text-muted-foreground">
            {formatarData(ocorrencia.dataOcorrencia)}
            {ocorrencia.turnoNome && ` · ${ocorrencia.turnoNome}`}
            {ocorrencia.disciplinaNome && ` · ${ocorrencia.disciplinaNome}`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {jaTemCiencia ? (
            <Badge variant="outline" className="text-xs border-green-600 text-green-700 gap-1">
              <CheckCircle2 className="w-3 h-3" />Ciente
            </Badge>
          ) : isPaiResponsavel ? (
            <Badge variant="outline" className="text-xs border-amber-500 text-amber-700">Pendente</Badge>
          ) : null}
          {expandido ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {expandido && (
        <div className="px-3 pb-3 space-y-3 border-t pt-3 bg-muted/10">
          {ocorrencia.observacao && (
            <p className="text-sm text-foreground/80 leading-relaxed">{ocorrencia.observacao}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Registrada em {new Date(ocorrencia.criadoEm).toLocaleString("pt-BR")}
            {ocorrencia.notificacaoPaisEnviadaEm && (
              <span className="ml-2 text-blue-600">· Responsáveis notificados</span>
            )}
          </p>
          {jaTemCiencia && (
            <p className="text-xs text-green-700">
              Ciência registrada em {new Date(ocorrencia.cienteEm!).toLocaleString("pt-BR")}
            </p>
          )}

          <div className="flex gap-2 flex-wrap">
            {podeMarcarCiente && !jaTemCiencia && (
              <Button
                size="sm"
                className="h-7 text-xs bg-green-600 hover:bg-green-700"
                onClick={() => onCiente(ocorrencia.id)}
              >
                <CheckCircle2 className="w-3 h-3 mr-1" />Marcar como Ciente
              </Button>
            )}
            {isEstudante && estudanteMenor && !jaTemCiencia && (
              <p className="text-xs text-orange-600">A ciência deve ser registrada pelo responsável.</p>
            )}
            {canCreate && !ocorrencia.notificacaoPaisEnviadaEm && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => onNotificar(ocorrencia.id)}
              >
                <Send className="w-3 h-3 mr-1" />Notificar responsáveis
              </Button>
            )}
            {canCreate && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-destructive hover:bg-destructive/10"
                onClick={() => onDelete(ocorrencia.id)}
              >
                Excluir
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Modal do estudante (ocorrências + formulário) ─────────────────────────────

function EstudanteModal({
  estudante,
  onClose,
}: {
  estudante: EstudanteCard;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canCreate    = useHasPermission("ocorrencias:create");
  const isPaiResp    = useHasRole("pai_responsavel");
  const isEstudante  = useHasRole("estudante");
  const estudanteMenor = isMenor(estudante.dataNascimento);

  // Form state
  const [dataOcorrencia, setDataOcorrencia] = useState(hoje);
  const [tipoId, setTipoId]     = useState("");
  const [disciplinaOfertaId, setDisciplinaOfertaId] = useState("__none__");
  const [observacao, setObservacao] = useState("");
  const [enviarEmail, setEnviarEmail] = useState(false);

  const { data: tipos } = useListTiposOcorrencias({ status: "ativo" } as Parameters<typeof useListTiposOcorrencias>[0]);
  const { data: turnos } = useListTurnos();

  const disciplinasUsuario = user?.disciplinas ?? [];

  // Fetch existing occurrences for this student
  const ocorrenciasKey = ["ocorrencias", "estudante", estudante.id];
  const { data: ocorrencias = [], refetch: refetchOcorrencias } = useQuery<Ocorrencia[]>({
    queryKey: ocorrenciasKey,
    queryFn: async () => {
      const endpoint = canCreate
        ? `${BASE}/api/ocorrencias?estudanteId=${estudante.id}`
        : `${BASE}/api/ocorrencias/estudante/${estudante.id}`;
      const res = await fetch(endpoint, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Derived discipline info
  const disciplinaSelecionada = disciplinasUsuario.find((d) => d.ofertaId === disciplinaOfertaId);
  const turnoIdDerived = disciplinaSelecionada?.turnoId ?? null;
  const turnoNomeDerived = disciplinaSelecionada?.turnoNome ?? null;

  const hojeFormatado = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  const menor = isMenor(estudante.dataNascimento);

  // Registrar ocorrência
  const criarMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        estudanteId: estudante.id,
        tipoOcorrenciaId: tipoId,
        disciplinaId: disciplinaSelecionada?.disciplinaId ?? null,
        turnoId: turnoIdDerived,
        dataOcorrencia,
        observacao: observacao.trim() || null,
        enviarEmailPais: menor && enviarEmail,
      };
      const res = await fetch(`${BASE}/api/ocorrencias`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Erro ao registrar");
      return body;
    },
    onSuccess: () => {
      setTipoId(""); setDisciplinaOfertaId("__none__"); setObservacao(""); setEnviarEmail(false);
      toast({ title: "Ocorrência registrada com sucesso" });
      refetchOcorrencias();
      queryClient.invalidateQueries({ queryKey: ["ocorrencias"] });
    },
    onError: (err) => toast({
      title: "Erro ao registrar ocorrência",
      description: err instanceof Error ? err.message : "Tente novamente.",
      variant: "destructive",
    }),
  });

  // Marcar ciência
  const cienteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${BASE}/api/ocorrencias/${id}/ciente`, {
        method: "POST", credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Erro");
      return body;
    },
    onSuccess: () => { toast({ title: "Ciência registrada" }); refetchOcorrencias(); },
    onError: (err) => toast({
      title: "Erro ao registrar ciência",
      description: err instanceof Error ? err.message : "Tente novamente.",
      variant: "destructive",
    }),
  });

  // Notificar responsáveis
  const notificarMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${BASE}/api/ocorrencias/${id}/notificar-pais`, {
        method: "POST", credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Erro");
      return body;
    },
    onSuccess: () => { toast({ title: "Responsáveis notificados por e-mail" }); refetchOcorrencias(); },
    onError: (err) => toast({
      title: "Erro ao notificar",
      description: err instanceof Error ? err.message : "Tente novamente.",
      variant: "destructive",
    }),
  });

  // Excluir ocorrência
  const excluirMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${BASE}/api/ocorrencias/${id}`, {
        method: "DELETE", credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Erro");
      return body;
    },
    onSuccess: () => { toast({ title: "Ocorrência excluída" }); refetchOcorrencias(); },
    onError: (err) => toast({
      title: "Erro ao excluir",
      description: err instanceof Error ? err.message : "Tente novamente.",
      variant: "destructive",
    }),
  });

  const formValido = !!tipoId && !!dataOcorrencia && (!observacao || observacao.length <= 300);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0">
        {/* Header fixo */}
        <div className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-lg overflow-hidden bg-muted shrink-0 flex items-center justify-center">
              {estudante.fotoUrl ? (
                <img src={estudante.fotoUrl} alt={estudante.nome} className="w-full h-full object-cover" />
              ) : (
                <span className="text-xl font-semibold text-muted-foreground">
                  {estudante.nome.substring(0, 2).toUpperCase()}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold truncate">{estudante.nome}</h2>
              <p className="text-sm text-muted-foreground font-mono">{estudante.registro}</p>
              <div className="flex flex-wrap gap-2 mt-1.5">
                <Badge variant="secondary" className="text-xs">{estudante.turmaSigla}</Badge>
                <Badge variant="outline" className="text-xs">{estudante.turnoNome}</Badge>
                <Badge variant="outline" className="text-xs text-violet-700 border-violet-300">{estudante.cursoNome}</Badge>
                {menor && (
                  <Badge className="text-xs bg-orange-100 text-orange-700 border-orange-300">Menor de idade</Badge>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Conteúdo com scroll */}
        <div className="flex-1 overflow-y-auto">
          {canCreate ? (
            <Tabs defaultValue="registrar" className="h-full">
              <TabsList className="w-full rounded-none border-b h-10">
                <TabsTrigger value="registrar" className="flex-1 text-xs">Registrar Ocorrência</TabsTrigger>
                <TabsTrigger value="historico" className="flex-1 text-xs">
                  Histórico {ocorrencias.length > 0 && `(${ocorrencias.length})`}
                </TabsTrigger>
              </TabsList>

              {/* Tab: Registrar */}
              <TabsContent value="registrar" className="px-6 py-4 space-y-4 mt-0">
                <div className="rounded-md bg-muted/40 border px-4 py-3 grid grid-cols-2 gap-y-1 text-xs">
                  <span className="text-muted-foreground font-medium">Data de Registro (servidor)</span>
                  <span className="font-medium">{hojeFormatado}</span>
                  {user && (
                    <>
                      <span className="text-muted-foreground font-medium">Registrado por</span>
                      <span>{user.nome ?? user.email}</span>
                    </>
                  )}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Data da Ocorrência *</Label>
                  <Input
                    type="date"
                    value={dataOcorrencia}
                    onChange={(e) => setDataOcorrencia(e.target.value)}
                    max={hoje}
                    required
                    className="h-8 text-xs"
                  />
                </div>

                {disciplinasUsuario.length > 0 && (
                  <div className="space-y-1">
                    <Label className="text-xs">Disciplina — Turno</Label>
                    <Select value={disciplinaOfertaId} onValueChange={setDisciplinaOfertaId}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Selecione a disciplina (opcional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__" className="text-xs">Nenhuma disciplina</SelectItem>
                        {disciplinasUsuario.map((d) => (
                          <SelectItem key={d.ofertaId} value={d.ofertaId} className="text-xs">
                            {d.disciplinaNome}
                            <span className="text-muted-foreground ml-1 text-xs">— {d.turnoNome}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {turnoNomeDerived && (
                      <p className="text-xs text-muted-foreground">Turno: <strong>{turnoNomeDerived}</strong></p>
                    )}
                  </div>
                )}

                {disciplinasUsuario.length === 0 && turnos && turnos.length > 0 && (
                  <div className="space-y-1">
                    <Label className="text-xs">Turno</Label>
                    <Select
                      value={disciplinaOfertaId}
                      onValueChange={setDisciplinaOfertaId}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Selecione o turno (opcional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__" className="text-xs">Não especificado</SelectItem>
                        {turnos.map((t) => (
                          <SelectItem key={t.id} value={t.id} className="text-xs">{t.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-1">
                  <Label className="text-xs">Tipo de Ocorrência *</Label>
                  <Select value={tipoId} onValueChange={setTipoId}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Selecione o tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {!tipos?.length
                        ? <SelectItem value="__empty__" disabled className="text-xs">Nenhum tipo cadastrado</SelectItem>
                        : tipos.map((t) => <SelectItem key={t.id} value={t.id} className="text-xs">{t.descricao}</SelectItem>)
                      }
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Descrição da Ocorrência</Label>
                    <span className={`text-xs ${observacao.length > 280 ? "text-amber-600" : "text-muted-foreground"}`}>
                      {observacao.length}/300
                    </span>
                  </div>
                  <Textarea
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value.slice(0, 300))}
                    placeholder="Descreva detalhadamente o ocorrido..."
                    rows={3}
                    className="resize-none text-xs"
                    maxLength={300}
                  />
                </div>

                {menor && (
                  <div className="flex items-start gap-3 rounded-lg border border-orange-200 px-4 py-3 bg-orange-50">
                    <Checkbox
                      id="enviar-email"
                      checked={enviarEmail}
                      onCheckedChange={(v) => setEnviarEmail(!!v)}
                      className="mt-0.5"
                    />
                    <div>
                      <Label htmlFor="enviar-email" className="font-medium cursor-pointer text-xs">
                        Notificar responsável por e-mail
                      </Label>
                      <p className="text-xs text-orange-700 mt-0.5">
                        Estudante menor de idade. Envia a ocorrência para os e-mails de responsável cadastrados.
                      </p>
                    </div>
                  </div>
                )}

                <Button
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white h-9 text-sm"
                  disabled={!formValido || criarMutation.isPending}
                  onClick={() => criarMutation.mutate()}
                >
                  <Save className="w-4 h-4 mr-2" />
                  {criarMutation.isPending ? "Registrando..." : "Registrar Ocorrência"}
                </Button>
              </TabsContent>

              {/* Tab: Histórico */}
              <TabsContent value="historico" className="px-6 py-4 mt-0">
                <OcorrenciasList
                  ocorrencias={ocorrencias}
                  isPaiResponsavel={isPaiResp}
                  isEstudante={isEstudante}
                  estudanteMenor={estudanteMenor}
                  canCreate={canCreate}
                  onCiente={(id) => cienteMutation.mutate(id)}
                  onNotificar={(id) => notificarMutation.mutate(id)}
                  onDelete={(id) => excluirMutation.mutate(id)}
                />
              </TabsContent>
            </Tabs>
          ) : (
            /* Sem permissão de criação — mostra só histórico */
            <div className="px-6 py-4">
              <h3 className="text-sm font-semibold mb-3">Ocorrências</h3>
              <OcorrenciasList
                ocorrencias={ocorrencias}
                isPaiResponsavel={isPaiResp}
                isEstudante={isEstudante}
                estudanteMenor={estudanteMenor}
                canCreate={false}
                onCiente={(id) => cienteMutation.mutate(id)}
                onNotificar={() => {}}
                onDelete={() => {}}
              />
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t">
          <Button variant="ghost" onClick={onClose} className="h-8 text-xs">Fechar</Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
            <Link href={`/estudantes/${estudante.id}`}>Ver perfil completo</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OcorrenciasList({
  ocorrencias, isPaiResponsavel, isEstudante, estudanteMenor, canCreate,
  onCiente, onNotificar, onDelete,
}: {
  ocorrencias: Ocorrencia[];
  isPaiResponsavel: boolean;
  isEstudante: boolean;
  estudanteMenor: boolean;
  canCreate: boolean;
  onCiente: (id: string) => void;
  onNotificar: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (!ocorrencias.length) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
        Nenhuma ocorrência registrada.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {[...ocorrencias].reverse().map((o) => (
        <OcorrenciaItem
          key={o.id}
          ocorrencia={o}
          isPaiResponsavel={isPaiResponsavel}
          isEstudante={isEstudante}
          estudanteMenor={estudanteMenor}
          canCreate={canCreate}
          onCiente={onCiente}
          onNotificar={onNotificar}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function Carometro() {
  const [turnoFiltro, setTurnoFiltro]   = useState<string>("all");
  const [cursoFiltro, setCursoFiltro]   = useState<string>("all");
  const [turmaFiltro, setTurmaFiltro]   = useState<string>("all");
  const [busca, setBusca]               = useState("");
  const [selectedEstudante, setSelectedEstudante] = useState<EstudanteCard | null>(null);

  const canCreate  = useHasPermission("ocorrencias:create");
  const isPaiResp  = useHasRole("pai_responsavel");
  const isEstudante = useHasRole("estudante");
  const showOcorrenciaBtn = canCreate || isPaiResp || isEstudante;

  const { data: turnos } = useListTurnos();
  const { data: cursos } = useListCursos();
  const { data: turmas } = useListTurmas(
    (turnoFiltro !== "all" || cursoFiltro !== "all")
      ? { ...(turnoFiltro !== "all" && { turnoId: turnoFiltro }), ...(cursoFiltro !== "all" && { cursoId: cursoFiltro }) }
      : undefined
  );

  const params = {
    ...(turnoFiltro !== "all" && { turnoId: turnoFiltro }),
    ...(cursoFiltro !== "all" && { cursoId: cursoFiltro }),
    ...(turmaFiltro !== "all" && { turmaId: turmaFiltro }),
    ...(busca && { busca }),
  };

  const { data: rawGroups, isLoading } = useGetCarometro(
    Object.keys(params).length > 0 ? params : undefined,
    { query: { queryKey: ["/api/carometro", params] } }
  );

  const handleTurnoChange = (val: string) => { setTurnoFiltro(val); setTurmaFiltro("all"); };
  const handleCursoChange = (val: string) => { setCursoFiltro(val); setTurmaFiltro("all"); };

  // Agrupar por turno → curso
  const groups = (rawGroups ?? []) as CarometroGroup[];
  const byTurno: Record<string, Record<string, CarometroGroup[]>> = {};
  for (const g of groups) {
    const t = g.turnoNome || "Sem turno";
    const c = g.cursoNome || "Sem curso";
    if (!byTurno[t]) byTurno[t] = {};
    if (!byTurno[t][c]) byTurno[t][c] = [];
    byTurno[t][c].push(g);
  }
  const turnoNomes = Object.keys(byTurno).sort();

  return (
    <div className="space-y-8">
      {/* Cabeçalho + filtros */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">Carômetro — Estudantes</h1>
          <p className="text-muted-foreground mt-2">Registro fotográfico por turno e curso.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Filter className="w-4 h-4 text-muted-foreground hidden sm:block" />
          <Select value={turnoFiltro} onValueChange={handleTurnoChange}>
            <SelectTrigger className="w-[150px] bg-background h-8 text-xs"><SelectValue placeholder="Turno" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Todos os turnos</SelectItem>
              {turnos?.map((t) => <SelectItem key={t.id} value={t.id} className="text-xs">{t.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={cursoFiltro} onValueChange={handleCursoChange}>
            <SelectTrigger className="w-[160px] bg-background h-8 text-xs"><SelectValue placeholder="Curso" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Todos os cursos</SelectItem>
              {cursos?.map((c) => <SelectItem key={c.id} value={c.id} className="text-xs">{c.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={turmaFiltro} onValueChange={setTurmaFiltro}>
            <SelectTrigger className="w-[140px] bg-background h-8 text-xs"><SelectValue placeholder="Turma" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Todas as turmas</SelectItem>
              {turmas?.map((t) => <SelectItem key={t.id} value={t.id} className="text-xs">{t.sigla}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar estudante..."
            className="w-[180px] h-8 text-xs bg-background"
          />
        </div>
      </div>

      {/* Conteúdo */}
      {isLoading ? (
        <div className="space-y-8">
          {[1, 2].map((i) => (
            <div key={i} className="space-y-4">
              <Skeleton className="h-8 w-48" />
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2">
                {[1, 2, 3, 4, 5, 6].map((j) => <Skeleton key={j} className="aspect-[3/4] rounded-xl" />)}
              </div>
            </div>
          ))}
        </div>
      ) : turnoNomes.length === 0 ? (
        <div className="py-20 text-center flex flex-col items-center border rounded-xl bg-card border-dashed">
          <Camera className="w-12 h-12 text-muted-foreground opacity-30 mb-4" />
          <h3 className="text-lg font-semibold">Nenhum estudante encontrado</h3>
          <p className="text-muted-foreground max-w-sm mt-1">Não há estudantes para os filtros selecionados.</p>
        </div>
      ) : (
        <div className="space-y-12">
          {turnoNomes.map((turnoNome) => {
            const cursoNomes = Object.keys(byTurno[turnoNome]).sort();
            return (
              <div key={turnoNome} className="space-y-8">
                {/* Cabeçalho do turno */}
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-bold">{turnoNome}</h2>
                  <Badge variant="outline" className="text-sm">{
                    cursoNomes.reduce((acc, c) => acc + byTurno[turnoNome][c].reduce((s, g) => s + g.estudantes.length, 0), 0)
                  } estudantes</Badge>
                </div>

                {cursoNomes.map((cursoNome) => {
                  const turmaGroups = byTurno[turnoNome][cursoNome];
                  return (
                    <div key={cursoNome} className="space-y-4 pl-4 border-l-2 border-violet-200">
                      <h3 className="text-lg font-semibold text-violet-800">{cursoNome}</h3>
                      {turmaGroups.map((group) => (
                        <div key={group.turmaId} className="space-y-3">
                          <div className="flex items-center gap-2">
                            <span className="text-base font-semibold">{group.turmaSigla}</span>
                            {group.turmaDescricao && (
                              <span className="text-sm text-muted-foreground">{group.turmaDescricao}</span>
                            )}
                            <span className="text-sm text-muted-foreground ml-auto">
                              {group.estudantes.length} estudante{group.estudantes.length !== 1 && "s"}
                            </span>
                          </div>
                          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2">
                            {group.estudantes.map((est) => (
                              <EstudanteCardItem
                                key={est.id}
                                estudante={{ ...est, turmaSigla: group.turmaSigla, turmaDescricao: group.turmaDescricao, turmaId: group.turmaId, cursoId: group.cursoId, cursoNome: group.cursoNome, turnoId: group.turnoId, turnoNome }}
                                showOcorrenciaBtn={showOcorrenciaBtn}
                                canCreate={canCreate}
                                onOcorrencia={setSelectedEstudante}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {selectedEstudante && (
        <EstudanteModal
          estudante={selectedEstudante}
          onClose={() => setSelectedEstudante(null)}
        />
      )}
    </div>
  );
}

function EstudanteCardItem({
  estudante, showOcorrenciaBtn, canCreate, onOcorrencia,
}: {
  estudante: EstudanteCard;
  showOcorrenciaBtn: boolean;
  canCreate: boolean;
  onOcorrencia: (e: EstudanteCard) => void;
}) {
  const menor = isMenor(estudante.dataNascimento);

  return (
    <Card className="overflow-hidden border-border/60 bg-card flex flex-col">
      <Link href={`/estudantes/${estudante.id}`} className="block">
        <div className="aspect-[3/4] relative bg-secondary/30 flex items-center justify-center overflow-hidden group cursor-pointer hover:opacity-90 transition-opacity">
          {estudante.fotoUrl ? (
            <img src={estudante.fotoUrl} alt={estudante.nome} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
          ) : (
            <Avatar className="w-10 h-10 shadow-sm border border-background">
              <AvatarFallback className="text-xs font-medium bg-primary/10 text-primary">
                {estudante.nome.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          )}
          {menor && (
            <span className="absolute top-0.5 right-0.5 bg-orange-500/90 text-white text-[8px] px-1 py-0 rounded-full font-medium leading-4">
              M
            </span>
          )}
        </div>
        <div className="px-1 pt-1 pb-0.5">
          <p className="text-[10px] font-semibold truncate hover:text-primary transition-colors leading-tight">{estudante.nome}</p>
          <p className="text-[9px] text-muted-foreground truncate leading-tight">{estudante.registro}</p>
        </div>
      </Link>
      {showOcorrenciaBtn && (
        <div className="px-1 pb-1 pt-0.5 mt-auto">
          <Button
            size="sm"
            variant="outline"
            className={`w-full h-5 text-[9px] gap-0.5 px-1 ${canCreate ? "border-amber-200 text-amber-700 hover:bg-amber-50 hover:border-amber-400" : "border-muted-foreground/30 text-muted-foreground hover:bg-muted"}`}
            onClick={() => onOcorrencia(estudante)}
          >
            <AlertTriangle className="w-2.5 h-2.5" />
            {canCreate ? "Ocorrência" : "Ver"}
          </Button>
        </div>
      )}
    </Card>
  );
}
