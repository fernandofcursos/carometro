import { useState, useEffect } from "react";
import { Shield, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "carometro:lgpd-consent";

export function LgpdBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem(STORAGE_KEY);
      if (!dismissed) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {}
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          role="alert"
          initial={{ opacity: 0, y: -20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.98 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="relative overflow-hidden rounded-xl border border-amber-500/20 bg-gradient-to-r from-amber-500/5 to-amber-500/10 p-4 md:p-5 mb-6"
        >
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-500 to-amber-600" />
          <div className="flex items-start gap-4">
            <motion.div
              className="shrink-0 p-2 rounded-lg bg-amber-500/10"
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.1, type: "spring", stiffness: 300 }}
            >
              <Shield className="w-5 h-5 text-amber-600" />
            </motion.div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">
                Consentimento de Dados · LGPD
              </p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Este sistema armazena dados pessoais de colaboradores. Gerencie
                consentimentos, revogue acessos e exporte seus dados conforme a Lei
                nº 13.709/2018.
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                <Button size="sm" className="h-8 text-xs bg-amber-600 hover:bg-amber-700 text-white" asChild>
                  <a href="/lgpd">Gerenciar consentimentos</a>
                </Button>
                <Button size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground" onClick={dismiss}>
                  Dispensar
                </Button>
              </div>
            </div>
            <button
              onClick={dismiss}
              aria-label="Fechar banner LGPD"
              className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
