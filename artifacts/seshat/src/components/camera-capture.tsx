import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Image as ImageIcon, RotateCcw, Check, FlipHorizontal } from "lucide-react";

type FacingMode = "environment" | "user";

// Fase 2: Função para comprimir imagem para upload
// Redimensiona e reduz qualidade para manter tamanho < 150KB
// Necessário para reduzir uso de armazenamento no banco (LGPD: minimização de dados)
async function comprimirImagem(base64: string, maxKB = 150): Promise<string> {
  // Retornar Promise que resolve com imagem comprimida
  return new Promise((resolve) => {
    // Criar elemento Image para carregar a foto
    const img = new Image();

    img.onload = () => {
      // Criar canvas para desenhar imagem redimensionada
      const canvas = document.createElement("canvas");

      // Limitar largura máxima a 600px para reduzir resolução
      // Mantém proporção original da foto
      const maxW = 600;
      const ratio = Math.min(1, maxW / img.width);
      canvas.width = img.width * ratio;
      canvas.height = img.height * ratio;

      // Desenhar imagem redimensionada no canvas
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Tentar qualidades decrescentes até atingir o limite de tamanho
      // Começa em 80% de qualidade, reduz em 10% a cada iteração
      let quality = 0.8;
      let result = canvas.toDataURL("image/jpeg", quality);

      // Enquanto tamanho > maxKB e qualidade > 30%, reduzir qualidade
      // Fator 1.37 aproxima o tamanho em base64 do tamanho binário
      while (result.length > maxKB * 1024 * 1.37 && quality > 0.3) {
        quality -= 0.1;
        result = canvas.toDataURL("image/jpeg", quality);
      }

      // Retornar imagem comprimida em base64
      resolve(result);
    };

    // Iniciar carregamento da imagem a partir do base64
    img.src = base64;
  });
}

interface CameraCaptureProps {
  onCapture: (base64Url: string) => void;
  onCancel?: () => void;
  initialImage?: string | null;
  aspectRatio?: "3/4" | "1/1";
}

export function CameraCapture({ onCapture, onCancel, initialImage, aspectRatio = "3/4" }: CameraCaptureProps) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialImage || null);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<FacingMode>("environment");
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [stream]);

  const startCamera = async (mode: FacingMode = facingMode) => {
    try {
      setError(null);
      const constraints: MediaStreamConstraints = {
        video: aspectRatio === "1/1"
          ? { facingMode: mode, width: { ideal: 1080 }, height: { ideal: 1080 } }
          : { facingMode: mode, width: { ideal: 1080 }, height: { ideal: 1440 } },
      };
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(mediaStream);
    } catch (err) {
      console.error("Camera error:", err);
      setError("Não foi possível acessar a câmera. Verifique as permissões ou use o botão de arquivo.");
    }
  };

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  }, [stream]);

  const switchCamera = async () => {
    const newMode: FacingMode = facingMode === "environment" ? "user" : "environment";
    setFacingMode(newMode);
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    await startCamera(newMode);
  };

  const cropToRatio = (
    source: HTMLVideoElement | HTMLImageElement,
    srcW: number,
    srcH: number
  ): string => {
    const targetRatio = aspectRatio === "1/1" ? 1 : 3 / 4;
    const srcRatio = srcW / srcH;

    let cropW: number, cropH: number, offsetX: number, offsetY: number;
    if (srcRatio > targetRatio) {
      cropH = srcH;
      cropW = srcH * targetRatio;
      offsetX = (srcW - cropW) / 2;
      offsetY = 0;
    } else {
      cropW = srcW;
      cropH = srcW / targetRatio;
      offsetX = 0;
      offsetY = (srcH - cropH) / 2;
    }

    const outW = Math.round(cropW);
    const outH = Math.round(cropH);
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";

    if (facingMode === "user") {
      ctx.translate(outW, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(source, offsetX, offsetY, cropW, cropH, 0, 0, outW, outH);
    return canvas.toDataURL("image/jpeg", 0.88);
  };

  // Fase 2: Capturar foto e comprimir antes de mostrar preview
  const capturePhoto = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    // Crop para manter proporção (3:4 ou 1:1)
    const dataUrl = cropToRatio(video, video.videoWidth, video.videoHeight);
    if (!dataUrl) return;

    // Comprimir imagem para < 150KB (LGPD: minimização de dados)
    const comprimida = await comprimirImagem(dataUrl);

    // Mostrar preview da imagem comprimida
    setPreviewUrl(comprimida);
    // Desligar câmera após capturar
    stopCamera();
  };

  // Fase 2: Upload de arquivo com compressão automática
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Ler arquivo como data URL
    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      const img = new Image();

      img.onload = async () => {
        // Crop para manter proporção (3:4 ou 1:1)
        const cropped = cropToRatio(img, img.naturalWidth, img.naturalHeight);

        // Comprimir imagem cropped (ou original se crop falhou)
        const comprimida = await comprimirImagem(cropped || dataUrl);
        setPreviewUrl(comprimida);
      };

      // Iniciar carregamento da imagem
      img.src = dataUrl;
    };

    // Ler arquivo como data URL
    reader.readAsDataURL(file);
    // Limpar input para permitir selecionar mesmo arquivo novamente
    e.target.value = "";
  };

  const confirmPhoto = () => {
    if (previewUrl) {
      onCapture(previewUrl);
    }
  };

  const retakePhoto = () => {
    setPreviewUrl(null);
    startCamera();
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const containerClass = aspectRatio === "1/1"
    ? "relative w-full aspect-square overflow-hidden rounded-xl border bg-muted flex items-center justify-center shadow-sm"
    : "relative w-full aspect-[3/4] overflow-hidden rounded-xl border bg-muted flex items-center justify-center shadow-sm";

  if (previewUrl) {
    return (
      <div className="flex flex-col gap-4 items-center w-full max-w-sm mx-auto">
        <div className={containerClass}>
          <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
        </div>
        <div className="flex gap-2 w-full">
          <Button variant="outline" className="flex-1" onClick={retakePhoto} type="button">
            <RotateCcw className="w-4 h-4 mr-2" />
            Tirar outra
          </Button>
          <Button className="flex-1" onClick={confirmPhoto} type="button">
            <Check className="w-4 h-4 mr-2" />
            Confirmar
          </Button>
        </div>
        {onCancel && (
          <Button variant="ghost" className="w-full text-muted-foreground" onClick={onCancel} type="button">
            Cancelar
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 items-center w-full max-w-sm mx-auto">
      {error && (
        <div className="p-3 text-sm text-destructive-foreground bg-destructive rounded-md w-full">
          {error}
        </div>
      )}

      <div className={containerClass}>
        {stream ? (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={facingMode === "user" ? { transform: "scaleX(-1)" } : undefined}
            />
            <button
              type="button"
              onClick={switchCamera}
              className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-colors"
              title={facingMode === "environment" ? "Câmera frontal" : "Câmera traseira"}
            >
              <FlipHorizontal className="w-4 h-4" />
            </button>
          </>
        ) : (
          <div className="text-center p-6 text-muted-foreground flex flex-col items-center">
            <Camera className="w-12 h-12 mb-4 opacity-50" />
            <p>Câmera inativa</p>
          </div>
        )}
      </div>

      <div className="flex gap-2 w-full">
        {stream ? (
          <Button className="flex-1" onClick={capturePhoto} type="button" size="lg">
            <Camera className="w-5 h-5 mr-2" />
            Capturar
          </Button>
        ) : (
          <Button className="flex-1" onClick={() => startCamera()} type="button">
            <Camera className="w-4 h-4 mr-2" />
            Ligar Câmera
          </Button>
        )}
        <Button variant="outline" onClick={triggerFileInput} type="button" title="Escolher da galeria">
          <ImageIcon className="w-4 h-4" />
        </Button>
      </div>

      {onCancel && (
        <Button variant="ghost" className="w-full text-muted-foreground" onClick={onCancel} type="button">
          Cancelar
        </Button>
      )}

      <input
        type="file"
        accept="image/*"
        capture="environment"
        ref={fileInputRef}
        onChange={handleFileUpload}
        className="hidden"
      />
    </div>
  );
}
