import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useCreateEstudante, useListTurmas, getListEstudantesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CameraCapture } from "@/components/camera-capture";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Save, Plus, Trash2 } from "lucide-react";

type EmailEntry = { _id: number; email: string; tipo: "proprio" | "responsavel" };

export default function EstudantesNew() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [nome, setNome] = useState("");
  const [registro, setRegistro] = useState("");
  const [emails, setEmails] = useState<EmailEntry[]>([]);
  const [observacao, setObservacao] = useState("");
  const [turmaId, setTurmaId] = useState("");
  const [fotoBase64, setFotoBase64] = useState<string | null>(null);
  const emailCounter = useRef(0);
  const nextEmailId = () => { emailCounter.current += 1; return emailCounter.current; };

  const { data: turmas } = useListTurmas();
  const createEstudante = useCreateEstudante();

  const addEmail = () => setEmails((prev) => [...prev, { _id: nextEmailId(), email: "", tipo: "proprio" }]);
  const removeEmail = (i: number) => setEmails((prev) => prev.filter((_, idx) => idx !== i));
  const updateEmail = (i: number, field: Exclude<keyof EmailEntry, "_id">, value: string) =>
    setEmails((prev) => prev.map((e, idx) => idx === i ? { ...e, [field]: value } : e));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim() || !registro.trim() || !turmaId) {
      toast({ title: "Preencha todos os campos obrigatórios", variant: "destructive" });
      return;
    }
    const validEmails = emails.filter((e) => e.email.trim()).map(({ _id: _, ...e }) => e);
    createEstudante.mutate(
      {
        data: {
          nome: nome.trim(),
          registro: registro.trim(),
          observacao: observacao.trim() || undefined,
          emails: validEmails,
          turmaId,
        },
      },
      {
        onSuccess: (est) => {
          queryClient.invalidateQueries({ queryKey: getListEstudantesQueryKey() });
          toast({ title: "Cadastro realizado com sucesso!" });
          setLocation(`/estudantes/${est.id}`);
        },
        onError: (err) => {
          const msg = (err as { data?: { error?: string } }).data?.error ?? "Erro ao cadastrar estudante";
          toast({ title: msg, variant: "destructive" });
        },
      }
    );
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/estudantes")} className="-ml-2 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary">Novo Estudante</h1>
          <p className="text-sm text-muted-foreground">Cadastre um novo estudante no sistema.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
        <Card className="border-border/50 shadow-sm order-2 md:order-1">
          <CardHeader>
            <CardTitle>Dados do Estudante</CardTitle>
            <CardDescription>Informações básicas para identificação.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome Completo *</Label>
              <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: João da Silva" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="registro">Registro *</Label>
              <Input id="registro" value={registro} onChange={(e) => setRegistro(e.target.value)} placeholder="Ex: 2024001" required />
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
                        onChange={(e) => updateEmail(i, "email", e.target.value)}
                        placeholder="email@exemplo.com"
                        className="h-9"
                      />
                      <Select value={entry.tipo} onValueChange={(v) => updateEmail(i, "tipo", v)}>
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
              <Label htmlFor="turma">Turma *</Label>
              <Select value={turmaId} onValueChange={setTurmaId} required>
                <SelectTrigger id="turma"><SelectValue placeholder="Selecione a turma" /></SelectTrigger>
                <SelectContent>
                  {turmas?.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.sigla} — {t.descricao} <span className="text-muted-foreground text-xs">({t.cursoNome} / {t.turnoNome})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="observacao">
                Observação
                <span className="text-xs text-muted-foreground ml-2">{observacao.length}/300</span>
              </Label>
              <Textarea
                id="observacao"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value.slice(0, 300))}
                placeholder="Informações adicionais relevantes sobre o estudante..."
                className="resize-none"
                rows={3}
              />
            </div>
            <div className="pt-4 border-t mt-6">
              <Button type="submit" className="w-full" disabled={createEstudante.isPending}>
                <Save className="w-4 h-4 mr-2" />
                {createEstudante.isPending ? "Salvando..." : "Salvar Cadastro"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-sm order-1 md:order-2 overflow-hidden">
          <CardHeader className="bg-muted/30 border-b">
            <CardTitle>Fotografia</CardTitle>
            <CardDescription>Use a câmera ou envie um arquivo.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <CameraCapture onCapture={(base64) => setFotoBase64(base64)} initialImage={fotoBase64} />
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
