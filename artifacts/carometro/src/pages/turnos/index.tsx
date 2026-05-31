import { useState } from "react";
import { useListTurnos, useCreateTurno, useDeleteTurno, getListTurnosQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Clock, Plus, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function TurnosList() {
  const [novoTurno, setNovoTurno] = useState("");
  const { data: turnos, isLoading } = useListTurnos();
  const createTurno = useCreateTurno();
  const deleteTurno = useDeleteTurno();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoTurno.trim()) return;
    createTurno.mutate(
      { data: { nome: novoTurno.trim() } },
      {
        onSuccess: () => {
          setNovoTurno("");
          queryClient.invalidateQueries({ queryKey: getListTurnosQueryKey() });
          toast({ title: "Turno criado com sucesso" });
        },
        onError: () => toast({ title: "Erro ao criar turno", variant: "destructive" }),
      }
    );
  };

  const handleDelete = (id: string) => {
    deleteTurno.mutate({ id }, {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListTurnosQueryKey() }); toast({ title: "Turno excluído" }); },
      onError: () => toast({ title: "Erro ao excluir turno", description: "Verifique se há turmas associadas.", variant: "destructive" }),
    });
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-primary">Turnos</h1>
        <p className="text-muted-foreground mt-2">Gerencie os turnos da instituição. Diurno, Vespertino e Noturno vêm pré-cadastrados.</p>
      </div>

      <Card className="border-border/50 shadow-sm">
        <CardHeader className="bg-muted/30 border-b"><CardTitle className="text-lg font-semibold">Adicionar Turno</CardTitle></CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleAdd} className="flex gap-3">
            <Input value={novoTurno} onChange={(e) => setNovoTurno(e.target.value)} placeholder="Ex: Matutino..." className="flex-1 bg-background" />
            <Button type="submit" disabled={!novoTurno.trim() || createTurno.isPending}>
              <Plus className="w-4 h-4 mr-2" />Adicionar
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {isLoading ? (
          <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />)}</div>
        ) : turnos?.length === 0 ? (
          <div className="text-center py-12 border border-dashed rounded-lg bg-card">
            <Clock className="w-12 h-12 text-muted-foreground opacity-30 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">Nenhum turno cadastrado.</p>
          </div>
        ) : (
          turnos?.map((turno) => (
            <div key={turno.id} className="flex items-center justify-between p-4 rounded-lg border bg-card hover:border-primary/30 transition-colors shadow-sm">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 text-primary rounded-md"><Clock className="w-5 h-5" /></div>
                <span className="font-semibold text-lg">{turno.nome}</span>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 hover:text-destructive"><Trash2 className="w-4 h-4" /></Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir turno?</AlertDialogTitle>
                    <AlertDialogDescription>O turno "{turno.nome}" será permanentemente excluído. Turmas associadas também serão afetadas.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleDelete(turno.id)} className="bg-destructive hover:bg-destructive/90">Excluir</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
