import { motion } from 'framer-motion'
import { BarChart3, TrendingUp, Calendar, Download } from 'lucide-react'

export function Analytics() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-sm text-gray-500 mt-1">Detailed insights and reports</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
          <Download className="w-4 h-4" />
          Export
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Visits</p>
              <p className="text-xl font-bold text-gray-900">124,592</p>
            </div>
          </div>
          <div className="h-24 flex items-end gap-1">
            {[40, 65, 45, 80, 55, 70, 90, 60, 75, 50, 85, 95].map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-t-sm"
                style={{ height: `${h}%`, backgroundColor: '#6366f1', opacity: 0.7 + (i % 3) * 0.1 }}
              />
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Growth Rate</p>
              <p className="text-xl font-bold text-gray-900">+23.5%</p>
            </div>
          </div>
          <div className="space-y-3">
            {['Organic', 'Direct', 'Social', 'Referral'].map((source, i) => (
              <div key={source} className="flex items-center gap-3">
                <span className="text-sm text-gray-600 w-20">{source}</span>
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${[60, 40, 30, 20][i]}%`,
                      backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#ef4444'][i],
                    }}
                  />
                </div>
                <span className="text-sm font-medium text-gray-900">{[60, 40, 30, 20][i]}%</span>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm text-gray-500">This Month</p>
              <p className="text-xl font-bold text-gray-900">R$ 32.4k</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Week 1', value: 'R$ 7.2k' },
              { label: 'Week 2', value: 'R$ 8.1k' },
              { label: 'Week 3', value: 'R$ 9.5k' },
              { label: 'Week 4', value: 'R$ 7.6k' },
            ].map((week) => (
              <div key={week.label} className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">{week.label}</p>
                <p className="text-sm font-semibold text-gray-900">{week.value}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  )
}
