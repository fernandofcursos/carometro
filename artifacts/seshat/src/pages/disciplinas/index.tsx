import { useState } from "react";
import {
  useListDisciplinas, useCreateDisciplina, useUpdateDisciplina, useDeleteDisciplina,
  useListCursos, useListTurnos,
  getListDisciplinasQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { BookOpen, Plus, Trash2, Edit2, Check, X, Grid3X3 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type DisciplinaOferta = { id: string; disciplinaId: string; cursoId: string; cursoNome: string; turnoId: string; turnoNome: string };
type Disc = { id: string; nome: string; criadoEm: string; ofertas: DisciplinaOferta[] };
type Curso = { id: string; nome: string; criadoEm: string };
type Turno = { id: string; nome: string; criadoEm: string };

function OfertasModal({ disc, cursos, turnos, onClose }: {
  disc: Disc; cursos: Curso[]; turnos: Turno[]; onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(disc.ofertas.map((o) => `${o.cursoId}:${o.turnoId}`))
  );
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const toggle = (cursoId: string, turnoId: string) => {
    const key = `${cursoId}:${turnoId}`;
    const s = new Set(selected);
    if (s.has(key)) s.delete(key); else s.add(key);
    setSelected(s);
  };

  const save = async () => {
    setSaving(true);
    try {
      const ofertas = [...selected].map((key) => {
        const [cursoId, turnoId] = key.split(":");
        return { cursoId: cursoId!, turnoId: turnoId! };
      });
      const res = await fetch(`${BASE}/api/disciplinas/${disc.id}/ofertas`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ofertas }),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: getListDisciplinasQueryKey() });
        toast({ title: "Cursos e turnos atualizados" });
        onClose();
      } else {
        toast({ title: "Erro ao salvar", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro de conexão", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const isEmpty = cursos.length === 0 || turnos.length === 0;

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Grid3X3 className="w-4 h-4 text-violet-500" />
          Cursos e Turnos — {disc.nome}
        </DialogTitle>
      </DialogHeader>
      <div className="max-h-[60vh] overflow-y-auto py-2">
        {isEmpty ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {cursos.length === 0 ? "Nenhum curso cadastrado." : "Nenhum turno cadastrado."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border/50">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-muted/40">
                  <th className="text-left p-3 font-semibold text-foreground border-b border-border/50 min-w-[140px]">
                    Curso
                  </th>
                  {turnos.map((t) => (
                    <th key={t.id} className="p-3 text-center font-semibold text-foreground border-b border-border/50 whitespace-nowrap min-w-[100px]">
                      {t.nome}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cursos.map((c, ci) => (
                  <tr key={c.id} className={ci % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                    <td className="p-3 font-medium text-foreground border-r border-border/30">{c.nome}</td>
                    {turnos.map((t) => {
                      const checked = selected.has(`${c.id}:${t.id}`);
                      return (
                        <td key={t.id} className="p-3 text-center">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggle(c.id, t.id)}
                            className="mx-auto"
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="flex gap-2 pt-2">
        <Button onClick={save} disabled={saving || isEmpty} className="flex-1">
          {saving ? "Salvando..." : "Salvar"}
        </Button>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
      </div>
    </DialogContent>
  );
}

function DiscRow({ disc, cursos, turnos, onDelete }: {
  disc: Disc; cursos: Curso[]; turnos: Turno[]; onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [nome, setNome] = useState(disc.nome);
  const [showOfertas, setShowOfertas] = useState(false);
  const update = useUpdateDisciplina();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const save = () => {
    if (!nome.trim()) return;
    update.mutate({ id: disc.id, data: { nome: nome.trim() } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListDisciplinasQueryKey() });
        setEditing(false);
        toast({ title: "Disciplina atualizada" });
      },
      onError: () => toast({ title: "Erro ao atualizar disciplina", variant: "destructive" }),
    });
  };

  if (editing) {
    return (
      <div className="p-4 border rounded-lg bg-muted/20 flex items-center gap-3">
        <Input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="flex-1 bg-background h-8 text-sm"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") { setNome(disc.nome); setEditing(false); }
          }}
        />
        <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600 hover:bg-green-50" onClick={save} disabled={update.isPending}>
          <Check className="w-4 h-4" />
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setNome(disc.nome); setEditing(false); }}>
          <X className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-start gap-3 p-4 rounded-lg border bg-card hover:border-primary/30 transition-colors shadow-sm">
        <div className="p-2 bg-violet-100 text-violet-700 rounded-md shrink-0 mt-0.5">
          <BookOpen className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="font-medium">{disc.nome}</span>
          {disc.ofertas.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {disc.ofertas.map((o) => (
                <Badge key={o.id} variant="secondary" className="text-xs font-normal">
                  {o.cursoNome} / {o.turnoNome}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">Sem cursos/turnos configurados</p>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          <Button
            variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-violet-600 hover:bg-violet-50"
            title="Configurar cursos e turnos"
            onClick={() => setShowOfertas(true)}
          >
            <Grid3X3 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing(true)}>
            <Edit2 className="w-4 h-4 text-muted-foreground" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive">
                <Trash2 className="w-4 h-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir disciplina?</AlertDialogTitle>
                <AlertDialogDescription>
                  A disciplina "{disc.nome}" e todos os seus vínculos de cursos/turnos serão excluídos permanentemente.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => onDelete(disc.id)} className="bg-destructive hover:bg-destructive/90">
                  Excluir
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <Dialog open={showOfertas} onOpenChange={setShowOfertas}>
        {showOfertas && (
          <OfertasModal
            disc={disc}
            cursos={cursos}
            turnos={turnos}
            onClose={() => setShowOfertas(false)}
          />
        )}
      </Dialog>
    </>
  );
}

export default function DisciplinasPage() {
  const [nome, setNome] = useState("");
  const { data: disciplinas, isLoading } = useListDisciplinas();
  const { data: cursos } = useListCursos();
  const { data: turnos } = useListTurnos();
  const create = useCreateDisciplina();
  const del = useDeleteDisciplina();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const allCursos = (cursos ?? []) as Curso[];
  const allTurnos = (turnos ?? []) as Turno[];

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) return;
    create.mutate({ data: { nome: nome.trim() } }, {
      onSuccess: () => {
        setNome("");
        queryClient.invalidateQueries({ queryKey: getListDisciplinasQueryKey() });
        toast({ title: "Disciplina criada" });
      },
      onError: () => toast({ title: "Erro ao criar disciplina", variant: "destructive" }),
    });
  };

  const handleDelete = (id: string) => {
    del.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListDisciplinasQueryKey() });
        toast({ title: "Disciplina excluída" });
      },
      onError: () => toast({ title: "Erro ao excluir disciplina", variant: "destructive" }),
    });
  };

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-primary">Disciplinas</h1>
        <p className="text-muted-foreground mt-2">
          Gerencie as disciplinas e configure em quais cursos e turnos são ministradas.
        </p>
      </div>

      <Card className="border-border/50 shadow-sm">
        <CardHeader className="bg-muted/30 border-b">
          <CardTitle className="text-base font-semibold">Adicionar Disciplina</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleAdd} className="flex gap-3">
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Matemática, Português, Ciências..."
              className="flex-1 bg-background"
            />
            <Button type="submit" disabled={!nome.trim() || create.isPending}>
              <Plus className="w-4 h-4 mr-2" />Adicionar
            </Button>
          </form>
          <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5">
            <Grid3X3 className="w-3 h-3" />
            Após criar, clique no ícone de grade para configurar cursos e turnos.
          </p>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />)}
          </div>
        ) : disciplinas?.length === 0 ? (
          <div className="text-center py-12 border border-dashed rounded-lg bg-card">
            <BookOpen className="w-12 h-12 text-muted-foreground opacity-30 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">Nenhuma disciplina cadastrada.</p>
          </div>
        ) : (
          (disciplinas as unknown as Disc[])?.map((d) => (
            <DiscRow
              key={d.id}
              disc={d}
              cursos={allCursos}
              turnos={allTurnos}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>
    </div>
  );
}
