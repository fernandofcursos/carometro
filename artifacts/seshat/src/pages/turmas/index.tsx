import { useState } from "react";
import {
  useListTurmas, useListTurnos, useListCursos,
  useCreateTurma, useUpdateTurma, useDeleteTurma,
  getListTurmasQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Building, Plus, Trash2, Edit2, Check, X } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type Turma = {
  id: string; sigla: string; descricao: string;
  cursoId: string; cursoNome: string; turnoId: string; turnoNome: string;
};

function TurmaRow({ turma, onDelete }: { turma: Turma; onDelete: (id: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [sigla, setSigla] = useState(turma.sigla);
  const [descricao, setDescricao] = useState(turma.descricao);
  const [cursoId, setCursoId] = useState(turma.cursoId);
  const [turnoId, setTurnoId] = useState(turma.turnoId);

  const { data: turnos } = useListTurnos();
  const { data: cursos } = useListCursos();
  const updateTurma = useUpdateTurma();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const save = () => {
    if (!sigla.trim() || !descricao.trim() || !cursoId || !turnoId) return;
    updateTurma.mutate(
      { id: turma.id, data: { sigla: sigla.trim(), descricao: descricao.trim(), cursoId, turnoId } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTurmasQueryKey() });
          setEditing(false);
          toast({ title: "Turma atualizada" });
        },
        onError: () => toast({ title: "Erro ao atualizar turma", variant: "destructive" }),
      }
    );
  };

  const cancel = () => {
    setSigla(turma.sigla); setDescricao(turma.descricao);
    setCursoId(turma.cursoId); setTurnoId(turma.turnoId);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="p-4 border rounded-lg bg-muted/30 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Sigla</Label>
            <Input value={sigla} onChange={(e) => setSigla(e.target.value)} placeholder="Ex: ES2024A" className="h-8 text-sm bg-background" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Descrição</Label>
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex: Engenharia 2024 Turma A" className="h-8 text-sm bg-background" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Curso</Label>
            <Select value={cursoId} onValueChange={setCursoId}>
              <SelectTrigger className="h-8 text-sm bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>{cursos?.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Turno</Label>
            <Select value={turnoId} onValueChange={setTurnoId}>
              <SelectTrigger className="h-8 text-sm bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>{turnos?.map((t) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={save} disabled={updateTurma.isPending} className="h-7 px-3 text-xs"><Check className="w-3 h-3 mr-1" />Salvar</Button>
          <Button size="sm" variant="ghost" onClick={cancel} className="h-7 px-3 text-xs"><X className="w-3 h-3 mr-1" />Cancelar</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:border-primary/30 transition-colors shadow-sm">
      <div className="w-20 shrink-0">
        <span className="font-bold text-sm tracking-tight">{turma.sigla}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{turma.descricao}</p>
        <div className="flex gap-2 mt-1">
          <span className="text-xs bg-violet-100 text-violet-700 px-2 rounded-full">{turma.cursoNome}</span>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(true)}><Edit2 className="w-3.5 h-3.5 text-muted-foreground" /></Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir turma?</AlertDialogTitle>
              <AlertDialogDescription>A turma "{turma.sigla} — {turma.descricao}" será permanentemente excluída.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => onDelete(turma.id)} className="bg-destructive hover:bg-destructive/90">Excluir</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

export default function TurmasList() {
  const [sigla, setSigla] = useState("");
  const [descricao, setDescricao] = useState("");
  const [selectedCursoId, setSelectedCursoId] = useState("");
  const [selectedTurnoId, setSelectedTurnoId] = useState("");

  const { data: turmas, isLoading } = useListTurmas();
  const { data: turnos } = useListTurnos();
  const { data: cursos } = useListCursos();
  const createTurma = useCreateTurma();
  const deleteTurma = useDeleteTurma();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sigla.trim() || !descricao.trim() || !selectedCursoId || !selectedTurnoId) return;
    createTurma.mutate(
      { data: { sigla: sigla.trim(), descricao: descricao.trim(), cursoId: selectedCursoId, turnoId: selectedTurnoId } },
      {
        onSuccess: () => {
          setSigla(""); setDescricao(""); setSelectedCursoId(""); setSelectedTurnoId("");
          queryClient.invalidateQueries({ queryKey: getListTurmasQueryKey() });
          toast({ title: "Turma criada com sucesso" });
        },
        onError: () => toast({ title: "Erro ao criar turma", variant: "destructive" }),
      }
    );
  };

  const handleDelete = (id: string) => {
    deleteTurma.mutate({ id }, {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListTurmasQueryKey() }); toast({ title: "Turma excluída" }); },
      onError: () => toast({ title: "Erro ao excluir turma", description: "Verifique se há estudantes nesta turma.", variant: "destructive" }),
    });
  };

  const groupedByTurno = turmas?.reduce((acc, t) => {
    if (!acc[t.turnoNome]) acc[t.turnoNome] = { turnoId: t.turnoId, turmas: [] };
    acc[t.turnoNome].turmas.push(t);
    return acc;
  }, {} as Record<string, { turnoId: string; turmas: typeof turmas }>) ?? {};

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-primary">Turmas</h1>
        <p className="text-muted-foreground mt-2">Gerencie as turmas por curso e turno.</p>
      </div>

      <Card className="border-border/50 shadow-sm">
        <CardHeader className="bg-muted/30 border-b"><CardTitle className="text-lg font-semibold">Adicionar Turma</CardTitle></CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <Input value={sigla} onChange={(e) => setSigla(e.target.value)} placeholder="Sigla (Ex: ES2024A)" className="bg-background" />
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Descrição da turma" className="bg-background" />
            <Select value={selectedCursoId} onValueChange={setSelectedCursoId}>
              <SelectTrigger className="bg-background"><SelectValue placeholder="Curso" /></SelectTrigger>
              <SelectContent>{cursos?.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={selectedTurnoId} onValueChange={setSelectedTurnoId}>
              <SelectTrigger className="bg-background"><SelectValue placeholder="Turno" /></SelectTrigger>
              <SelectContent>{turnos?.map((t) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}</SelectContent>
            </Select>
            <div className="sm:col-span-2 md:col-span-4">
              <Button type="submit" disabled={!sigla.trim() || !descricao.trim() || !selectedCursoId || !selectedTurnoId || createTurma.isPending}>
                <Plus className="w-4 h-4 mr-2" />Adicionar Turma
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-8">
        {isLoading ? (
          <div className="space-y-4">{[1, 2].map((i) => <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />)}</div>
        ) : Object.keys(groupedByTurno).length === 0 ? (
          <div className="text-center py-12 border border-dashed rounded-lg bg-card">
            <Building className="w-12 h-12 text-muted-foreground opacity-30 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">Nenhuma turma cadastrada.</p>
          </div>
        ) : (
          Object.entries(groupedByTurno).map(([turnoNome, { turmas: tList }]) => (
            <div key={turnoNome} className="space-y-3">
              <h2 className="text-xl font-bold text-foreground flex items-center gap-2 border-b pb-2">
                <span className="bg-primary/10 text-primary px-3 py-1 rounded-md text-sm font-semibold">Turno</span>
                {turnoNome}
                <span className="text-sm text-muted-foreground font-normal ml-1">({tList.length} turma{tList.length !== 1 && "s"})</span>
              </h2>
              <div className="space-y-2">
                {tList.map((t) => <TurmaRow key={t.id} turma={t} onDelete={handleDelete} />)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
