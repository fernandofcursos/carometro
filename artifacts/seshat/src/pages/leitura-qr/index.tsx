import { useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader, IScannerControls } from "@zxing/browser";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, XCircle, Camera, QrCode, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type ResultadoCarteira = {
  valido: boolean;
  tipo?: string;
  estudanteNome?: string;
  cursoNome?: string;
  turmaSigla?: string;
  status?: string;
  erro?: string;
};

type ResultadoCartao = {
  valido: boolean;
  tipo?: string;
  ocorrenciaId?: string;
  emailEnviado?: boolean;
  jaRegistrado?: boolean;
  horarioSaida?: string;
  erro?: string;
};

type Estado<T> =
  | { fase: "idle" }
  | { fase: "lendo" }
  | { fase: "ok"; dados: T }
  | { fase: "erro"; mensagem: string };

function usarScanner(onRead: (token: string) => void) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [ativo, setAtivo] = useState(false);
  const pausadoRef = useRef(false);

  const iniciar = async () => {
    if (!videoRef.current) return;
    try {
      const reader = new BrowserQRCodeReader();
      controlsRef.current = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current,
        (result) => {
          if (result && !pausadoRef.current) {
            pausadoRef.current = true;
            onRead(result.getText());
            setTimeout(() => { pausadoRef.current = false; }, 3000);
          }
        },
      );
      setAtivo(true);
    } catch {
      // sem câmera ou permissão negada — scanner fica inativo
    }
  };

  const parar = () => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setAtivo(false);
  };

  useEffect(() => () => { controlsRef.current?.stop(); }, []);

  return { videoRef, ativo, iniciar, parar };
}

function ScannerPanel({ onRead }: { onRead: (token: string) => void }) {
  const [tokenManual, setTokenManual] = useState("");
  const { videoRef, ativo, iniciar, parar } = usarScanner(onRead);

  return (
    <div className="space-y-4">
      <div className="relative aspect-video bg-black rounded-md overflow-hidden">
        <video ref={videoRef} className="w-full h-full object-cover" />
        {!ativo && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-900/80">
            <Camera className="w-10 h-10 text-white" />
            <Button onClick={iniciar} variant="secondary" size="sm">Iniciar câmera</Button>
          </div>
        )}
      </div>
      {ativo && (
        <Button onClick={parar} variant="outline" size="sm" className="w-full">Parar câmera</Button>
      )}
      <div className="flex gap-2">
        <div className="flex-1">
          <Label htmlFor="token-manual" className="sr-only">Token manual</Label>
          <Input
            id="token-manual"
            placeholder="Cole o token aqui…"
            value={tokenManual}
            onChange={(e) => setTokenManual(e.target.value)}
          />
        </div>
        <Button
          onClick={() => { if (tokenManual.trim()) { onRead(tokenManual.trim()); setTokenManual(""); } }}
          disabled={!tokenManual.trim()}
        >
          Verificar
        </Button>
      </div>
    </div>
  );
}

function ResultadoCarteiraView({ estado }: { estado: Estado<ResultadoCarteira> }) {
  if (estado.fase === "idle") return <p className="text-sm text-muted-foreground text-center py-4">Aponte a câmera para um QR Code de carteira.</p>;
  if (estado.fase === "lendo") return <div className="flex justify-center py-4"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (estado.fase === "erro") return <Alert variant="destructive"><AlertDescription>{estado.mensagem}</AlertDescription></Alert>;

  const { dados } = estado;
  if (!dados.valido) {
    return (
      <Alert variant="destructive">
        <XCircle className="w-4 h-4" />
        <AlertDescription>
          {dados.status === "cancelada" ? "Carteira cancelada." : dados.status === "revogada" ? "Carteira revogada." : dados.erro ?? "Carteira inválida."}
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Card className="border-green-500">
      <CardContent className="pt-4 space-y-2">
        <div className="flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-green-600" />
          <Badge variant="outline" className="border-green-600 text-green-700">Carteira válida</Badge>
        </div>
        <div className="text-sm space-y-1 mt-2">
          <div><span className="text-muted-foreground">Estudante: </span><strong>{dados.estudanteNome}</strong></div>
          <div><span className="text-muted-foreground">Curso: </span>{dados.cursoNome}</div>
          <div><span className="text-muted-foreground">Turma: </span>{dados.turmaSigla}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function ResultadoCartaoView({ estado }: { estado: Estado<ResultadoCartao> }) {
  if (estado.fase === "idle") return <p className="text-sm text-muted-foreground text-center py-4">Aponte a câmera para um QR Code de cartão de liberação.</p>;
  if (estado.fase === "lendo") return <div className="flex justify-center py-4"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (estado.fase === "erro") return <Alert variant="destructive"><AlertDescription>{estado.mensagem}</AlertDescription></Alert>;

  const { dados } = estado;
  if (!dados.valido) {
    return (
      <Alert variant="destructive">
        <XCircle className="w-4 h-4" />
        <AlertDescription>{dados.erro ?? "Cartão inválido."}{dados.horarioSaida ? ` Horário autorizado: ${dados.horarioSaida}.` : ""}</AlertDescription>
      </Alert>
    );
  }
  if (dados.jaRegistrado) {
    return (
      <Alert>
        <CheckCircle className="w-4 h-4" />
        <AlertDescription>Saída já registrada anteriormente.</AlertDescription>
      </Alert>
    );
  }
  return (
    <Card className="border-green-500">
      <CardContent className="pt-4 space-y-2">
        <div className="flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-green-600" />
          <Badge variant="outline" className="border-green-600 text-green-700">✅ Saída autorizada — Ocorrência registrada</Badge>
        </div>
        <div className="text-sm text-muted-foreground mt-1">
          {dados.emailEnviado ? "E-mail enviado ao responsável." : "E-mail não enviado."}
        </div>
      </CardContent>
    </Card>
  );
}

export default function LeituraQrPage() {
  const { toast } = useToast();
  const [estadoCarteira, setEstadoCarteira] = useState<Estado<ResultadoCarteira>>({ fase: "idle" });
  const [estadoCartao, setEstadoCartao] = useState<Estado<ResultadoCartao>>({ fase: "idle" });

  async function lerCarteira(token: string) {
    setEstadoCarteira({ fase: "lendo" });
    try {
      const res = await fetch("/api/leitura-qr/carteira", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const dados = await res.json();
      if (!res.ok && !dados.valido) {
        setEstadoCarteira({ fase: "ok", dados });
      } else if (!res.ok) {
        setEstadoCarteira({ fase: "erro", mensagem: dados.erro ?? "Erro ao verificar." });
      } else {
        setEstadoCarteira({ fase: "ok", dados });
      }
    } catch {
      setEstadoCarteira({ fase: "erro", mensagem: "Falha de conexão." });
    }
  }

  async function lerCartao(token: string) {
    setEstadoCartao({ fase: "lendo" });
    try {
      const res = await fetch("/api/leitura-qr/cartao-liberacao", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const dados = await res.json();
      if (res.status === 422 || (res.status === 403 && dados.erro)) {
        setEstadoCartao({ fase: "ok", dados });
      } else if (!res.ok && !dados.valido) {
        setEstadoCartao({ fase: "ok", dados });
      } else if (!res.ok) {
        setEstadoCartao({ fase: "erro", mensagem: dados.erro ?? "Erro ao registrar." });
      } else {
        setEstadoCartao({ fase: "ok", dados });
        if (dados.valido && !dados.jaRegistrado) {
          toast({ title: "Saída registrada com sucesso." });
        }
      }
    } catch {
      setEstadoCartao({ fase: "erro", mensagem: "Falha de conexão." });
    }
  }

  return (
    <div className="container max-w-lg mx-auto py-6 space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <QrCode className="w-6 h-6" />
        <h1 className="text-xl font-semibold">Leitura de QR Code</h1>
      </div>

      <Tabs defaultValue="carteira">
        <TabsList className="w-full">
          <TabsTrigger value="carteira" className="flex-1">Carteira de Estudante</TabsTrigger>
          <TabsTrigger value="cartao" className="flex-1">Cartão de Saída</TabsTrigger>
        </TabsList>

        <TabsContent value="carteira" className="space-y-4 mt-4">
          <ScannerPanel onRead={lerCarteira} />
          <ResultadoCarteiraView estado={estadoCarteira} />
        </TabsContent>

        <TabsContent value="cartao" className="space-y-4 mt-4">
          <ScannerPanel onRead={lerCartao} />
          <ResultadoCartaoView estado={estadoCartao} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
