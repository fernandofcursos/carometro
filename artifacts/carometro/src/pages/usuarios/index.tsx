import { useState } from "react";
import {
  useListUsuarios, useCreateUsuario, useUpdateUsuario, useDeleteUsuario,
  useUploadFotoUsuario, useListDisciplinas, useListRoles, useSetUsuarioRoles,
  useResetarSenhaUsuario, getListUsuariosQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { UserCog, Plus, Trash2, Edit2, Lock, Copy, BookOpen, Camera, ShieldCheck, RefreshCw, AlertCircle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { CameraCapture } from "@/components/camera-capture";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type RoleSummary = { id: string; nome: string };
type DisciplinaOferta = { id: string; disciplinaId: string; cursoId: string; cursoNome: string; turnoId: string; turnoNome: string };
type EnrichedDisc = { id: string; nome: string; criadoEm: string; ofertas: DisciplinaOferta[] };
type UsuarioDisciplina = { ofertaId: string; disciplinaId: string; disciplinaNome: string; cursoId: string; cursoNome: string; turnoId: string; turnoNome: string };
type Usuario = {
  id: string; nome: string | null; email: string; codigoAcesso: string;
  primeiroAcesso: boolean; fotoUrl: string | null;
  roles: RoleSummary[]; disciplinas: UsuarioDisciplina[];
  criadoEm: string;
};

function getInitials(u: Pick<Usuario, "nome" | "email">) {
  if (u.nome?.trim()) {
    const parts = u.nome.trim().split(/\s+/);
    return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
  }
  const parts = u.email.split("@")[0].split(/[._\-]/);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "U";
}

function DisciplinasModal({
  usuario, allDisciplinas, onClose,
}: { usuario: Usuario; allDisciplinas: EnrichedDisc[]; onClose: () => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set((usuario.disciplinas ?? []).map((d) => d.ofertaId)));
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const toggle = (id: string) => {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id); else s.add(id);
    setSelected(s);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${BASE}/api/usuarios/${usuario.id}/disciplinas`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ disciplinaOfertaIds: [...selected] }),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: getListUsuariosQueryKey() });
        toast({ title: "Disciplinas atualizadas" });
        onClose();
      } else {
        toast({ title: "Erro ao salvar disciplinas", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro de conexão", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const hasAnyOfertas = allDisciplinas.some((d) => d.ofertas.length > 0);

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>Disciplinas de {usuario.nome ?? usuario.email}</DialogTitle></DialogHeader>
      <div className="space-y-4 max-h-80 overflow-y-auto py-2">
        {allDisciplinas.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Nenhuma disciplina cadastrada.</p>
        ) : !hasAnyOfertas ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhuma disciplina possui cursos/turnos configurados. Configure-os na página de Disciplinas.
          </p>
        ) : (
          allDisciplinas.filter((d) => d.ofertas.length > 0).map((disc) => (
            <div key={disc.id}>
              <p className="text-sm font-semibold text-foreground mb-1.5 flex items-center gap-2">
                <BookOpen className="w-3.5 h-3.5 text-violet-500" />{disc.nome}
              </p>
              <div className="space-y-1 pl-5">
                {disc.ofertas.map((o) => (
                  <label key={o.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded p-1.5 select-none">
                    <Checkbox checked={selected.has(o.id)} onCheckedChange={() => toggle(o.id)} />
                    <span className="text-sm">{o.cursoNome} / {o.turnoNome}</span>
                  </label>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
      <div className="flex gap-2 pt-2">
        <Button onClick={save} disabled={saving} className="flex-1">{saving ? "Salvando..." : "Salvar"}</Button>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
      </div>
    </DialogContent>
  );
}

function RolesModal({
  usuario, allRoles, onClose,
}: { usuario: Usuario; allRoles: RoleSummary[]; onClose: () => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(usuario.roles.map((r) => r.id)));
  const setRoles = useSetUsuarioRoles();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const toggle = (id: string) => {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id); else s.add(id);
    setSelected(s);
  };

  const save = () => {
    setRoles.mutate(
      { id: usuario.id, data: { roleIds: [...selected] } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListUsuariosQueryKey() });
          toast({ title: "Perfis atualizados" });
          onClose();
        },
        onError: () => toast({ title: "Erro ao salvar perfis", variant: "destructive" }),
      }
    );
  };

  return (
    <DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>Perfis de {usuario.nome ?? usuario.email}</DialogTitle></DialogHeader>
      <div className="space-y-2 max-h-72 overflow-y-auto py-2">
        {allRoles.length === 0
          ? <p className="text-sm text-muted-foreground text-center py-4">Nenhum perfil cadastrado.</p>
          : allRoles.map((r) => (
            <label key={r.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer">
              <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} />
              <span className="text-sm font-medium capitalize">{r.nome}</span>
            </label>
          ))}
      </div>
      <div className="flex gap-2 pt-2">
        <Button onClick={save} disabled={setRoles.isPending} className="flex-1">
          {setRoles.isPending ? "Salvando..." : "Salvar"}
        </Button>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
      </div>
    </DialogContent>
  );
}

function FotoModal({
  usuario, onClose,
}: { usuario: Usuario; onClose: () => void }) {
  const uploadFoto = useUploadFotoUsuario();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleCapture = (base64Url: string) => {
    uploadFoto.mutate(
      { id: usuario.id, data: { fotoBase64: base64Url } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListUsuariosQueryKey() });
          toast({ title: "Foto atualizada com sucesso" });
          onClose();
        },
        onError: () => toast({ title: "Erro ao salvar foto", variant: "destructive" }),
      }
    );
  };

  return (
    <DialogContent className="max-w-sm">
      <DialogHeader>
        <DialogTitle>Foto de {usuario.nome ?? usuario.email}</DialogTitle>
      </DialogHeader>
      <div className="py-2">
        <CameraCapture
          onCapture={handleCapture}
          onCancel={onClose}
          initialImage={usuario.fotoUrl}
          aspectRatio="1/1"
        />
      </div>
    </DialogContent>
  );
}

function EditarUsuarioModal({
  usuario, onClose,
}: { usuario: Usuario; onClose: () => void }) {
  const [nome, setNome] = useState(usuario.nome ?? "");
  const [email, setEmail] = useState(usuario.email);
  const [primeiroAcesso, setPrimeiroAcesso] = useState(usuario.primeiroAcesso);
  const [senhaReset, setSenhaReset] = useState<string | null>(null);
  const update = useUpdateUsuario();
  const resetarSenha = useResetarSenhaUsuario();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    update.mutate(
      { id: usuario.id, data: { nome: nome.trim() || undefined, email: email.trim(), primeiroAcesso } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListUsuariosQueryKey() });
          toast({ title: "Usuário atualizado" });
          onClose();
        },
        onError: (err) => {
          const msg = (err as { data?: { error?: string } }).data?.error ?? "Erro ao atualizar usuário";
          toast({ title: msg, variant: "destructive" });
        },
      }
    );
  };

  const handleResetSenha = () => {
    resetarSenha.mutate(
      { id: usuario.id },
      {
        onSuccess: (data) => {
          queryClient.invalidateQueries({ queryKey: getListUsuariosQueryKey() });
          setSenhaReset((data as unknown as { senhaGerada: string }).senhaGerada);
          toast({ title: "Senha resetada com sucesso" });
        },
        onError: () => toast({ title: "Erro ao resetar senha", variant: "destructive" }),
      }
    );
  };

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Editar Usuário</DialogTitle>
      </DialogHeader>
      <form onSubmit={save} className="space-y-5 pt-1">
        <div className="space-y-1.5">
          <Label htmlFor="edit-nome">Nome</Label>
          <Input
            id="edit-nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome completo"
            className="bg-background"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="edit-email">E-mail <span className="text-destructive">*</span></Label>
          <Input
            id="edit-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@escola.edu.br"
            className="bg-background"
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm">Código de Acesso</Label>
          <div className="flex items-center gap-2 px-3 py-2 rounded-md border bg-muted/30 text-sm font-mono text-muted-foreground">
            <Lock className="w-3.5 h-3.5 shrink-0" />
            <span>{usuario.codigoAcesso}</span>
            <span className="text-xs text-muted-foreground/60 ml-1">(gerado automaticamente, não editável)</span>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border px-4 py-3 bg-muted/10">
          <div>
            <p className="text-sm font-medium">Primeiro acesso</p>
            <p className="text-xs text-muted-foreground">Se ativado, o usuário será forçado a redefinir a senha no próximo login.</p>
          </div>
          <Switch checked={primeiroAcesso} onCheckedChange={setPrimeiroAcesso} />
        </div>

        <Separator />

        <div className="space-y-2">
          <Label className="text-sm">Resetar Senha</Label>
          <p className="text-xs text-muted-foreground">Gera uma nova senha provisória e a envia por e-mail ao usuário. O flag "primeiro acesso" será ativado automaticamente.</p>
          {senhaReset ? (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <div>
                <p className="text-xs text-amber-700 font-medium">Nova senha provisória (anote agora):</p>
                <p className="font-mono font-bold text-amber-900">{senhaReset}</p>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="w-full border-destructive/40 text-destructive hover:bg-destructive/5"
              onClick={handleResetSenha}
              disabled={resetarSenha.isPending}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              {resetarSenha.isPending ? "Resetando..." : "Resetar Senha"}
            </Button>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={!email.trim() || update.isPending} className="flex-1">
            {update.isPending ? "Salvando..." : "Salvar Alterações"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
        </div>
      </form>
    </DialogContent>
  );
}

function UsuarioRow({
  usuario, allRoles, allDisciplinas, onDelete,
}: { usuario: Usuario; allRoles: RoleSummary[]; allDisciplinas: EnrichedDisc[]; onDelete: (id: string) => void }) {
  const [showEdit, setShowEdit] = useState(false);
  const [showDisc, setShowDisc] = useState(false);
  const [showRoles, setShowRoles] = useState(false);
  const [showFoto, setShowFoto] = useState(false);
  const { toast } = useToast();

  const copyCode = () => { navigator.clipboard.writeText(usuario.codigoAcesso); toast({ title: "Código copiado!" }); };

  return (
    <div className="flex items-center gap-3 p-4 rounded-lg border bg-card hover:border-primary/30 transition-colors shadow-sm">
      <div className="relative shrink-0 group cursor-pointer" onClick={() => setShowFoto(true)}>
        <Avatar className="h-10 w-10">
          {usuario.fotoUrl && <AvatarImage src={usuario.fotoUrl} alt={usuario.email} className="object-cover" />}
          <AvatarFallback className="text-sm bg-primary/10 text-primary font-semibold">{getInitials(usuario)}</AvatarFallback>
        </Avatar>
        <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <Camera className="w-3.5 h-3.5 text-white" />
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {usuario.nome && <span className="font-semibold text-sm">{usuario.nome}</span>}
          <Lock className="w-3 h-3 text-muted-foreground shrink-0" />
          <span className={`text-sm truncate ${usuario.nome ? "text-muted-foreground" : "font-medium"}`}>{usuario.email}</span>
          <button onClick={copyCode} className="inline-flex items-center gap-1 font-mono text-xs bg-muted px-2 py-0.5 rounded hover:bg-muted/80 transition-colors">
            <Copy className="w-3 h-3" />{usuario.codigoAcesso}
          </button>
          {usuario.primeiroAcesso && <span className="text-xs bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full font-medium">1º acesso</span>}
        </div>
        <div className="flex flex-wrap gap-1 mt-1">
          {usuario.roles.map((r) => (
            <Badge key={r.id} variant="secondary" className="text-xs capitalize">{r.nome}</Badge>
          ))}
          {(usuario.disciplinas?.length ?? 0) > 0 && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <BookOpen className="w-3 h-3" />
              {[...new Set((usuario.disciplinas ?? []).map((d) => d.disciplinaNome))].join(", ")}
            </span>
          )}
        </div>
      </div>

      <div className="flex gap-1 shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Foto de perfil" onClick={() => setShowFoto(true)}>
          <Camera className="w-4 h-4 text-muted-foreground" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Perfis" onClick={() => setShowRoles(true)}>
          <ShieldCheck className="w-4 h-4 text-muted-foreground" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Disciplinas" onClick={() => setShowDisc(true)}>
          <BookOpen className="w-4 h-4 text-muted-foreground" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Editar" onClick={() => setShowEdit(true)}>
          <Edit2 className="w-4 h-4 text-muted-foreground" />
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"><Trash2 className="w-4 h-4" /></Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
              <AlertDialogDescription>O usuário {usuario.nome ?? usuario.email} será permanentemente excluído.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => onDelete(usuario.id)} className="bg-destructive hover:bg-destructive/90">Excluir</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        {showEdit && <EditarUsuarioModal usuario={usuario} onClose={() => setShowEdit(false)} />}
      </Dialog>
      <Dialog open={showRoles} onOpenChange={setShowRoles}>
        {showRoles && <RolesModal usuario={usuario} allRoles={allRoles} onClose={() => setShowRoles(false)} />}
      </Dialog>
      <Dialog open={showDisc} onOpenChange={setShowDisc}>
        {showDisc && <DisciplinasModal usuario={usuario} allDisciplinas={allDisciplinas} onClose={() => setShowDisc(false)} />}
      </Dialog>
      <Dialog open={showFoto} onOpenChange={setShowFoto}>
        {showFoto && <FotoModal usuario={usuario} onClose={() => setShowFoto(false)} />}
      </Dialog>
    </div>
  );
}

function NovoUsuarioModal({
  allRoles, allDisciplinas, onClose,
}: { allRoles: RoleSummary[]; allDisciplinas: EnrichedDisc[]; onClose: () => void }) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [roleIds, setRoleIds] = useState<Set<string>>(new Set());
  const [disciplinaOfertaIds, setDisciplinaOfertaIds] = useState<Set<string>>(new Set());
  const create = useCreateUsuario();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [createdCreds, setCreatedCreds] = useState<{ nome: string | null; email: string; codigo: string; senha: string } | null>(null);

  const toggleRole = (id: string) => {
    const s = new Set(roleIds);
    if (s.has(id)) s.delete(id); else s.add(id);
    setRoleIds(s);
  };

  const toggleDisc = (id: string) => {
    const s = new Set(disciplinaOfertaIds);
    if (s.has(id)) s.delete(id); else s.add(id);
    setDisciplinaOfertaIds(s);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    create.mutate(
      {
        data: {
          nome: nome.trim() || undefined,
          email: email.trim(),
          roleIds: [...roleIds],
          disciplinaOfertaIds: [...disciplinaOfertaIds],
        },
      },
      {
        onSuccess: (data) => {
          queryClient.invalidateQueries({ queryKey: getListUsuariosQueryKey() });
          const d = data as unknown as { usuario: Usuario; senhaGerada: string };
          setCreatedCreds({ nome: d.usuario.nome, email: d.usuario.email, codigo: d.usuario.codigoAcesso, senha: d.senhaGerada });
        },
        onError: (err) => {
          const msg = (err as { data?: { error?: string } }).data?.error ?? "Erro ao criar usuário";
          toast({ title: msg, variant: "destructive" });
        },
      }
    );
  };

  if (createdCreds) {
    return (
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Usuário criado com sucesso</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Anote as credenciais abaixo — a senha não será exibida novamente.
            {createdCreds.nome && <> Um e-mail foi enviado para <strong>{createdCreds.email}</strong>.</>}
          </p>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
            {createdCreds.nome && (
              <div>
                <p className="text-xs text-amber-700 font-medium mb-0.5">Nome</p>
                <p className="font-semibold text-amber-900">{createdCreds.nome}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-amber-700 font-medium mb-0.5">E-mail</p>
              <p className="font-mono text-sm text-amber-900">{createdCreds.email}</p>
            </div>
            <div>
              <p className="text-xs text-amber-700 font-medium mb-0.5">Código de Acesso</p>
              <p className="font-mono text-xl font-bold text-amber-900 tracking-widest">{createdCreds.codigo}</p>
            </div>
            <div>
              <p className="text-xs text-amber-700 font-medium mb-0.5">Senha Provisória</p>
              <p className="font-mono text-xl font-bold text-amber-900">{createdCreds.senha}</p>
            </div>
          </div>
          <Button className="w-full" onClick={onClose}>Fechar</Button>
        </div>
      </DialogContent>
    );
  }

  return (
    <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Novo Usuário</DialogTitle></DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-5 pt-1">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="novo-nome">Nome</Label>
            <Input
              id="novo-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome completo"
              className="bg-background"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="novo-email">E-mail <span className="text-destructive">*</span></Label>
            <Input
              id="novo-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@escola.edu.br"
              className="bg-background"
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Perfil(s)</Label>
          {allRoles.length === 0
            ? <p className="text-sm text-muted-foreground">Nenhum perfil cadastrado.</p>
            : <div className="grid grid-cols-2 gap-2">
                {allRoles.map((r) => (
                  <label key={r.id} className="flex items-center gap-2 p-2 rounded-lg border hover:bg-muted/50 cursor-pointer select-none">
                    <Checkbox checked={roleIds.has(r.id)} onCheckedChange={() => toggleRole(r.id)} />
                    <span className="text-sm capitalize">{r.nome}</span>
                  </label>
                ))}
              </div>
          }
        </div>

        {allDisciplinas.some((d) => d.ofertas.length > 0) && (
          <div className="space-y-2">
            <Label>Disciplina(s)</Label>
            <div className="space-y-3 max-h-48 overflow-y-auto pr-1 border rounded-lg p-3 bg-muted/10">
              {allDisciplinas.filter((d) => d.ofertas.length > 0).map((disc) => (
                <div key={disc.id}>
                  <p className="text-xs font-semibold text-foreground mb-1 flex items-center gap-1.5">
                    <BookOpen className="w-3 h-3 text-violet-500" />{disc.nome}
                  </p>
                  <div className="grid grid-cols-2 gap-1 pl-4">
                    {disc.ofertas.map((o) => (
                      <label key={o.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/50 cursor-pointer select-none">
                        <Checkbox checked={disciplinaOfertaIds.has(o.id)} onCheckedChange={() => toggleDisc(o.id)} />
                        <span className="text-xs">{o.cursoNome} / {o.turnoNome}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Lock className="w-3 h-3" />Uma senha aleatória será gerada e enviada por e-mail ao usuário.
        </p>

        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={!email.trim() || create.isPending} className="flex-1">
            {create.isPending ? "Criando..." : "Criar Usuário"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
        </div>
      </form>
    </DialogContent>
  );
}

export default function UsuariosPage() {
  const [showNovoModal, setShowNovoModal] = useState(false);
  const { data: usuarios, isLoading, isError } = useListUsuarios();
  const { data: roles } = useListRoles();
  const { data: disciplinas } = useListDisciplinas();
  const del = useDeleteUsuario();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleDelete = (id: string) => {
    del.mutate({ id }, {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListUsuariosQueryKey() }); toast({ title: "Usuário excluído" }); },
      onError: () => toast({ title: "Erro ao excluir usuário", variant: "destructive" }),
    });
  };

  const allRoles: RoleSummary[] = (roles ?? []).map((r) => ({ id: r.id, nome: r.nome }));
  const allDisciplinas: EnrichedDisc[] = (disciplinas ?? []) as unknown as EnrichedDisc[];

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">Usuários</h1>
          <p className="text-muted-foreground mt-2">Gerencie os usuários do sistema. E-mails criptografados com AES-256.</p>
        </div>
        <Button onClick={() => setShowNovoModal(true)} className="shrink-0">
          <Plus className="w-4 h-4 mr-2" />Novo Usuário
        </Button>
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
        ) : isError ? (
          <div className="text-center py-12 border border-dashed rounded-lg bg-card">
            <AlertCircle className="w-12 h-12 text-destructive opacity-40 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">Erro ao carregar usuários.</p>
            <p className="text-sm text-muted-foreground mt-1">Verifique a conexão com o servidor.</p>
          </div>
        ) : usuarios?.length === 0 ? (
          <div className="text-center py-12 border border-dashed rounded-lg bg-card">
            <UserCog className="w-12 h-12 text-muted-foreground opacity-30 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">Nenhum usuário cadastrado.</p>
            <Button className="mt-4" onClick={() => setShowNovoModal(true)}>
              <Plus className="w-4 h-4 mr-2" />Criar primeiro usuário
            </Button>
          </div>
        ) : (
          (usuarios as unknown as Usuario[])?.map((u) => (
            <UsuarioRow key={u.id} usuario={u} allRoles={allRoles} allDisciplinas={allDisciplinas} onDelete={handleDelete} />
          ))
        )}
      </div>

      <Dialog open={showNovoModal} onOpenChange={setShowNovoModal}>
        {showNovoModal && (
          <NovoUsuarioModal
            allRoles={allRoles}
            allDisciplinas={allDisciplinas}
            onClose={() => setShowNovoModal(false)}
          />
        )}
      </Dialog>
    </div>
  );
}
