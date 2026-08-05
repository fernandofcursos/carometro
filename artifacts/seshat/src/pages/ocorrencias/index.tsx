import { useState } from "react";
import {
  useListOcorrencias, useListTiposOcorrencias, useCreateOcorrencia,
  useDeleteOcorrencia, useListEstudantes, useListDisciplinas,
  getListOcorrenciasQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Plus, Trash2, Download } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function OcorrenciasPage() {
  const { user } = useAuth();
  const [estudanteId, setEstudanteId] = useState("all");
  const [tipoId, setTipoId] = useState("all");
  const [filtDisciplinaId, setFiltDisciplinaId] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [formEstudanteId, setFormEstudanteId] = useState("");
  const [formTipoId, setFormTipoId] = useState("");
  const [formDisciplinaId, setFormDisciplinaId] = useState("none");
  const [formData, setFormData] = useState("");
  const [formObs, setFormObs] = useState("");
  const [expDisciplinaId, setExpDisciplinaId] = useState("all");

  const { data: estudantes } = useListEstudantes();
  const { data: tipos } = useListTiposOcorrencias({ status: "ativo" });
  const { data: allDisciplinas } = useListDisciplinas();

  const canSeeAllDisciplinas = user?.permissions.includes("usuarios:manage") ?? false;

  const myDiscFilter: { id: string; nome: string }[] = user
    ? [...new Map((user.disciplinas ?? []).map((d) => [d.disciplinaId, { id: d.disciplinaId, nome: d.disciplinaNome }])).values()]
    : [];
  const allDiscFilter: { id: string; nome: string }[] = (allDisciplinas ?? []).map((d) => ({ id: d.id, nome: d.nome }));
  const disciplinasForFilter = canSeeAllDisciplinas ? allDiscFilter : myDiscFilter;

  const params: Record<string, unknown> = {};
  if (estudanteId !== "all") params.estudanteId = estudanteId;
  if (tipoId !== "all") params.tipoOcorrenciaId = tipoId;
  if (filtDisciplinaId !== "all") params.disciplinaId = filtDisciplinaId;

  const { data: ocorrencias, isLoading } = useListOcorrencias(
    Object.keys(params).length > 0 ? params as Parameters<typeof useListOcorrencias>[0] : undefined,
    { query: { queryKey: ["/api/ocorrencias", params] } }
  );

  const createOcorrencia = useCreateOcorrencia();
  const deleteOcorrencia = useDeleteOcorrencia();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formEstudanteId || !formTipoId || !formData) return;
    createOcorrencia.mutate(
      {
        data: {
          estudanteId: formEstudanteId,
          tipoOcorrenciaId: formTipoId,
          disciplinaId: formDisciplinaId === "none" ? null : formDisciplinaId,
          dataOcorrencia: formData,
          observacao: formObs || undefined,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListOcorrenciasQueryKey() });
          setShowForm(false);
          setFormEstudanteId(""); setFormTipoId(""); setFormDisciplinaId("none"); setFormData(""); setFormObs("");
          toast({ title: "Ocorrência registrada com sucesso" });
        },
        onError: () => toast({ title: "Erro ao registrar ocorrência", variant: "destructive" }),
      }
    );
  };

  const handleDelete = (id: string) => {
    deleteOcorrencia.mutate({ id }, {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListOcorrenciasQueryKey() }); toast({ title: "Ocorrência excluída" }); },
      onError: () => toast({ title: "Erro ao excluir", variant: "destructive" }),
    });
  };

  const handleExport = () => {
    const qs = new URLSearchParams();
    if (estudanteId !== "all") qs.set("estudanteId", estudanteId);
    if (expDisciplinaId !== "all") qs.set("disciplinaId", expDisciplinaId);
    const q = qs.toString();
    window.open(`${BASE}/api/ocorrencias/export${q ? `?${q}` : ""}`, "_blank");
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">Ocorrências</h1>
          <p className="text-muted-foreground mt-1">Registro de ocorrências vinculadas a estudantes.</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="w-4 h-4 mr-2" />Nova Ocorrência
        </Button>
      </div>

      {showForm && (
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="bg-muted/30 border-b"><CardTitle className="text-base">Registrar Ocorrência</CardTitle></CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Estudante *</Label>
                <Select value={formEstudanteId} onValueChange={setFormEstudanteId} required>
                  <SelectTrigger className="bg-background"><SelectValue placeholder="Selecione o estudante" /></SelectTrigger>
                  <SelectContent>{estudantes?.map((e) => <SelectItem key={e.id} value={e.id}>{e.nome} ({e.turmaSigla})</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tipo de Ocorrência *</Label>
                <Select value={formTipoId} onValueChange={setFormTipoId} required>
                  <SelectTrigger className="bg-background"><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                  <SelectContent>{tipos?.map((t) => <SelectItem key={t.id} value={t.id}>{t.descricao}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Disciplina</Label>
                <Select value={formDisciplinaId} onValueChange={setFormDisciplinaId}>
                  <SelectTrigger className="bg-background"><SelectValue placeholder="Selecione a disciplina" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem disciplina</SelectItem>
                    {(myDiscFilter.length > 0 ? myDiscFilter : allDiscFilter).map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Data da Ocorrência *</Label>
                <Input type="date" value={formData} onChange={(e) => setFormData(e.target.value)} required className="bg-background" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Observação</Label>
                <Textarea value={formObs} onChange={(e) => setFormObs(e.target.value)} placeholder="Descrição detalhada..." className="bg-background resize-none" rows={3} />
              </div>
              <div className="sm:col-span-2 flex gap-2">
                <Button type="submit" disabled={createOcorrencia.isPending || !formEstudanteId || !formTipoId || !formData}>
                  {createOcorrencia.isPending ? "Salvando..." : "Registrar"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card className="p-4 border-border/50 shadow-sm flex flex-wrap gap-3 items-end">
        <Select value={estudanteId} onValueChange={setEstudanteId}>
          <SelectTrigger className="w-[200px] bg-background"><SelectValue placeholder="Estudante" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os estudantes</SelectItem>
            {estudantes?.map((e) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={tipoId} onValueChange={setTipoId}>
          <SelectTrigger className="w-[200px] bg-background"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {tipos?.map((t) => <SelectItem key={t.id} value={t.id}>{t.descricao}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filtDisciplinaId} onValueChange={setFiltDisciplinaId}>
          <SelectTrigger className="w-[200px] bg-background"><SelectValue placeholder="Disciplina" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as disciplinas</SelectItem>
            {disciplinasForFilter.map((d) => <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>)}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <Select value={expDisciplinaId} onValueChange={setExpDisciplinaId}>
            <SelectTrigger className="w-[180px] bg-background h-9 text-sm"><SelectValue placeholder="Disciplina p/ export" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as disciplinas</SelectItem>
              {disciplinasForFilter.map((d) => <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" />Exportar XLSX
          </Button>
        </div>
      </Card>

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
        ) : ocorrencias?.length === 0 ? (
          <div className="text-center py-16">
            <AlertTriangle className="w-12 h-12 text-muted-foreground opacity-30 mx-auto mb-3" />
            <p className="font-medium">Nenhuma ocorrência encontrada</p>
            <p className="text-muted-foreground text-sm">Ajuste os filtros ou registre uma nova ocorrência.</p>
          </div>
        ) : (
          <div className="divide-y">
            {ocorrencias?.map((o) => (
              <div key={o.id} className="p-4 flex items-start gap-4 hover:bg-muted/30 transition-colors">
                <div className="p-2 bg-amber-100 text-amber-700 rounded-lg shrink-0 mt-0.5"><AlertTriangle className="w-4 h-4" /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-sm">{o.estudanteNome}</span>
                    <Badge variant="secondary" className="bg-amber-100 text-amber-800 text-xs">{o.tipoOcorrenciaDescricao}</Badge>
                    {o.disciplinaNome && (
                      <Badge variant="outline" className="text-xs text-violet-700 border-violet-200">{o.disciplinaNome}</Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {new Date(o.dataOcorrencia).toLocaleDateString("pt-BR", { timeZone: "UTC" })}
                    </span>
                  </div>
                  {o.observacao && <p className="text-sm text-muted-foreground mt-1">{o.observacao}</p>}
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10 shrink-0"><Trash2 className="w-4 h-4" /></Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir ocorrência?</AlertDialogTitle>
                      <AlertDialogDescription>Esta ocorrência de {o.estudanteNome} será permanentemente excluída.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDelete(o.id)} className="bg-destructive hover:bg-destructive/90">Excluir</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
