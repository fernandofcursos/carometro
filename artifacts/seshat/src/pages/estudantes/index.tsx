import { useState } from "react";
import { Link } from "wouter";
import {
  useListEstudantes, useListTurnos, useListTurmas, useListCursos,
  useDeleteEstudante, getListEstudantesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search, Plus, Trash2, Edit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";

export default function EstudantesList() {
  const [search, setSearch] = useState("");
  const [turnoId, setTurnoId] = useState<string>("all");
  const [cursoId, setCursoId] = useState<string>("all");
  const [turmaId, setTurmaId] = useState<string>("all");

  const { data: turnos } = useListTurnos();
  const { data: cursos } = useListCursos();
  const { data: turmas } = useListTurmas(
    turnoId !== "all" || cursoId !== "all"
      ? { ...(turnoId !== "all" && { turnoId }), ...(cursoId !== "all" && { cursoId }) }
      : undefined
  );

  const params = {
    ...(search && { search }),
    ...(turnoId !== "all" && { turnoId }),
    ...(cursoId !== "all" && { cursoId }),
    ...(turmaId !== "all" && { turmaId }),
  };

  const { data: estudantes, isLoading } = useListEstudantes(
    Object.keys(params).length > 0 ? params : undefined,
    { query: { queryKey: ["/api/estudantes", params] } }
  );

  const deleteEstudante = useDeleteEstudante();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleTurnoChange = (val: string) => { setTurnoId(val); setTurmaId("all"); };
  const handleCursoChange = (val: string) => { setCursoId(val); setTurmaId("all"); };

  const handleDelete = (id: string) => {
    deleteEstudante.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListEstudantesQueryKey() });
        toast({ title: "Estudante excluído com sucesso" });
      },
      onError: () => toast({ title: "Erro ao excluir estudante", variant: "destructive" }),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">Estudantes</h1>
          <p className="text-muted-foreground mt-2">Gerencie o cadastro de estudantes.</p>
        </div>
        <Button asChild>
          <Link href="/estudantes/novo"><Plus className="w-4 h-4 mr-2" />Novo Estudante</Link>
        </Button>
      </div>

      <Card className="p-4 border-border/50 shadow-sm bg-card flex flex-col gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome ou registro..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-background" />
        </div>
        <div className="flex flex-wrap gap-3">
          <Select value={turnoId} onValueChange={handleTurnoChange}>
            <SelectTrigger className="w-[150px] bg-background"><SelectValue placeholder="Turno" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os turnos</SelectItem>
              {turnos?.map((t) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={cursoId} onValueChange={handleCursoChange}>
            <SelectTrigger className="w-[150px] bg-background"><SelectValue placeholder="Curso" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os cursos</SelectItem>
              {cursos?.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={turmaId} onValueChange={setTurmaId}>
            <SelectTrigger className="w-[150px] bg-background"><SelectValue placeholder="Turma" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as turmas</SelectItem>
              {turmas?.map((t) => <SelectItem key={t.id} value={t.id}>{t.sigla} — {t.descricao}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="p-6 space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="w-12 h-12 rounded-full" />
                <div className="space-y-2 flex-1"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-3 w-1/4" /></div>
              </div>
            ))}
          </div>
        ) : estudantes?.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-lg font-medium">Nenhum estudante encontrado</p>
            <p className="text-muted-foreground">Ajuste os filtros ou crie um novo cadastro.</p>
          </div>
        ) : (
          <div className="divide-y">
            {estudantes?.map((est) => (
              <div key={est.id} className="p-4 flex items-center gap-4 hover:bg-muted/50 transition-colors">
                <Avatar className="w-12 h-12 border-2 border-background shadow-sm shrink-0">
                  {est.fotoUrl ? (
                    <AvatarImage src={est.fotoUrl} className="object-cover" />
                  ) : (
                    <AvatarFallback className="bg-primary/10 text-primary font-medium">
                      {est.nome.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  )}
                </Avatar>
                <div className="flex-1 min-w-0">
                  <Link href={`/estudantes/${est.id}`} className="font-semibold text-foreground hover:text-primary transition-colors truncate block">
                    {est.nome}
                  </Link>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground mt-1">
                    <span className="font-mono">{est.registro}</span>
                    {est.emails.map((e, i) => (
                      <span key={i} title={e.tipo === "responsavel" ? "E-mail do responsável" : "E-mail próprio"}>
                        {e.tipo === "responsavel" ? "👤 " : ""}{e.email}
                      </span>
                    ))}
                    <span className="font-medium bg-secondary/50 text-secondary-foreground px-2 py-0.5 rounded-full">{est.turmaSigla}</span>
                    <span>{est.cursoNome}</span>
                    <span>{est.turnoNome}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" asChild>
                    <Link href={`/estudantes/${est.id}`}><Edit className="w-4 h-4 text-muted-foreground" /></Link>
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir estudante?</AlertDialogTitle>
                        <AlertDialogDescription>Esta ação não pode ser desfeita. O cadastro de {est.nome} será permanentemente excluído.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(est.id)} className="bg-destructive hover:bg-destructive/90">Excluir</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
