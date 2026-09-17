import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { BookOpen } from "lucide-react";

async function apiFetch(url: string) {
  const r = await fetch(url, { credentials: "include" });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw body;
  return body;
}

const LAUDO_LABEL: Record<string, string> = {
  DI: "DI", DF: "DF", DOWN: "Down", TEA: "TEA", AH_SD: "AH/SD",
};

export default function SalaRecursosProfessores() {
  const [busca, setBusca] = useState("");

  const { data } = useQuery({
    queryKey: ["sr-adequacoes-professor"],
    queryFn: () => apiFetch("/api/sala-recursos/portal/professor/adequacoes"),
  });
  const { data: eneesData } = useQuery({
    queryKey: ["sr-enees-professor"],
    queryFn: () => apiFetch("/api/sala-recursos/estudantes-enee"),
  });

  const adequacoes: any[] = data?.adequacoes ?? [];
  const enees: any[] = eneesData?.estudantes ?? [];

  const itens = adequacoes
    .map(a => ({ ...a, enee: enees.find(e => e.id === a.estudanteId) }))
    .filter(a => !busca || (a.enee?.nome ?? "").toLowerCase().includes(busca.toLowerCase()));

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b px-6 py-4 flex-shrink-0">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <BookOpen className="h-5 w-5" /> Adequações Curriculares — ENEEs
        </h1>
        <p className="text-sm text-muted-foreground">Visualização das adequações dos seus estudantes com necessidades especiais</p>
      </div>

      <div className="p-4 flex-shrink-0">
        <Input placeholder="Buscar por nome do estudante..." value={busca} onChange={e => setBusca(e.target.value)} className="max-w-sm" />
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
        {itens.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-12">Nenhum ENEE com plano ativo nas suas turmas.</p>
        )}
        {itens.map(item => (
          <div key={item.id} className="border rounded-lg bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">{item.enee?.nome ?? item.estudanteId}</p>
                <Badge variant="outline" className="text-xs mt-1">{LAUDO_LABEL[item.enee?.laudo] ?? item.enee?.laudo}</Badge>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <p>Prazo: {item.prazo}</p>
                <p>{item.ano}/{item.semestre}º sem.</p>
              </div>
            </div>
            <div className="grid gap-2 text-sm border-t pt-3">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-0.5">Objetivos</p>
                <p>{item.objetivos}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-0.5">Estratégias</p>
                <p>{item.estrategias}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-0.5">Avaliação</p>
                <p>{item.avaliacao}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground border-t pt-2">
              Dados compartilhados pela Sala de Recursos — somente leitura.
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
