import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { HeartHandshake } from "lucide-react";

async function apiFetch(url: string, opts?: RequestInit) {
  const r = await fetch(url, { credentials: "include", ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw body;
  return body;
}

export default function SoeAnalisePage() {
  const [busca, setBusca] = useState("");

  const { data } = useQuery({
    queryKey: ["soe-atendimentos-analise"],
    queryFn: () => apiFetch("/api/soe/atendimentos"),
  });

  const { data: acoes } = useQuery({
    queryKey: ["soe-acoes-analise"],
    queryFn: () => apiFetch("/api/soe/acoes"),
  });

  const atendimentos = (data?.atendimentos ?? []).filter((a: any) =>
    !busca || a.motivo?.toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <HeartHandshake className="h-6 w-6 text-teal-600" />
        <h1 className="text-2xl font-bold">Acompanhamento SOE</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Visão da gestão escolar — acompanhamento de atendimentos e ações do SOE.
        <strong> Registros sigilosos não estão disponíveis nesta visão conforme LGPD.</strong>
      </p>

      <Input placeholder="Buscar por motivo..." value={busca} onChange={e => setBusca(e.target.value)} />

      <div className="space-y-3">
        {atendimentos.map((a: any) => (
          <Card key={a.id}>
            <CardContent className="p-4 flex justify-between items-center">
              <div>
                <p className="font-medium text-sm">{a.dataAtendimento} · {a.tipo}</p>
                <p className="text-sm text-muted-foreground mt-1">{a.motivo}</p>
              </div>
              <Badge variant={a.status === "aberto" ? "default" : "secondary"}>
                {a.status.replace(/_/g, " ")}
              </Badge>
            </CardContent>
          </Card>
        ))}
        {atendimentos.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhum atendimento encontrado.
          </p>
        )}
      </div>

      {(acoes?.acoes?.length ?? 0) > 0 && (
        <>
          <h2 className="text-lg font-semibold mt-4">Ações coletivas</h2>
          <div className="space-y-3">
            {acoes.acoes.filter((a: any) => a.tipo === "coletiva").map((a: any) => (
              <Card key={a.id}>
                <CardContent className="p-4 flex justify-between items-center">
                  <div>
                    <p className="font-medium">{a.titulo}</p>
                    {a.prazo && <p className="text-sm text-muted-foreground">Prazo: {a.prazo}</p>}
                  </div>
                  <Badge variant={a.status === "concluida" ? "default" : "secondary"}>
                    {a.status.replace(/_/g, " ")}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
