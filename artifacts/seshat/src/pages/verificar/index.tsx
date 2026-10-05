import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { CheckCircle, XCircle, Loader2, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type VerificacaoStatus = {
  status: "ativa" | "cancelada" | "revogada" | "expirada";
  tipo: string;
  ano: number;
  semestre: number;
};

type Estado =
  | { fase: "verificando" }
  | { fase: "valido"; dados: VerificacaoStatus }
  | { fase: "invalido"; motivo: string }
  | { fase: "erro"; mensagem: string };

async function verificarAssinaturaLocal(token: string, escolaId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/verificar/v2/pubkey/${escolaId}`);
    if (!res.ok) return false;
    const { publicKey } = await res.json();
    if (!publicKey) return false;

    const [payloadB64, sigB64] = token.split(".");
    if (!payloadB64 || !sigB64) return false;

    const pubKeyRaw = Uint8Array.from(atob(publicKey), (c) => c.charCodeAt(0));
    const cryptoKey = await crypto.subtle.importKey(
      "raw", pubKeyRaw, { name: "Ed25519" }, false, ["verify"],
    );
    const msg = new TextEncoder().encode(payloadB64);
    const sig = Uint8Array.from(atob(sigB64.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    return await crypto.subtle.verify({ name: "Ed25519" }, cryptoKey, sig, msg);
  } catch {
    return false;
  }
}

function decodePayload(token: string): { escolaId?: string; tipo?: string; exp?: number } | null {
  try {
    const [b64] = token.split(".");
    return JSON.parse(atob(b64.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

const TIPO_LABEL: Record<string, string> = {
  carteira: "Carteira de Estudante",
  "cartao-semestral": "Cartão de Liberação Semestral",
  "cartao-diario": "Cartão de Liberação Diário",
};

export default function VerificarPage() {
  const { token } = useParams<{ token: string }>();
  const [estado, setEstado] = useState<Estado>({ fase: "verificando" });

  useEffect(() => {
    if (!token) {
      setEstado({ fase: "invalido", motivo: "Token não informado." });
      return;
    }
    verificar(decodeURIComponent(token));
  }, [token]);

  async function verificar(tk: string) {
    const payload = decodePayload(tk);
    if (!payload?.escolaId) {
      setEstado({ fase: "invalido", motivo: "Token malformado." });
      return;
    }

    if (payload.exp && payload.exp < Date.now()) {
      setEstado({ fase: "invalido", motivo: "Documento expirado." });
      return;
    }

    const assinaturaValida = await verificarAssinaturaLocal(tk, payload.escolaId);
    if (!assinaturaValida) {
      setEstado({ fase: "invalido", motivo: "Assinatura digital inválida. O documento pode ter sido adulterado." });
      return;
    }

    try {
      const res = await fetch(`/api/verificar/v2/status/${encodeURIComponent(tk)}`);
      if (res.status === 404) {
        setEstado({ fase: "invalido", motivo: "Documento não encontrado no sistema." });
        return;
      }
      if (!res.ok) {
        setEstado({ fase: "erro", mensagem: "Erro ao consultar o sistema." });
        return;
      }
      const dados: VerificacaoStatus = await res.json();
      if (dados.status === "ativa") {
        setEstado({ fase: "valido", dados });
      } else {
        const motivo =
          dados.status === "cancelada" ? "Documento cancelado pela instituição." :
          dados.status === "revogada"  ? "Documento revogado." :
          "Documento inativo.";
        setEstado({ fase: "invalido", motivo });
      }
    } catch {
      setEstado({ fase: "erro", mensagem: "Falha de conexão ao consultar o sistema." });
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <ShieldCheck className="w-10 h-10 text-primary" />
          </div>
          <CardTitle className="text-lg">Verificação de Autenticidade</CardTitle>
          <p className="text-sm text-muted-foreground">Sistema Carômetro — GDF / SEEDF</p>
        </CardHeader>
        <CardContent>
          {estado.fase === "verificando" && (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Verificando assinatura digital…</p>
            </div>
          )}

          {estado.fase === "valido" && (
            <div className="flex flex-col items-center gap-4 py-4">
              <CheckCircle className="w-14 h-14 text-green-600" />
              <Badge variant="outline" className="border-green-600 text-green-700 text-base px-4 py-1">
                Documento Autêntico
              </Badge>
              <div className="w-full space-y-2 text-sm mt-2">
                <div className="flex justify-between border-b pb-1">
                  <span className="text-muted-foreground">Tipo</span>
                  <span className="font-medium">{TIPO_LABEL[estado.dados.tipo] ?? estado.dados.tipo}</span>
                </div>
                <div className="flex justify-between border-b pb-1">
                  <span className="text-muted-foreground">Período</span>
                  <span className="font-medium">{estado.dados.ano} / {estado.dados.semestre}º semestre</span>
                </div>
                <div className="flex justify-between pb-1">
                  <span className="text-muted-foreground">Situação</span>
                  <span className="font-medium text-green-700">Ativo</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground text-center mt-2">
                Assinatura Ed25519 verificada com sucesso. Este documento é emitido e gerenciado pela instituição de ensino.
              </p>
            </div>
          )}

          {estado.fase === "invalido" && (
            <div className="flex flex-col items-center gap-4 py-4">
              <XCircle className="w-14 h-14 text-red-600" />
              <Badge variant="destructive" className="text-base px-4 py-1">
                Documento Inválido
              </Badge>
              <p className="text-sm text-center text-red-700 mt-1">{estado.motivo}</p>
              <p className="text-xs text-muted-foreground text-center">
                Este documento não pode ser aceito como válido. Em caso de dúvida, consulte diretamente a secretaria da instituição.
              </p>
            </div>
          )}

          {estado.fase === "erro" && (
            <div className="flex flex-col items-center gap-4 py-4">
              <XCircle className="w-14 h-14 text-yellow-600" />
              <p className="text-sm text-center text-yellow-700">{estado.mensagem}</p>
              <button
                className="text-sm text-primary underline"
                onClick={() => {
                  setEstado({ fase: "verificando" });
                  if (token) verificar(decodeURIComponent(token));
                }}
              >
                Tentar novamente
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
