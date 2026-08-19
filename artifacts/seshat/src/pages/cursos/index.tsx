import { useState } from "react";
import { useListCursos, useCreateCurso, useUpdateCurso, useDeleteCurso, getListCursosQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { BookOpen, Plus, Trash2, Edit2, Check, X } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

function CursoRow({ curso, onDelete }: { curso: { id: string; sigla: string; nome: string }; onDelete: (id: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [sigla, setSigla] = useState(curso.sigla);
  const [nome, setNome] = useState(curso.nome);
  const updateCurso = useUpdateCurso();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const save = () => {
    if (!sigla.trim() || !nome.trim()) return;
    updateCurso.mutate(
      { id: curso.id, data: { sigla: sigla.trim().toUpperCase(), nome: nome.trim() } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCursosQueryKey() });
          setEditing(false);
          toast({ title: "Curso atualizado" });
        },
        onError: (err) => {
          const msg = (err as { data?: { error?: string } }).data?.error ?? "Erro ao atualizar curso";
          toast({ title: msg, variant: "destructive" });
        },
      }
    );
  };

  const cancel = () => { setSigla(curso.sigla); setNome(curso.nome); setEditing(false); };

  return (
    <div className="flex items-center justify-between p-4 rounded-lg border bg-card hover:border-primary/30 transition-colors shadow-sm gap-3">
      {editing ? (
        <>
          <div className="flex gap-2 flex-1">
            <Input
              value={sigla}
              onChange={(e) => setSigla(e.target.value.toUpperCase().slice(0, 4))}
              className="w-20 h-8 text-sm bg-background font-mono uppercase"
              placeholder="SIGLA"
              maxLength={4}
              onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }}
            />
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="flex-1 h-8 text-sm bg-background"
              placeholder="Nome do curso"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }}
            />
          </div>
          <div className="flex gap-1 shrink-0">
            <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600 hover:bg-green-50" onClick={save} disabled={updateCurso.isPending || !sigla.trim() || !nome.trim()}><Check className="w-4 h-4" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={cancel}><X className="w-4 h-4" /></Button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="p-2 bg-violet-100 text-violet-700 rounded-md shrink-0"><BookOpen className="w-5 h-5" /></div>
            <span className="font-mono font-bold text-sm text-muted-foreground w-12 shrink-0">{curso.sigla}</span>
            <span className="font-semibold text-base truncate">{curso.nome}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing(true)}><Edit2 className="w-4 h-4 text-muted-foreground" /></Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"><Trash2 className="w-4 h-4" /></Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir curso?</AlertDialogTitle>
                  <AlertDialogDescription>O curso "{curso.nome}" e todas as turmas associadas serão permanentemente excluídos.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onDelete(curso.id)} className="bg-destructive hover:bg-destructive/90">Excluir</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </>
      )}
    </div>
  );
}

export default function CursosList() {
  const [novaSigla, setNovaSigla] = useState("");
  const [novoCurso, setNovoCurso] = useState("");
  const { data: cursos, isLoading } = useListCursos();
  const createCurso = useCreateCurso();
  const deleteCurso = useDeleteCurso();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!novaSigla.trim() || !novoCurso.trim()) return;
    createCurso.mutate(
      { data: { sigla: novaSigla.trim().toUpperCase(), nome: novoCurso.trim() } },
      {
        onSuccess: () => {
          setNovaSigla("");
          setNovoCurso("");
          queryClient.invalidateQueries({ queryKey: getListCursosQueryKey() });
          toast({ title: "Curso criado com sucesso" });
        },
        onError: (err) => {
          const msg = (err as { data?: { error?: string } }).data?.error ?? "Erro ao criar curso";
          toast({ title: msg, variant: "destructive" });
        },
      }
    );
  };

  const handleDelete = (id: string) => {
    deleteCurso.mutate({ id }, {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListCursosQueryKey() }); toast({ title: "Curso excluído" }); },
      onError: () => toast({ title: "Erro ao excluir curso", description: "Verifique se há turmas associadas.", variant: "destructive" }),
    });
  };

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-primary">Cursos</h1>
        <p className="text-muted-foreground mt-2">Gerencie os cursos oferecidos pela instituição.</p>
      </div>

      <Card className="border-border/50 shadow-sm">
        <CardHeader className="bg-muted/30 border-b"><CardTitle className="text-lg font-semibold">Adicionar Curso</CardTitle></CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="flex gap-3">
              <div className="space-y-1">
                <Label htmlFor="sigla" className="text-xs text-muted-foreground">Sigla (máx. 4)</Label>
                <Input
                  id="sigla"
                  value={novaSigla}
                  onChange={(e) => setNovaSigla(e.target.value.toUpperCase().slice(0, 4))}
                  placeholder="INFO"
                  className="w-24 bg-background font-mono uppercase"
                  maxLength={4}
                  required
                />
              </div>
              <div className="space-y-1 flex-1">
                <Label htmlFor="nome" className="text-xs text-muted-foreground">Nome do curso</Label>
                <Input
                  id="nome"
                  value={novoCurso}
                  onChange={(e) => setNovoCurso(e.target.value)}
                  placeholder="Ex: Técnico em Informática"
                  className="bg-background"
                  required
                />
              </div>
            </div>
            <Button type="submit" disabled={!novaSigla.trim() || !novoCurso.trim() || createCurso.isPending}>
              <Plus className="w-4 h-4 mr-2" />Adicionar
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {isLoading ? (
          <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />)}</div>
        ) : cursos?.length === 0 ? (
          <div className="text-center py-12 border border-dashed rounded-lg bg-card">
            <BookOpen className="w-12 h-12 text-muted-foreground opacity-30 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">Nenhum curso cadastrado. Adicione o primeiro curso acima.</p>
          </div>
        ) : (
          cursos?.map((curso) => <CursoRow key={curso.id} curso={curso} onDelete={handleDelete} />)
        )}
      </div>
    </div>
  );
}
