import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  Tag, Plus, Edit2, Check, X, ChevronDown, ChevronRight, Trash2,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function fetchJson(url: string, opts?: RequestInit) {
  const res = await fetch(url, {
    ...opts,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Erro ${res.status}`);
  }
  return res.json();
}

type Assunto = {
  id: string;
  tipoId: string;
  nome: string;
  descricao: string | null;
  requerMotivos: boolean;
  ordem: number;
  ativo: boolean;
};

type Tipo = {
  id: string;
  nome: string;
  ordem: number;
  ativo: boolean;
  assuntos: Assunto[];
};

// ── Linha de Assunto ──────────────────────────────────────────────────────────

function AssuntoRow({
  assunto,
  onDelete,
  onUpdate,
}: {
  assunto: Assunto;
  onDelete: (id: string) => void;
  onUpdate: (id: string, data: Partial<Assunto>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [nome, setNome] = useState(assunto.nome);
  const [descricao, setDescricao] = useState(assunto.descricao ?? "");
  const [requerMotivos, setRequerMotivos] = useState(assunto.requerMotivos);

  const save = () => {
    onUpdate(assunto.id, { nome, descricao: descricao || null, requerMotivos });
    setEditing(false);
  };

  const cancel = () => {
    setNome(assunto.nome);
    setDescricao(assunto.descricao ?? "");
    setRequerMotivos(assunto.requerMotivos);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="p-3 border rounded-lg bg-muted/20 space-y-2">
        <Input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome do assunto"
          className="h-8 text-sm bg-background"
          autoFocus
        />
        <Input
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Descrição (opcional)"
          className="h-8 text-sm bg-background"
        />
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={requerMotivos}
              onChange={(e) => setRequerMotivos(e.target.checked)}
              className="rounded"
            />
            Requer exposição de motivos
          </label>
          <div className="flex-1" />
          <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600 hover:bg-green-50" onClick={save}>
            <Check className="w-3.5 h-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={cancel}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 p-2.5 rounded-md border bg-card hover:border-primary/30 transition-colors text-sm">
      <span className="flex-1 font-medium">{assunto.nome}</span>
      {assunto.descricao && (
        <span className="text-muted-foreground text-xs hidden sm:block truncate max-w-[200px]">
          {assunto.descricao}
        </span>
      )}
      {assunto.requerMotivos && (
        <Badge variant="outline" className="text-xs shrink-0">Requer motivos</Badge>
      )}
      <Badge
        variant={assunto.ativo ? "default" : "secondary"}
        className={`shrink-0 text-xs ${assunto.ativo ? "bg-green-100 text-green-800 hover:bg-green-100" : ""}`}
      >
        {assunto.ativo ? "Ativo" : "Inativo"}
      </Badge>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={() => onUpdate(assunto.id, { ativo: !assunto.ativo })}
        title={assunto.ativo ? "Desativar" : "Ativar"}
      >
        {assunto.ativo ? <X className="w-3.5 h-3.5 text-muted-foreground" /> : <Check className="w-3.5 h-3.5 text-green-600" />}
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setEditing(true)}>
        <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive hover:bg-destructive/10">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir assunto?</AlertDialogTitle>
            <AlertDialogDescription>
              O assunto "{assunto.nome}" será excluído. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => onDelete(assunto.id)} className="bg-destructive hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Card de Tipo ──────────────────────────────────────────────────────────────

function TipoCard({
  tipo,
  onUpdateTipo,
  onAddAssunto,
  onUpdateAssunto,
  onDeleteAssunto,
}: {
  tipo: Tipo;
  onUpdateTipo: (id: string, data: Partial<Tipo>) => void;
  onAddAssunto: (tipoId: string, nome: string) => void;
  onUpdateAssunto: (id: string, data: Partial<Assunto>) => void;
  onDeleteAssunto: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editingNome, setEditingNome] = useState(false);
  const [nome, setNome] = useState(tipo.nome);
  const [addingAssunto, setAddingAssunto] = useState(false);
  const [novoAssunto, setNovoAssunto] = useState("");

  const saveNome = () => {
    if (nome.trim()) onUpdateTipo(tipo.id, { nome: nome.trim() });
    setEditingNome(false);
  };

  const handleAddAssunto = () => {
    if (novoAssunto.trim()) {
      onAddAssunto(tipo.id, novoAssunto.trim());
      setNovoAssunto("");
      setAddingAssunto(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="p-4 pb-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-cyan-100 text-cyan-700 rounded-md shrink-0">
            <Tag className="w-4 h-4" />
          </div>
          {editingNome ? (
            <div className="flex items-center gap-2 flex-1">
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="h-8 text-sm flex-1"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") saveNome(); if (e.key === "Escape") setEditingNome(false); }}
              />
              <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600" onClick={saveNome}><Check className="w-3.5 h-3.5" /></Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setNome(tipo.nome); setEditingNome(false); }}><X className="w-3.5 h-3.5" /></Button>
            </div>
          ) : (
            <CardTitle className="text-base flex-1 flex items-center gap-2">
              {tipo.nome}
              <Button variant="ghost" size="icon" className="h-6 w-6 opacity-60 hover:opacity-100" onClick={() => setEditingNome(true)}>
                <Edit2 className="w-3 h-3" />
              </Button>
            </CardTitle>
          )}
          <Badge
            variant={tipo.ativo ? "default" : "secondary"}
            className={`shrink-0 cursor-pointer text-xs ${tipo.ativo ? "bg-green-100 text-green-800 hover:bg-green-200" : "hover:bg-muted"}`}
            onClick={() => onUpdateTipo(tipo.id, { ativo: !tipo.ativo })}
          >
            {tipo.ativo ? "Ativo" : "Inativo"}
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? "Recolher" : "Expandir"}
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground pl-11">
          {tipo.assuntos.length} assunto{tipo.assuntos.length !== 1 ? "s" : ""}
        </p>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 pb-4 px-4 space-y-2">
          {tipo.assuntos.length === 0 && (
            <p className="text-sm text-muted-foreground py-2 text-center">Nenhum assunto cadastrado.</p>
          )}
          {tipo.assuntos.map((a) => (
            <AssuntoRow
              key={a.id}
              assunto={a}
              onDelete={onDeleteAssunto}
              onUpdate={onUpdateAssunto}
            />
          ))}

          {addingAssunto ? (
            <div className="flex items-center gap-2 pt-1">
              <Input
                value={novoAssunto}
                onChange={(e) => setNovoAssunto(e.target.value)}
                placeholder="Nome do novo assunto"
                className="h-8 text-sm flex-1"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") handleAddAssunto(); if (e.key === "Escape") setAddingAssunto(false); }}
              />
              <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={handleAddAssunto}><Check className="w-4 h-4" /></Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setAddingAssunto(false)}><X className="w-4 h-4" /></Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" className="w-full mt-1 h-8 text-xs gap-1.5 border-dashed" onClick={() => setAddingAssunto(true)}>
              <Plus className="w-3.5 h-3.5" /> Adicionar assunto
            </Button>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function TiposRequerimentosPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addingTipo, setAddingTipo] = useState(false);
  const [novoTipo, setNovoTipo] = useState("");

  const { data: tipos = [], isLoading } = useQuery<Tipo[]>({
    queryKey: ["requerimentos-admin-tipos"],
    queryFn: () => fetchJson(`${BASE}/api/requerimentos/admin/tipos`),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["requerimentos-admin-tipos"] });

  const createTipo = useMutation({
    mutationFn: (nome: string) =>
      fetchJson(`${BASE}/api/requerimentos/admin/tipos`, { method: "POST", body: JSON.stringify({ nome }) }),
    onSuccess: () => { invalidate(); toast({ title: "Tipo criado com sucesso." }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const updateTipo = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Tipo> }) =>
      fetchJson(`${BASE}/api/requerimentos/admin/tipos/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => { invalidate(); toast({ title: "Tipo atualizado." }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const createAssunto = useMutation({
    mutationFn: (data: { tipoId: string; nome: string }) =>
      fetchJson(`${BASE}/api/requerimentos/admin/assuntos`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { invalidate(); toast({ title: "Assunto criado com sucesso." }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const updateAssunto = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Assunto> }) =>
      fetchJson(`${BASE}/api/requerimentos/admin/assuntos/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => { invalidate(); toast({ title: "Assunto atualizado." }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteAssunto = useMutation({
    mutationFn: (id: string) =>
      fetchJson(`${BASE}/api/requerimentos/admin/assuntos/${id}`, { method: "DELETE" }),
    onSuccess: () => { invalidate(); toast({ title: "Assunto excluído." }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const handleAddTipo = () => {
    if (novoTipo.trim()) {
      createTipo.mutate(novoTipo.trim(), {
        onSuccess: () => { setNovoTipo(""); setAddingTipo(false); },
      });
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tipos de Solicitação</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gerencie os tipos e assuntos disponíveis no formulário de requerimento.
          </p>
        </div>
        <Button onClick={() => setAddingTipo(true)} className="shrink-0 gap-2">
          <Plus className="w-4 h-4" /> Novo Tipo
        </Button>
      </div>

      {addingTipo && (
        <div className="flex items-center gap-2 p-4 border rounded-lg bg-muted/20">
          <Input
            value={novoTipo}
            onChange={(e) => setNovoTipo(e.target.value)}
            placeholder="Nome do novo tipo"
            className="flex-1 h-9"
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") handleAddTipo(); if (e.key === "Escape") setAddingTipo(false); }}
          />
          <Button onClick={handleAddTipo} disabled={createTipo.isPending} size="sm">Criar</Button>
          <Button variant="ghost" size="sm" onClick={() => { setAddingTipo(false); setNovoTipo(""); }}>Cancelar</Button>
        </div>
      )}

      {isLoading && (
        <div className="py-12 text-center text-muted-foreground text-sm">Carregando...</div>
      )}

      {!isLoading && tipos.length === 0 && (
        <div className="py-12 text-center text-muted-foreground text-sm">
          Nenhum tipo cadastrado. Clique em "Novo Tipo" para começar.
        </div>
      )}

      <div className="space-y-3">
        {tipos.map((tipo) => (
          <TipoCard
            key={tipo.id}
            tipo={tipo}
            onUpdateTipo={(id, data) => updateTipo.mutate({ id, data })}
            onAddAssunto={(tipoId, nome) => createAssunto.mutate({ tipoId, nome })}
            onUpdateAssunto={(id, data) => updateAssunto.mutate({ id, data })}
            onDeleteAssunto={(id) => deleteAssunto.mutate(id)}
          />
        ))}
      </div>
    </div>
  );
}
