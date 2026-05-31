import { useState, useEffect, useCallback } from "react";

export type ConsentPurpose = {
  id: string;
  label: string;
  description: string;
  required: boolean;
  legalBasis: string;
  sensitive?: boolean;
};

export const CONSENT_PURPOSES: Record<string, ConsentPurpose> = {
  ESSENTIAL: {
    id: "essential",
    label: "Dados essenciais",
    description: "Necessários para o funcionamento do sistema (autenticação, segurança). Não podem ser revogados.",
    required: true,
    legalBasis: "Art. 7º, II — execução de contrato",
  },
  PROFILE_PHOTO: {
    id: "profile_photo",
    label: "Foto do colaborador",
    description: "Armazenamento e exibição da foto de perfil no carômetro.",
    required: false,
    legalBasis: "Art. 7º, I — consentimento",
  },
  BIOMETRIC: {
    id: "biometric",
    label: "Dados biométricos",
    description: "Reconhecimento facial para identificação automática.",
    required: false,
    legalBasis: "Art. 11, I — consentimento específico",
    sensitive: true,
  },
  ANALYTICS: {
    id: "analytics",
    label: "Analytics de uso",
    description: "Métricas de uso do sistema para melhoria contínua.",
    required: false,
    legalBasis: "Art. 7º, IX — legítimo interesse",
  },
  NOTIFICATIONS: {
    id: "notifications",
    label: "Notificações push",
    description: "Envio de alertas e comunicados pelo sistema.",
    required: false,
    legalBasis: "Art. 7º, I — consentimento",
  },
};

const STORAGE_KEY = "carometro_lgpd_consents";
const STORAGE_KEY_LOG = "carometro_lgpd_audit_log";

export type LgpdAuditEntry = {
  action: string;
  purpose?: string;
  label?: string;
  timestamp: string;
  userId?: string | null;
};

export type LgpdConsentData = {
  consents: Record<string, boolean>;
  updatedAt: string;
  userId?: string | null;
};

export function useLGPD(userId: string | null = null) {
  const [consents, setConsents] = useState<Record<string, boolean>>({});
  const [auditLog, setAuditLog] = useState<LgpdAuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(`${STORAGE_KEY}_${userId}`);
      if (stored) {
        const parsed: LgpdConsentData = JSON.parse(stored);
        setConsents(parsed.consents || {});
        setLastUpdated(parsed.updatedAt || null);
      } else {
        const initial: Record<string, boolean> = { [CONSENT_PURPOSES.ESSENTIAL.id]: true };
        setConsents(initial);
      }

      const logStored = localStorage.getItem(`${STORAGE_KEY_LOG}_${userId}`);
      if (logStored) setAuditLog(JSON.parse(logStored));
    } catch (err) {
      console.error("[LGPD] Erro ao carregar consentimentos:", err);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  const persistConsents = useCallback(
    (newConsents: Record<string, boolean>, logEntry: Omit<LgpdAuditEntry, "timestamp" | "userId">) => {
      const now = new Date().toISOString();
      const data: LgpdConsentData = { consents: newConsents, updatedAt: now, userId };

      localStorage.setItem(`${STORAGE_KEY}_${userId}`, JSON.stringify(data));

      const newLog: LgpdAuditEntry[] = [
        { ...logEntry, timestamp: now, userId },
        ...auditLog,
      ].slice(0, 200);

      localStorage.setItem(`${STORAGE_KEY_LOG}_${userId}`, JSON.stringify(newLog));
      setAuditLog(newLog);
      setLastUpdated(now);
    },
    [userId, auditLog]
  );

  const giveConsent = useCallback(
    (purposeId: string) => {
      const purpose = Object.values(CONSENT_PURPOSES).find((p) => p.id === purposeId);
      if (!purpose) return;

      const updated = { ...consents, [purposeId]: true };
      setConsents(updated);
      persistConsents(updated, {
        action: "CONSENT_GIVEN",
        purpose: purposeId,
        label: purpose.label,
      });

      syncConsentToAPI({ purposeId, granted: true, userId });
    },
    [consents, persistConsents, userId]
  );

  const revokeConsent = useCallback(
    (purposeId: string) => {
      const purpose = Object.values(CONSENT_PURPOSES).find((p) => p.id === purposeId);
      if (purpose?.required) {
        console.warn("[LGPD] Consentimento essencial não pode ser revogado.");
        return;
      }

      const updated = { ...consents, [purposeId]: false };
      setConsents(updated);
      persistConsents(updated, {
        action: "CONSENT_REVOKED",
        purpose: purposeId,
        label: purpose?.label,
      });

      syncConsentToAPI({ purposeId, granted: false, userId });
    },
    [consents, persistConsents, userId]
  );

  const exportMyData = useCallback(async () => {
    const exportData = {
      meta: {
        sistema: "Carômetro",
        versao_lgpd: "1.0",
        data_exportacao: new Date().toISOString(),
        titular: userId,
        base_legal: "Art. 18, V — LGPD",
      },
      consentimentos: Object.entries(consents).map(([id, granted]) => ({
        finalidade: id,
        concedido: granted,
        ...Object.values(CONSENT_PURPOSES).find((p) => p.id === id),
      })),
      historico_consentimentos: auditLog,
      aviso: "Este arquivo contém seus dados pessoais conforme Lei 13.709/2018.",
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `meus-dados-carometro-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    persistConsents(consents, { action: "DATA_EXPORTED", purpose: "all" });
  }, [consents, auditLog, userId, persistConsents]);

  const requestDataDeletion = useCallback(async () => {
    const payload = {
      userId,
      requestType: "DELETION",
      timestamp: new Date().toISOString(),
      legalBasis: "Art. 18, VI — LGPD",
    };

    persistConsents({}, { action: "DELETION_REQUESTED", purpose: "all" });
    localStorage.removeItem(`${STORAGE_KEY}_${userId}`);

    return payload;
  }, [userId, persistConsents]);

  const hasConsent = useCallback(
    (purposeId: string) => {
      if (CONSENT_PURPOSES[purposeId.toUpperCase()]?.required) return true;
      return consents[purposeId] === true;
    },
    [consents]
  );

  const pendingConsents = Object.values(CONSENT_PURPOSES).filter(
    (p) => !p.required && consents[p.id] === undefined
  );

  return {
    consents,
    auditLog,
    isLoading,
    lastUpdated,
    purposes: CONSENT_PURPOSES,
    pendingConsents,
    hasPendingConsents: pendingConsents.length > 0,
    giveConsent,
    revokeConsent,
    hasConsent,
    exportMyData,
    requestDataDeletion,
  };
}

async function syncConsentToAPI({
  purposeId,
  granted,
  userId,
}: {
  purposeId: string;
  granted: boolean;
  userId: string | null;
}) {
  try {
    console.log(`[LGPD API] Sincronizando: ${purposeId} = ${granted} para userId=${userId}`);
  } catch (err) {
    console.error("[LGPD API] Falha ao sincronizar consentimento:", err);
  }
}
