import { useState } from "react";
import { useListTurmas, useListTurnos } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { GraduationCap, Plus, Trash2, UserCheck, ChevronDown, ChevronRight } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ApiError } from "@workspace/api-client-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Matricula = {
  id: string;
  usuarioId: string;
  turmaId: string;
  turmaSigla: string;
  cursoId: string;
  cursoNome: string;
  registro: string;
  ano: number;
  semestre: number;
  principal: boolean;
  ativo: boolean;
  criadoEm: string;
};

type Estudante = {
  id: string;
  nome: string | null;
  criadoEm: string;
  matriculas: Matricula[];
};

function apiMsg(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const data = err.data as { error?: string } | null;
    return data?.error ?? fallback;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

const anoAtual = new Date().getFullYear();
const semestresOptions = [1, 2];
const anosOptions = Array.from({ length: 6 }, (_, i) => anoAtual - 1 + i);

function MatriculaForm({ estudante, onSuccess }: { estudante: Estudante; onSuccess: () => void }) {
  const [turmaId, setTurmaId]   = useState("");
  const [registro, setRegistro] = useState("");
  const [ano, setAno]           = useState(String(anoAtual));
  const [semestre, setSemestre] = useState("1");
  const { data: turmas } = useListTurmas();
  const { toast } = useToast();

  const criar = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/matriculas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          usuarioId: estudante.id,
          turmaId,
          registro: registro.trim(),
          ano: Number(ano),
          semestre: Number(semestre),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw Object.assign(new Error(body.error ?? "Erro"), { data: body, status: res.status });
      }
      return res.json();
    },
    onSuccess: () => {
      setTurmaId(""); setRegistro(""); setAno(String(anoAtual)); setSemestre("1");
      toast({ title: "Estudante enturmado com sucesso" });
      onSuccess();
    },
    onError: (err) => toast({ title: "Erro ao enturmar", description: apiMsg(err, "Verifique os dados e tente novamente."), variant: "destructive" }),
  });

  const valid = turmaId && registro.trim() && /^\d+$/.test(registro.trim()) && ano && semestre;

  return (
    <form
      className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end pt-3 border-t"
      onSubmit={(e) => { e.preventDefault(); if (valid) criar.mutate(); }}
    >
      <div className="space-y-1 col-span-2 sm:col-span-1">
        <Label className="text-xs">Turma</Label>
        <Select value={turmaId} onValueChange={setTurmaId}>
          <SelectTrigger className="h-8 text-xs bg-background"><SelectValue placeholder="Selecione…" /></SelectTrigger>
          <SelectContent>
            {turmas?.map((t) => (
              <SelectItem key={t.id} value={t.id} className="text-xs">
                {t.sigla} — {(t as { cursoNome?: string }).cursoNome ?? ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Registro</Label>
        <Input value={registro} onChange={(e) => setRegistro(e.target.value)} placeholder="Ex: 12345" className="h-8 text-xs bg-background" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Ano / Semestre</Label>
        <div className="flex gap-1">
          <Select value={ano} onValueChange={setAno}>
            <SelectTrigger className="h-8 text-xs bg-background w-24"><SelectValue /></SelectTrigger>
            <SelectContent>{anosOptions.map((a) => <SelectItem key={a} value={String(a)} className="text-xs">{a}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={semestre} onValueChange={setSemestre}>
            <SelectTrigger className="h-8 text-xs bg-background w-16"><SelectValue /></SelectTrigger>
            <SelectContent>{semestresOptions.map((s) => <SelectItem key={s} value={String(s)} className="text-xs">{s}º</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <Button type="submit" size="sm" className="h-8 text-xs" disabled={!valid || criar.isPending}>
        <Plus className="w-3 h-3 mr-1" />Enturmar
      </Button>
    </form>
  );
}

function EstudanteCard({ estudante, onRefresh }: { estudante: Estudante; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const { toast } = useToast();

  const excluir = useMutation({
    mutationFn: async (matriculaId: string) => {
      const res = await fetch(`${BASE}/api/matriculas/${matriculaId}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw Object.assign(new Error(body.error ?? "Erro"), { data: body });
      }
    },
    onSuccess: () => { toast({ title: "Matrícula removida" }); onRefresh(); },
    onError: (err) => toast({ title: "Erro ao remover matrícula", description: apiMsg(err, "Tente novamente."), variant: "destructive" }),
  });

  const ativas = estudante.matriculas.filter((m) => m.ativo);

  return (
    <div className="border rounded-lg bg-card shadow-sm overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="p-2 bg-emerald-100 text-emerald-700 rounded-md shrink-0">
          <UserCheck className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{estudante.nome ?? "Sem nome"}</p>
          <p className="text-xs text-muted-foreground">
            {ativas.length === 0
              ? "Sem enturmação ativa"
              : `${ativas.length} enturmação${ativas.length > 1 ? "ões" : ""} ativa${ativas.length > 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {ativas.map((m) => (
            <Badge key={m.id} variant="secondary" className="text-xs hidden sm:flex">
              {m.turmaSigla} · {m.ano}/{m.semestre}º
              {!m.principal && <span className="ml-1 text-amber-600">(comp.)</span>}
            </Badge>
          ))}
          {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {ativas.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Matrículas ativas</p>
              {ativas.map((m) => (
                <div key={m.id} className="flex items-center gap-3 p-3 rounded-md border bg-muted/20 text-sm">
                  <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <span><span className="text-muted-foreground">Turma:</span> <strong>{m.turmaSigla}</strong></span>
                    <span><span className="text-muted-foreground">Curso:</span> {m.cursoNome}</span>
                    <span><span className="text-muted-foreground">Período:</span> {m.ano}/{m.semestre}º sem.</span>
                    <span>
                      <span className="text-muted-foreground">Registro:</span> {m.registro}
                      {m.principal
                        ? <Badge variant="outline" className="ml-1 text-[10px] py-0 h-4">principal</Badge>
                        : <Badge variant="outline" className="ml-1 text-[10px] py-0 h-4 text-amber-600 border-amber-300">complementar</Badge>
                      }
                    </span>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10 shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remover matrícula?</AlertDialogTitle>
                        <AlertDialogDescription>
                          O estudante <strong>{estudante.nome}</strong> será desenturmado da turma <strong>{m.turmaSigla}</strong> no {m.semestre}º semestre de {m.ano}.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => excluir.mutate(m.id)} className="bg-destructive hover:bg-destructive/90">Remover</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
          )}

          <MatriculaForm estudante={estudante} onSuccess={onRefresh} />
        </div>
      )}
    </div>
  );
}

export default function EnturmacaoPage() {
  const queryClient = useQueryClient();

  const { data: estudantes, isLoading } = useQuery<Estudante[]>({
    queryKey: ["matriculas"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/matriculas`, { credentials: "include" });
      if (!res.ok) throw new Error("Erro ao carregar estudantes");
      return res.json();
    },
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["matriculas"] });

  const [busca, setBusca] = useState("");
  const filtrados = (estudantes ?? []).filter((e) =>
    !busca || (e.nome ?? "").toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-primary">Enturmação</h1>
        <p className="text-muted-foreground mt-2">
          Gerencie a enturmação dos estudantes. Cada estudante pode ter até 2 turmas por semestre no mesmo curso (1 principal + 1 complementar).
        </p>
      </div>

      <div className="flex gap-3">
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar estudante…"
          className="max-w-sm bg-background"
        />
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />)}
          </div>
        ) : filtrados.length === 0 ? (
          <div className="text-center py-12 border border-dashed rounded-lg bg-card">
            <GraduationCap className="w-12 h-12 text-muted-foreground opacity-30 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">
              {busca ? "Nenhum estudante encontrado para esta busca." : "Nenhum usuário com perfil de estudante cadastrado."}
            </p>
            {!busca && (
              <p className="text-xs text-muted-foreground mt-1">
                Cadastre um usuário e atribua o perfil <strong>estudante</strong>.
              </p>
            )}
          </div>
        ) : (
          filtrados.map((e) => (
            <EstudanteCard key={e.id} estudante={e} onRefresh={refresh} />
          ))
        )}
      </div>
    </div>
  );
}
