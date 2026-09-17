import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Eye } from "lucide-react";

async function apiFetch(url: string) {
  const r = await fetch(url, { credentials: "include" });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw body;
  return body;
}

export default function EeaaAnalisePage() {
  const [busca, setBusca] = useState("");

  const { data } = useQuery({
    queryKey: ["eeaa-estudantes-analise"],
    queryFn: () => apiFetch("/api/eeaa/estudantes"),
  });

  const lista = (data?.estudantes ?? []).filter((e: any) =>
    !busca || e.nomeEstudante?.toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Eye className="h-6 w-6 text-purple-600" />
        <h1 className="text-2xl font-bold">Acompanhamento EEAA</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Visão da gestão escolar — adaptações e metas dos estudantes atendidos pela EEAA.
        Dados clínicos não estão disponíveis nesta visão.
      </p>

      <Input placeholder="Buscar estudante..." value={busca} onChange={e => setBusca(e.target.value)} />

      <div className="space-y-3">
        {lista.map((est: any) => (
          <Card key={est.id}>
            <CardContent className="p-4 flex justify-between items-center">
              <div>
                <p className="font-medium">{est.nomeEstudante ?? "—"}</p>
                {est.necessidades && (
                  <p className="text-sm text-muted-foreground">{est.necessidades}</p>
                )}
              </div>
              <Badge variant={est.ativo ? "default" : "secondary"}>
                {est.ativo ? "Ativo" : "Inativo"}
              </Badge>
            </CardContent>
          </Card>
        ))}
        {lista.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhum estudante encontrado.
          </p>
        )}
      </div>
    </div>
  );
}
