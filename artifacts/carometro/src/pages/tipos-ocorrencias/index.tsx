import { useState } from "react";
import {
  useListTiposOcorrencias, useCreateTipoOcorrencia, useUpdateTipoOcorrencia,
  useDeleteTipoOcorrencia, getListTiposOcorrenciasQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Tag, Plus, Trash2, Edit2, Check, X } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type Tipo = { id: string; descricao: string; status: "ativo" | "inativo"; criadoEm: string };

function TipoRow({ tipo, onDelete }: { tipo: Tipo; onDelete: (id: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [descricao, setDescricao] = useState(tipo.descricao);
  const [status, setStatus] = useState(tipo.status);
  const update = useUpdateTipoOcorrencia();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const save = () => {
    update.mutate(
      { id: tipo.id, data: { descricao, status } },
      {
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListTiposOcorrenciasQueryKey() }); setEditing(false); toast({ title: "Tipo atualizado" }); },
        onError: () => toast({ title: "Erro ao atualizar tipo", variant: "destructive" }),
      }
    );
  };

  const cancel = () => { setDescricao(tipo.descricao); setStatus(tipo.status); setEditing(false); };

  if (editing) {
    return (
      <div className="p-4 border rounded-lg bg-muted/20 flex flex-wrap items-center gap-3">
        <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} className="flex-1 min-w-[200px] bg-background h-8 text-sm" autoFocus />
        <Select value={status} onValueChange={(v) => setStatus(v as "ativo" | "inativo")}>
          <SelectTrigger className="w-[120px] h-8 text-sm bg-background"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ativo">Ativo</SelectItem>
            <SelectItem value="inativo">Inativo</SelectItem>
          </SelectContent>
        </Select>
        <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600 hover:bg-green-50" onClick={save} disabled={update.isPending}><Check className="w-4 h-4" /></Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={cancel}><X className="w-4 h-4" /></Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 p-4 rounded-lg border bg-card hover:border-primary/30 transition-colors shadow-sm">
      <div className="p-2 bg-amber-100 text-amber-700 rounded-md shrink-0"><Tag className="w-4 h-4" /></div>
      <span className="font-medium flex-1">{tipo.descricao}</span>
      <Badge variant={tipo.status === "ativo" ? "default" : "secondary"} className={tipo.status === "ativo" ? "bg-green-100 text-green-800 hover:bg-green-100" : ""}>
        {tipo.status === "ativo" ? "Ativo" : "Inativo"}
      </Badge>
      <div className="flex gap-1 shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing(true)}><Edit2 className="w-4 h-4 text-muted-foreground" /></Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"><Trash2 className="w-4 h-4" /></Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir tipo de ocorrência?</AlertDialogTitle>
              <AlertDialogDescription>O tipo "{tipo.descricao}" será permanentemente excluído.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => onDelete(tipo.id)} className="bg-destructive hover:bg-destructive/90">Excluir</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

export default function TiposOcorrenciasPage() {
  const [descricao, setDescricao] = useState("");
  const [status, setStatus] = useState<"ativo" | "inativo">("ativo");
  const { data: tipos, isLoading } = useListTiposOcorrencias();
  const create = useCreateTipoOcorrencia();
  const del = useDeleteTipoOcorrencia();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!descricao.trim()) return;
    create.mutate(
      { data: { descricao: descricao.trim(), status } },
      {
        onSuccess: () => {
          setDescricao(""); setStatus("ativo");
          queryClient.invalidateQueries({ queryKey: getListTiposOcorrenciasQueryKey() });
          toast({ title: "Tipo de ocorrência criado" });
        },
        onError: () => toast({ title: "Erro ao criar tipo", variant: "destructive" }),
      }
    );
  };

  const handleDelete = (id: string) => {
    del.mutate({ id }, {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListTiposOcorrenciasQueryKey() }); toast({ title: "Tipo excluído" }); },
      onError: () => toast({ title: "Erro ao excluir tipo", variant: "destructive" }),
    });
  };

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-primary">Tipos de Ocorrência</h1>
        <p className="text-muted-foreground mt-2">Gerencie as categorias de ocorrências disponíveis para registro.</p>
      </div>

      <Card className="border-border/50 shadow-sm">
        <CardHeader className="bg-muted/30 border-b"><CardTitle className="text-base font-semibold">Adicionar Tipo</CardTitle></CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleAdd} className="flex flex-wrap gap-3">
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex: Falta injustificada, Advertência..." className="flex-1 min-w-[200px] bg-background" />
            <Select value={status} onValueChange={(v) => setStatus(v as "ativo" | "inativo")}>
              <SelectTrigger className="w-[130px] bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="inativo">Inativo</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" disabled={!descricao.trim() || create.isPending}>
              <Plus className="w-4 h-4 mr-2" />Adicionar
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {isLoading ? (
          <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />)}</div>
        ) : tipos?.length === 0 ? (
          <div className="text-center py-12 border border-dashed rounded-lg bg-card">
            <Tag className="w-12 h-12 text-muted-foreground opacity-30 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">Nenhum tipo cadastrado.</p>
          </div>
        ) : (
          tipos?.map((t) => <TipoRow key={t.id} tipo={t} onDelete={handleDelete} />)
        )}
      </div>
    </div>
  );
}
