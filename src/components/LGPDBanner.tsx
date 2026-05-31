import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Shield, X, Check } from 'lucide-react'

export function LGPDBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const accepted = localStorage.getItem('lgpd-accepted')
    if (!accepted) {
      setVisible(true)
    }
  }, [])

  const handleAccept = () => {
    localStorage.setItem('lgpd-accepted', 'true')
    setVisible(false)
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-lg"
        >
          <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex items-center gap-3 flex-1">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Sua Privacidade é Importante
                  </h3>
                  <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                    Utilizamos cookies e tecnologias semelhantes para melhorar sua experiência, 
                    personalizar conteúdo e analisar tráfego. Ao continuar navegando, você concorda 
                    com nossa <a href="#" className="text-blue-600 underline hover:text-blue-800">Política de Privacidade</a> e 
                    <a href="#" className="text-blue-600 underline hover:text-blue-800 ml-1">Termos de Uso</a>.
                    Seus dados estão protegidos conforme a Lei Geral de Proteção de Dados (LGPD).
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto">
                <button
                  onClick={handleAccept}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors active:scale-95"
                >
                  <Check className="w-4 h-4" />
                  <span>Entendi</span>
                </button>
                <button
                  onClick={handleAccept}
                  className="flex-shrink-0 p-2.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
