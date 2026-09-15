import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tag, Plus, Pencil, Trash2 } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (path: string, opts?: RequestInit) =>
  fetch(`${BASE}${path}`, { credentials: "include", ...opts });
const apiJson = (path: string, opts?: RequestInit) =>
  api(path, { headers: { "Content-Type": "application/json" }, ...opts });

type Tipo = {
  id: string; nome: string; descricao: string | null;
  categoria: "aviso" | "informe"; ehCardapio: boolean;
  perfisDestino: string[]; ativo: boolean;
};

const PERFIS = [
  { value: "estudante", label: "Estudante" },
  { value: "professor", label: "Professor" },
  { value: "coordenador", label: "Coordenador" },
  { value: "pai_responsavel", label: "Pai/Responsável" },
  { value: "equipe_gestora", label: "Equipe Gestora" },
  { value: "todos", label: "Todos" },
];

function TipoDialog({ open, onOpenChange, editTarget, onSuccess }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editTarget?: Tipo;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [nome, setNome] = useState(editTarget?.nome ?? "");
  const [descricao, setDescricao] = useState(editTarget?.descricao ?? "");
  const [categoria, setCategoria] = useState<"aviso" | "informe">(editTarget?.categoria ?? "aviso");
  const [ehCardapio, setEhCardapio] = useState(editTarget?.ehCardapio ?? false);
  const [perfisDestino, setPerfisDestino] = useState<string[]>(editTarget?.perfisDestino ?? []);
  const [ativo, setAtivo] = useState(editTarget?.ativo ?? true);

  const togglePerfil = (v: string) =>
    setPerfisDestino((prev) => prev.includes(v) ? prev.filter((p) => p !== v) : [...prev, v]);

  const handleSave = async () => {
    const body = { nome, descricao: descricao || null, categoria, ehCardapio, perfisDestino, ativo };
    const url = editTarget
      ? `/api/avisos-informes/tipos/${editTarget.id}`
      : `/api/avisos-informes/tipos`;
    const method = editTarget ? "PUT" : "POST";
    const r = await apiJson(url, { method, body: JSON.stringify(body) });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      toast({ title: "Erro", description: d.error ?? "Falha ao salvar", variant: "destructive" });
      return;
    }
    toast({ title: editTarget ? "Atualizado!" : "Criado!" });
    onSuccess();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editTarget ? "Editar" : "Novo"} Tipo</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Nome</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} />
          </div>
          <div>
            <Label>Categoria</Label>
            <Select value={categoria} onValueChange={(v) => setCategoria(v as "aviso" | "informe")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="aviso">Aviso</SelectItem>
                <SelectItem value="informe">Informe</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="ehCardapio" checked={ehCardapio} onCheckedChange={(v) => setEhCardapio(!!v)} />
            <Label htmlFor="ehCardapio">É Cardápio?</Label>
          </div>
          <div>
            <Label className="mb-2 block">Perfis de destino</Label>
            <div className="space-y-2">
              {PERFIS.map(({ value, label }) => (
                <div key={value} className="flex items-center gap-2">
                  <Checkbox
                    id={`perfil-${value}`}
                    checked={perfisDestino.includes(value)}
                    onCheckedChange={() => togglePerfil(value)}
                  />
                  <Label htmlFor={`perfil-${value}`} className="font-normal">{label}</Label>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="ativo" checked={ativo} onCheckedChange={(v) => setAtivo(!!v)} />
            <Label htmlFor="ativo">Ativo</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function TiposAvisosPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Tipo | undefined>();
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: tipos = [], isLoading } = useQuery<Tipo[]>({
    queryKey: ["tipos-avisos-all"],
    queryFn: () => api("/api/avisos-informes/tipos").then((r) => r.json()),
    staleTime: 30_000,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api(`/api/avisos-informes/tipos/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tipos-avisos-all"] });
      toast({ title: "Excluído." });
      setDeleteId(null);
    },
  });

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Tag className="w-6 h-6 text-purple-500" /> Tipos de Aviso/Informe
        </h1>
        <Button onClick={() => { setEditTarget(undefined); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Novo Tipo
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : tipos.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Tag className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">Nenhum tipo cadastrado.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {tipos.map((t) => (
            <Card key={t.id} className="shadow-sm border-border/50">
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap gap-1.5 items-center">
                    <span className="font-medium text-sm">{t.nome}</span>
                    <Badge variant="outline" className={t.categoria === "aviso" ? "border-amber-300 text-amber-700 text-xs" : "border-blue-300 text-blue-700 text-xs"}>
                      {t.categoria === "aviso" ? "Aviso" : "Informe"}
                    </Badge>
                    {t.ehCardapio && <Badge className="text-xs bg-orange-100 text-orange-800 border-orange-200">Cardápio</Badge>}
                    {t.ativo ? (
                      <Badge className="text-xs bg-green-100 text-green-800 border-green-200">Ativo</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-gray-500">Inativo</Badge>
                    )}
                  </div>
                  {t.descricao && <p className="text-xs text-muted-foreground mt-0.5">{t.descricao}</p>}
                  {t.perfisDestino.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {t.perfisDestino.map((p) => (
                        <Badge key={p} variant="secondary" className="text-xs">{p}</Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" onClick={() => { setEditTarget(t); setDialogOpen(true); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setDeleteId(t.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {dialogOpen && (
        <TipoDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          editTarget={editTarget}
          onSuccess={() => qc.invalidateQueries({ queryKey: ["tipos-avisos-all"] })}
        />
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tipo?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMut.mutate(deleteId)}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
