import { useState } from "react";
import {
  useListRoles, useCreateRole, useUpdateRole, useDeleteRole,
  useListPermissoes, useSetRolePermissoes,
  getListRolesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, Plus, Trash2, Edit2, Check, X, Lock, AlertCircle } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

type Permissao = { id: string; recurso: string; acao: string; chave: string; descricao?: string | null };
type Role = {
  id: string; nome: string; descricao?: string | null;
  ativo: boolean; permissoes: string[]; criadoEm: string; atualizadoEm: string;
};

function PermissoesModal({
  role, allPermissoes, onClose,
}: { role: Role; allPermissoes: Permissao[]; onClose: () => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(role.permissoes ?? []));
  const setPerms = useSetRolePermissoes();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const toggle = (chave: string) => {
    const s = new Set(selected);
    if (s.has(chave)) s.delete(chave); else s.add(chave);
    setSelected(s);
  };

  const save = () => {
    setPerms.mutate(
      { id: role.id, data: { permissoes: [...selected] } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListRolesQueryKey() });
          toast({ title: "Permissões atualizadas" });
          onClose();
        },
        onError: () => toast({ title: "Erro ao salvar permissões", variant: "destructive" }),
      }
    );
  };

  const byRecurso = allPermissoes.reduce<Record<string, Permissao[]>>((acc, p) => {
    if (!acc[p.recurso]) acc[p.recurso] = [];
    acc[p.recurso].push(p);
    return acc;
  }, {});

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>Permissões — {role.nome}</DialogTitle></DialogHeader>
      <div className="space-y-4 max-h-96 overflow-y-auto py-2 pr-1">
        {Object.entries(byRecurso).map(([recurso, perms]) => (
          <div key={recurso}>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{recurso}</p>
            {perms.map((p) => (
              <label key={p.chave} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer">
                <Checkbox checked={selected.has(p.chave)} onCheckedChange={() => toggle(p.chave)} />
                <div>
                  <span className="text-sm font-medium">{p.acao}</span>
                  {p.descricao && <p className="text-xs text-muted-foreground">{p.descricao}</p>}
                </div>
              </label>
            ))}
          </div>
        ))}
      </div>
      <div className="flex gap-2 pt-2">
        <Button onClick={save} disabled={setPerms.isPending} className="flex-1">
          {setPerms.isPending ? "Salvando..." : "Salvar"}
        </Button>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
      </div>
    </DialogContent>
  );
}

function RoleRow({
  role, allPermissoes, onDelete,
}: { role: Role; allPermissoes: Permissao[]; onDelete: (id: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [nome, setNome] = useState(role.nome);
  const [descricao, setDescricao] = useState(role.descricao ?? "");
  const [ativo, setAtivo] = useState(role.ativo);
  const [showPerms, setShowPerms] = useState(false);
  const update = useUpdateRole();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const save = () => {
    if (!nome.trim()) return;
    update.mutate(
      { id: role.id, data: { nome: nome.trim(), descricao: descricao || undefined, ativo } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListRolesQueryKey() });
          setEditing(false);
          toast({ title: "Role atualizada" });
        },
        onError: () => toast({ title: "Erro ao atualizar role", variant: "destructive" }),
      }
    );
  };

  const cancel = () => { setNome(role.nome); setDescricao(role.descricao ?? ""); setAtivo(role.ativo); setEditing(false); };

  if (editing) {
    return (
      <div className="p-4 border rounded-lg bg-muted/20 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Input value={nome} onChange={(e) => setNome(e.target.value)} className="flex-1 min-w-[150px] bg-background h-8 text-sm" placeholder="Nome" autoFocus />
          <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} className="flex-1 min-w-[200px] bg-background h-8 text-sm" placeholder="Descrição (opcional)" />
          <div className="flex items-center gap-2">
            <Switch id={`ativo-${role.id}`} checked={ativo} onCheckedChange={setAtivo} />
            <Label htmlFor={`ativo-${role.id}`} className="text-sm">Ativo</Label>
          </div>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600 hover:bg-green-50" onClick={save} disabled={update.isPending}><Check className="w-4 h-4" /></Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={cancel}><X className="w-4 h-4" /></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 p-4 rounded-lg border bg-card hover:border-primary/30 transition-colors shadow-sm">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold capitalize text-sm">{role.nome}</span>
          {!role.ativo && <Badge variant="outline" className="text-xs text-muted-foreground">inativo</Badge>}
        </div>
        {role.descricao && <p className="text-xs text-muted-foreground mt-0.5">{role.descricao}</p>}
        <div className="flex flex-wrap gap-1 mt-1.5">
          {(role.permissoes ?? []).slice(0, 6).map((p) => (
            <Badge key={p} variant="secondary" className="text-xs font-mono">{p}</Badge>
          ))}
          {(role.permissoes ?? []).length > 6 && (
            <Badge variant="secondary" className="text-xs">+{(role.permissoes ?? []).length - 6}</Badge>
          )}
        </div>
      </div>

      <div className="flex gap-1 shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Permissões" onClick={() => setShowPerms(true)}>
          <Lock className="w-4 h-4 text-muted-foreground" />
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
              <AlertDialogTitle>Excluir role?</AlertDialogTitle>
              <AlertDialogDescription>A role "{role.nome}" e todos os vínculos com usuários serão removidos.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => onDelete(role.id)} className="bg-destructive hover:bg-destructive/90">Excluir</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <Dialog open={showPerms} onOpenChange={setShowPerms}>
        {showPerms && <PermissoesModal role={role} allPermissoes={allPermissoes} onClose={() => setShowPerms(false)} />}
      </Dialog>
    </div>
  );
}

export default function RolesPage() {
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const { data: roles, isLoading, isError } = useListRoles();
  const { data: permissoes } = useListPermissoes();
  const create = useCreateRole();
  const del = useDeleteRole();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) return;
    create.mutate(
      { data: { nome: nome.trim(), descricao: descricao || undefined } },
      {
        onSuccess: () => {
          setNome(""); setDescricao("");
          queryClient.invalidateQueries({ queryKey: getListRolesQueryKey() });
          toast({ title: "Role criada" });
        },
        onError: () => toast({ title: "Erro ao criar role", variant: "destructive" }),
      }
    );
  };

  const handleDelete = (id: string) => {
    del.mutate({ id }, {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListRolesQueryKey() }); toast({ title: "Role excluída" }); },
      onError: () => toast({ title: "Erro ao excluir role", variant: "destructive" }),
    });
  };

  const allPermissoes = (permissoes ?? []) as Permissao[];

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-primary">Roles & Permissões</h1>
        <p className="text-muted-foreground mt-2">Gerencie os perfis de acesso e suas permissões no sistema.</p>
      </div>

      <Card className="border-border/50 shadow-sm">
        <CardHeader className="bg-muted/30 border-b"><CardTitle className="text-base font-semibold">Nova Role</CardTitle></CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleAdd} className="flex flex-wrap gap-3">
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome (ex: professor)" className="flex-1 min-w-[150px] bg-background" required />
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Descrição (opcional)" className="flex-1 min-w-[200px] bg-background" />
            <Button type="submit" disabled={!nome.trim() || create.isPending}>
              <Plus className="w-4 h-4 mr-2" />Criar
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {isLoading ? (
          <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
        ) : isError ? (
          <div className="text-center py-12 border border-dashed rounded-lg bg-card">
            <AlertCircle className="w-12 h-12 text-destructive opacity-40 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">Erro ao carregar roles.</p>
            <p className="text-sm text-muted-foreground mt-1">Verifique a conexão com o servidor.</p>
          </div>
        ) : roles?.length === 0 ? (
          <div className="text-center py-12 border border-dashed rounded-lg bg-card">
            <ShieldCheck className="w-12 h-12 text-muted-foreground opacity-30 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">Nenhuma role cadastrada.</p>
          </div>
        ) : (
          (roles as unknown as Role[])?.map((r) => (
            <RoleRow key={r.id} role={r} allPermissoes={allPermissoes} onDelete={handleDelete} />
          ))
        )}
      </div>
    </div>
  );
}
