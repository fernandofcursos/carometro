import { useState } from "react";
import { Link } from "wouter";
import {
  useGetCarometro, useListTurnos, useListTurmas, useListCursos,
  useListTiposOcorrencias, useCreateOcorrencia,
  getListOcorrenciasQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Camera, Filter, AlertTriangle, Save } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth";

type CarometroEstudante = {
  id: string;
  nome: string;
  registro: string;
  fotoUrl: string | null;
  turmaId: string;
  turmaSigla: string;
  turmaDescricao: string;
  cursoId: string;
  cursoNome: string;
  turnoId: string;
  turnoNome: string;
};

const hoje = new Date().toISOString().slice(0, 10);
const hojeFormatado = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

function OcorrenciaModal({
  estudante,
  onClose,
}: {
  estudante: CarometroEstudante;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [dataOcorrencia, setDataOcorrencia] = useState(hoje);
  const [tipoId, setTipoId] = useState("");
  const [disciplinaOfertaId, setDisciplinaOfertaId] = useState("");
  const [observacao, setObservacao] = useState("");
  const [enviarEmail, setEnviarEmail] = useState(false);

  const { data: tipos } = useListTiposOcorrencias({ status: "ativo" });
  const createOcorrencia = useCreateOcorrencia();

  const disciplinasUsuario = user?.disciplinas ?? [];

  const disciplinasFiltradas = disciplinasUsuario.length > 0 ? disciplinasUsuario : [];

  const disciplinaSelecionada = disciplinasFiltradas.find((d) => d.ofertaId === disciplinaOfertaId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tipoId || !dataOcorrencia) return;

    createOcorrencia.mutate(
      {
        data: {
          estudanteId: estudante.id,
          tipoOcorrenciaId: tipoId,
          disciplinaId: disciplinaSelecionada?.disciplinaId ?? undefined,
          registradoPorId: user?.id ?? undefined,
          dataOcorrencia,
          observacao: observacao.trim() || undefined,
          enviarEmail: enviarEmail || undefined,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListOcorrenciasQueryKey() });
          toast({ title: "Ocorrência registrada com sucesso" });
          onClose();
        },
        onError: () => {
          toast({ title: "Erro ao registrar ocorrência", variant: "destructive" });
        },
      }
    );
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-700">
            <AlertTriangle className="w-5 h-5" />
            Registrar Ocorrência
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="rounded-lg bg-muted/40 border px-4 py-3 space-y-2">
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Estudante</p>
              <p className="font-semibold text-foreground">{estudante.nome}</p>
              <p className="text-xs text-muted-foreground font-mono">{estudante.registro} · {estudante.turmaSigla}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Data de Registro</p>
              <p className="text-sm text-foreground">{hojeFormatado}</p>
            </div>
            {user && (
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Professor(a)</p>
                <p className="text-sm text-foreground">{user.nome ?? user.email}</p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="data-ocorrencia">Data da Ocorrência *</Label>
            <Input
              id="data-ocorrencia"
              type="date"
              value={dataOcorrencia}
              onChange={(e) => setDataOcorrencia(e.target.value)}
              max={hoje}
              required
            />
          </div>

          {disciplinasFiltradas.length > 0 && (
            <div className="space-y-2">
              <Label>Disciplina</Label>
              <Select value={disciplinaOfertaId} onValueChange={setDisciplinaOfertaId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a disciplina (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhuma disciplina</SelectItem>
                  {disciplinasFiltradas.map((d) => (
                    <SelectItem key={d.ofertaId} value={d.ofertaId}>
                      {d.disciplinaNome}
                      {disciplinasFiltradas.filter((x) => x.disciplinaNome === d.disciplinaNome).length > 1 && (
                        <span className="text-muted-foreground ml-1 text-xs">({d.turnoNome} · {d.cursoNome})</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="tipo">Tipo de Ocorrência *</Label>
            <Select value={tipoId} onValueChange={setTipoId} required>
              <SelectTrigger id="tipo">
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                {tipos?.length === 0
                  ? <SelectItem value="__empty__" disabled>Nenhum tipo cadastrado</SelectItem>
                  : tipos?.map((t) => <SelectItem key={t.id} value={t.id}>{t.descricao}</SelectItem>)
                }
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="observacao">Descrição da Ocorrência</Label>
            <Textarea
              id="observacao"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Descreva detalhadamente o ocorrido..."
              rows={4}
              className="resize-none"
            />
          </div>

          <div className="flex items-start gap-3 rounded-lg border px-4 py-3 bg-muted/10">
            <Checkbox
              id="enviar-email"
              checked={enviarEmail}
              onCheckedChange={(v) => setEnviarEmail(!!v)}
              className="mt-0.5"
            />
            <div>
              <Label htmlFor="enviar-email" className="font-medium cursor-pointer">
                Notificar responsável por e-mail
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Envia esta ocorrência para os e-mails de responsável cadastrados para o estudante.
              </p>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button
              type="submit"
              disabled={createOcorrencia.isPending || !tipoId || !dataOcorrencia}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              <Save className="w-4 h-4 mr-2" />
              {createOcorrencia.isPending ? "Registrando..." : "Registrar Ocorrência"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Carometro() {
  const [turnoId, setTurnoId] = useState<string>("all");
  const [cursoId, setCursoId] = useState<string>("all");
  const [turmaId, setTurmaId] = useState<string>("all");
  const [selectedEstudante, setSelectedEstudante] = useState<CarometroEstudante | null>(null);

  const { data: turnos } = useListTurnos();
  const { data: cursos } = useListCursos();
  const { data: turmas } = useListTurmas(
    turnoId !== "all" || cursoId !== "all"
      ? { ...(turnoId !== "all" && { turnoId }), ...(cursoId !== "all" && { cursoId }) }
      : undefined
  );

  const params = {
    ...(turnoId !== "all" && { turnoId }),
    ...(cursoId !== "all" && { cursoId }),
    ...(turmaId !== "all" && { turmaId }),
  };

  const { data: groups, isLoading } = useGetCarometro(
    Object.keys(params).length > 0 ? params : undefined,
    { query: { queryKey: ["/api/carometro", params] } }
  );

  const handleTurnoChange = (val: string) => { setTurnoId(val); setTurmaId("all"); };
  const handleCursoChange = (val: string) => { setCursoId(val); setTurmaId("all"); };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">Carômetro de Estudantes</h1>
          <p className="text-muted-foreground mt-2">Visualize os registros fotográficos por curso e turma.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Filter className="w-4 h-4 text-muted-foreground hidden sm:block" />
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
              {turmas?.map((t) => <SelectItem key={t.id} value={t.id}>{t.sigla}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-8">
          {[1, 2].map((i) => (
            <div key={i} className="space-y-4">
              <Skeleton className="h-8 w-64" />
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {[1, 2, 3, 4, 5, 6].map((j) => <Skeleton key={j} className="aspect-[3/4] rounded-xl" />)}
              </div>
            </div>
          ))}
        </div>
      ) : groups?.length === 0 ? (
        <div className="py-20 text-center flex flex-col items-center border rounded-xl bg-card border-dashed">
          <Camera className="w-12 h-12 text-muted-foreground opacity-30 mb-4" />
          <h3 className="text-lg font-semibold">Nenhum registro encontrado</h3>
          <p className="text-muted-foreground max-w-sm mt-1">Não há estudantes para os filtros selecionados.</p>
        </div>
      ) : (
        <div className="space-y-12">
          {groups?.map((group) => (
            <div key={group.turmaId} className="space-y-4">
              <div className="flex items-center gap-3 border-b pb-2">
                <h2 className="text-2xl font-bold text-foreground">{group.turmaSigla}</h2>
                <span className="text-base text-muted-foreground">{group.turmaDescricao}</span>
                <span className="px-2.5 py-0.5 rounded-full bg-secondary text-secondary-foreground text-xs font-semibold">{group.turnoNome}</span>
                <span className="px-2.5 py-0.5 rounded-full bg-violet-100 text-violet-700 text-xs font-semibold">{group.cursoNome}</span>
                <span className="text-sm text-muted-foreground ml-auto">{group.estudantes.length} estudante{group.estudantes.length !== 1 && "s"}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {group.estudantes.map((est) => (
                  <Card
                    key={est.id}
                    className="overflow-hidden border-border/60 bg-card flex flex-col"
                  >
                    <Link href={`/estudantes/${est.id}`} className="block">
                      <div className="aspect-[3/4] relative bg-secondary/30 flex items-center justify-center overflow-hidden group cursor-pointer hover:opacity-90 transition-opacity">
                        {est.fotoUrl ? (
                          <img src={est.fotoUrl} alt={est.nome} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                        ) : (
                          <Avatar className="w-20 h-20 shadow-sm border-2 border-background">
                            <AvatarFallback className="text-xl font-medium bg-primary/10 text-primary">
                              {est.nome.substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                        )}
                      </div>
                      <div className="px-2 pt-2">
                        <p className="text-xs font-semibold truncate hover:text-primary transition-colors">{est.nome}</p>
                        <p className="text-xs text-muted-foreground truncate">{est.registro}</p>
                      </div>
                    </Link>
                    <div className="px-2 pb-2 pt-1.5 mt-auto">
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full h-7 text-xs gap-1 border-amber-200 text-amber-700 hover:bg-amber-50 hover:border-amber-400"
                        onClick={() => setSelectedEstudante(est as CarometroEstudante)}
                      >
                        <AlertTriangle className="w-3 h-3" />
                        Ocorrência
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedEstudante && (
        <OcorrenciaModal
          estudante={selectedEstudante}
          onClose={() => setSelectedEstudante(null)}
        />
      )}
    </div>
  );
}
