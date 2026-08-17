import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import {
  useGetEstudante, useUpdateEstudante, useUploadFotoEstudante,
  useListTurmas, useListOcorrencias, useCreateOcorrencia, useDeleteOcorrencia,
  useListTiposOcorrencias,
  getGetEstudanteQueryKey, getGetCarometroQueryKey, getListOcorrenciasQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CameraCapture } from "@/components/camera-capture";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Save, Camera, Edit2, AlertTriangle, Plus, Trash2, Download } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type EmailEntry = { _id: number; email: string; tipo: "proprio" | "responsavel" };

export default function EstudantesDetail() {
  const [, params] = useRoute("/estudantes/:id");
  const id = params?.id ?? "";
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isEditing, setIsEditing] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [nome, setNome] = useState("");
  const [registro, setRegistro] = useState("");
  const [emails, setEmails] = useState<EmailEntry[]>([]);
  const [observacao, setObservacao] = useState("");
  const [turmaId, setTurmaId] = useState("");
  const emailCounter = useRef(0);
  const nextEmailId = () => { emailCounter.current += 1; return emailCounter.current; };

  const [showOcForm, setShowOcForm] = useState(false);
  const [ocTipoId, setOcTipoId] = useState("");
  const [ocData, setOcData] = useState("");
  const [ocObs, setOcObs] = useState("");

  const { data: estudante, isLoading } = useGetEstudante(id, { query: { queryKey: getGetEstudanteQueryKey(id), enabled: !!id } });
  const { data: turmas } = useListTurmas();
  const { data: tipos } = useListTiposOcorrencias({ status: "ativo" });
  const { data: ocorrencias, isLoading: ocLoading } = useListOcorrencias(
    id ? { estudanteId: id } : undefined,
    { query: { queryKey: ["/api/ocorrencias", { estudanteId: id }], enabled: !!id } }
  );
  const updateEstudante = useUpdateEstudante();
  const uploadFoto = useUploadFotoEstudante();
  const createOcorrencia = useCreateOcorrencia();
  const deleteOcorrencia = useDeleteOcorrencia();

  const resetForm = (e: typeof estudante) => {
    if (!e) return;
    setNome(e.nome);
    setRegistro(e.registro);
    setEmails(e.emails.map((em) => ({ _id: nextEmailId(), email: em.email, tipo: em.tipo as "proprio" | "responsavel" })));
    setObservacao(e.observacao ?? "");
    setTurmaId(e.turmaId);
  };

  useEffect(() => {
    if (estudante && !isEditing) resetForm(estudante);
  }, [estudante, isEditing]);

  const addEmail = () => setEmails((prev) => [...prev, { _id: nextEmailId(), email: "", tipo: "proprio" }]);
  const removeEmail = (i: number) => setEmails((prev) => prev.filter((_, idx) => idx !== i));
  const updateEmailEntry = (i: number, field: Exclude<keyof EmailEntry, "_id">, value: string) =>
    setEmails((prev) => prev.map((e, idx) => idx === i ? { ...e, [field]: value } : e));

  const handleSaveData = () => {
    if (!nome.trim() || !registro.trim() || !turmaId) return;
    const validEmails = emails.filter((e) => e.email.trim()).map(({ _id: _, ...e }) => e);
    updateEstudante.mutate(
      { id, data: { nome, registro, observacao: observacao.trim() || null, emails: validEmails, turmaId } },
      {
        onSuccess: (updated) => {
          queryClient.setQueryData(getGetEstudanteQueryKey(id), updated);
          queryClient.invalidateQueries({ queryKey: getGetCarometroQueryKey() });
          setIsEditing(false);
          toast({ title: "Dados atualizados com sucesso" });
        },
        onError: (err) => {
          const msg = (err as { data?: { error?: string } }).data?.error ?? "Erro ao atualizar dados";
          toast({ title: msg, variant: "destructive" });
        },
      }
    );
  };

  const handlePhotoCapture = (base64: string) => {
    uploadFoto.mutate(
      { id, data: { fotoBase64: base64 } },
      {
        onSuccess: (updated) => {
          queryClient.setQueryData(getGetEstudanteQueryKey(id), updated);
          queryClient.invalidateQueries({ queryKey: getGetCarometroQueryKey() });
          setIsCapturing(false);
          toast({ title: "Foto atualizada com sucesso!" });
        },
        onError: () => toast({ title: "Erro ao atualizar foto", variant: "destructive" }),
      }
    );
  };

  const handleAddOcorrencia = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ocTipoId || !ocData) return;
    createOcorrencia.mutate(
      { data: { estudanteId: id, tipoOcorrenciaId: ocTipoId, dataOcorrencia: ocData, observacao: ocObs || undefined } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListOcorrenciasQueryKey() });
          setShowOcForm(false); setOcTipoId(""); setOcData(""); setOcObs("");
          toast({ title: "Ocorrência registrada" });
        },
        onError: () => toast({ title: "Erro ao registrar ocorrência", variant: "destructive" }),
      }
    );
  };

  const handleDeleteOcorrencia = (ocId: string) => {
    deleteOcorrencia.mutate({ id: ocId }, {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListOcorrenciasQueryKey() }); toast({ title: "Ocorrência excluída" }); },
      onError: () => toast({ title: "Erro ao excluir ocorrência", variant: "destructive" }),
    });
  };

  const handleExportOcorrencias = () => {
    window.open(`${BASE}/api/ocorrencias/export?estudanteId=${id}`, "_blank");
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Skeleton className="w-32 h-8" />
        <Card><CardContent className="p-8 flex flex-col md:flex-row gap-8">
          <Skeleton className="w-64 h-80 rounded-xl" />
          <div className="space-y-4 flex-1"><Skeleton className="w-full h-12" /><Skeleton className="w-2/3 h-12" /></div>
        </CardContent></Card>
      </div>
    );
  }

  if (!estudante) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold">Estudante não encontrado</h2>
        <Button variant="link" onClick={() => setLocation("/estudantes")} className="mt-4">Voltar para a lista</Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/estudantes")} className="-ml-2 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-2xl font-bold tracking-tight text-primary truncate">{estudante.nome}</h1>
      </div>

      <Tabs defaultValue="dados" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="dados">Dados Cadastrais</TabsTrigger>
          <TabsTrigger value="ocorrencias">
            Ocorrências {ocorrencias && ocorrencias.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-amber-100 text-amber-800 text-xs font-semibold px-1.5 min-w-[20px]">{ocorrencias.length}</span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dados">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="md:col-span-1">
              <Card className="overflow-hidden border-border/50 shadow-sm bg-card">
                {isCapturing ? (
                  <div className="p-4 bg-muted/30">
                    <h3 className="font-semibold text-sm mb-4">Atualizar Foto</h3>
                    <CameraCapture onCapture={handlePhotoCapture} onCancel={() => setIsCapturing(false)} initialImage={estudante.fotoUrl} />
                  </div>
                ) : (
                  <div>
                    <div className="aspect-[3/4] bg-muted flex items-center justify-center">
                      {estudante.fotoUrl ? (
                        <img src={estudante.fotoUrl} alt={estudante.nome} className="w-full h-full object-cover" />
                      ) : (
                        <Avatar className="w-32 h-32 border-4 border-background">
                          <AvatarFallback className="text-4xl font-semibold bg-primary/10 text-primary">
                            {estudante.nome.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      )}
                    </div>
                    <div className="p-3 border-t">
                      <Button onClick={() => setIsCapturing(true)} variant="outline" className="w-full">
                        <Camera className="w-4 h-4 mr-2" />
                        {estudante.fotoUrl ? "Alterar Foto" : "Adicionar Foto"}
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            </div>

            <div className="md:col-span-2">
              <Card className="border-border/50 shadow-sm bg-card">
                <CardContent className="p-6 md:p-8">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-foreground">Informações Cadastrais</h2>
                    {!isEditing && (
                      <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                        <Edit2 className="w-4 h-4 mr-2" />Editar
                      </Button>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Nome Completo</Label>
                        <Input value={nome} onChange={(e) => setNome(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Registro</Label>
                        <Input value={registro} onChange={(e) => setRegistro(e.target.value)} />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>E-mails</Label>
                          <Button type="button" variant="ghost" size="sm" onClick={addEmail} className="h-7 text-xs gap-1 text-primary">
                            <Plus className="w-3 h-3" />Adicionar
                          </Button>
                        </div>
                        {emails.length === 0 && (
                          <p className="text-xs text-muted-foreground py-1">Nenhum e-mail cadastrado.</p>
                        )}
                        <div className="space-y-2">
                          {emails.map((entry, i) => (
                            <div key={entry._id} className="flex gap-2 items-start">
                              <div className="flex-1 space-y-1.5">
                                <Input
                                  type="email"
                                  value={entry.email}
                                  onChange={(e) => updateEmailEntry(i, "email", e.target.value)}
                                  placeholder="email@exemplo.com"
                                  className="h-9"
                                />
                                <Select value={entry.tipo} onValueChange={(v) => updateEmailEntry(i, "tipo", v)}>
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="proprio">
                                      <span className="flex items-center gap-1.5">
                                        <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
                                        Próprio do estudante
                                      </span>
                                    </SelectItem>
                                    <SelectItem value="responsavel">
                                      <span className="flex items-center gap-1.5">
                                        <span className="inline-block w-2 h-2 rounded-full bg-orange-400" />
                                        Do responsável
                                      </span>
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <Button type="button" variant="ghost" size="icon" onClick={() => removeEmail(i)} className="mt-0.5 h-9 w-9 text-muted-foreground hover:text-destructive shrink-0">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          E-mail <span className="text-blue-600 font-medium">próprio</span> é único por estudante. E-mail de <span className="text-orange-500 font-medium">responsável</span> pode ser compartilhado.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label>Turma</Label>
                        <Select value={turmaId} onValueChange={setTurmaId}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {turmas?.map((t) => (
                              <SelectItem key={t.id} value={t.id}>
                                {t.sigla} — {t.descricao} ({t.turnoNome})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>
                          Observação
                          <span className="text-xs text-muted-foreground ml-2">{observacao.length}/300</span>
                        </Label>
                        <Textarea value={observacao} onChange={(e) => setObservacao(e.target.value.slice(0, 300))}
                          placeholder="Informações adicionais relevantes sobre o estudante..." className="resize-none" rows={3} />
                      </div>
                      <div className="flex gap-2 pt-4">
                        <Button onClick={handleSaveData} disabled={updateEstudante.isPending}>
                          <Save className="w-4 h-4 mr-2" />Salvar Alterações
                        </Button>
                        <Button variant="ghost" onClick={() => { setIsEditing(false); resetForm(estudante); }}>Cancelar</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-1">Nome Completo</p>
                        <p className="text-lg font-semibold">{estudante.nome}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-1">Registro</p>
                        <p className="font-mono text-base">{estudante.registro}</p>
                      </div>
                      {(estudante.emails ?? []).length > 0 && (
                        <div>
                          <p className="text-sm font-medium text-muted-foreground mb-2">E-mails</p>
                          <div className="space-y-1.5">
                            {(estudante.emails ?? []).map((em) => (
                              <div key={em.id} className="flex items-center gap-2">
                                <span className="text-sm">{em.email}</span>
                                {em.tipo === "proprio" ? (
                                  <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5">
                                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500" />Próprio
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded px-1.5 py-0.5">
                                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-400" />Responsável
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground mb-1">Turma</p>
                          <div className="inline-flex px-3 py-1 rounded-md bg-secondary/50 text-secondary-foreground font-medium text-sm">{estudante.turmaSigla}</div>
                          <p className="text-xs text-muted-foreground mt-1">{estudante.turmaDescricao}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground mb-1">Turno</p>
                          <div className="inline-flex px-3 py-1 rounded-md bg-muted text-muted-foreground font-medium text-sm">{estudante.turnoNome}</div>
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-1">Curso</p>
                        <div className="inline-flex px-3 py-1 rounded-md bg-violet-100 text-violet-700 font-medium text-sm">{estudante.cursoNome}</div>
                      </div>
                      {estudante.observacao && (
                        <div>
                          <p className="text-sm font-medium text-muted-foreground mb-1">Observação</p>
                          <p className="text-sm text-foreground whitespace-pre-wrap bg-muted/30 rounded-md px-3 py-2">{estudante.observacao}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-1">Data de Cadastro</p>
                        <p className="text-sm">{new Date(estudante.criadoEm).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="ocorrencias">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Ocorrências de {estudante.nome}</h2>
              <div className="flex gap-2">
                {(ocorrencias?.length ?? 0) > 0 && (
                  <Button variant="outline" size="sm" onClick={handleExportOcorrencias}>
                    <Download className="w-4 h-4 mr-2" />Exportar XLSX
                  </Button>
                )}
                <Button size="sm" onClick={() => setShowOcForm(!showOcForm)}>
                  <Plus className="w-4 h-4 mr-2" />Nova Ocorrência
                </Button>
              </div>
            </div>

            {showOcForm && (
              <Card className="border-border/50 shadow-sm">
                <CardContent className="pt-6">
                  <form onSubmit={handleAddOcorrencia} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Tipo de Ocorrência *</Label>
                      <Select value={ocTipoId} onValueChange={setOcTipoId} required>
                        <SelectTrigger className="bg-background"><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                        <SelectContent>
                          {tipos?.length === 0
                            ? <SelectItem value="__empty__" disabled>Nenhum tipo cadastrado</SelectItem>
                            : tipos?.map((t) => <SelectItem key={t.id} value={t.id}>{t.descricao}</SelectItem>)
                          }
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Data da Ocorrência *</Label>
                      <Input type="date" value={ocData} onChange={(e) => setOcData(e.target.value)} required className="bg-background" />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Observação</Label>
                      <Textarea value={ocObs} onChange={(e) => setOcObs(e.target.value)} placeholder="Descrição detalhada..." className="bg-background resize-none" rows={3} />
                    </div>
                    <div className="sm:col-span-2 flex gap-2">
                      <Button type="submit" size="sm" disabled={createOcorrencia.isPending || !ocTipoId || !ocData}>
                        {createOcorrencia.isPending ? "Salvando..." : "Registrar"}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setShowOcForm(false)}>Cancelar</Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}

            {ocLoading ? (
              <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
            ) : ocorrencias?.length === 0 ? (
              <div className="text-center py-12 border border-dashed rounded-lg bg-card">
                <AlertTriangle className="w-10 h-10 text-muted-foreground opacity-30 mx-auto mb-3" />
                <p className="text-muted-foreground font-medium">Nenhuma ocorrência registrada para este estudante.</p>
              </div>
            ) : (
              <div className="rounded-xl border bg-card shadow-sm divide-y overflow-hidden">
                {ocorrencias?.map((o) => (
                  <div key={o.id} className="p-4 flex items-start gap-4 hover:bg-muted/30 transition-colors">
                    <div className="p-2 bg-amber-100 text-amber-700 rounded-lg shrink-0 mt-0.5">
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-sm">{o.tipoOcorrenciaDescricao}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(o.dataOcorrencia).toLocaleDateString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "long", year: "numeric" })}
                        </span>
                      </div>
                      {o.observacao && <p className="text-sm text-muted-foreground mt-1">{o.observacao}</p>}
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10 shrink-0">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir ocorrência?</AlertDialogTitle>
                          <AlertDialogDescription>Esta ocorrência será permanentemente excluída.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDeleteOcorrencia(o.id)} className="bg-destructive hover:bg-destructive/90">Excluir</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
