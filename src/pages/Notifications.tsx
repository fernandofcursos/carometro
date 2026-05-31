import { motion } from 'framer-motion'
import { Bell, Check, Info, AlertTriangle, CheckCircle } from 'lucide-react'

const notifications = [
  {
    id: 1,
    title: 'New user registered',
    message: 'Carlos Mendes just created an account',
    time: '2 min ago',
    type: 'info',
    icon: Info,
    color: '#3b82f6',
    bgColor: '#eff6ff',
  },
  {
    id: 2,
    title: 'Payment received',
    message: 'R$ 1.250,00 from Ana Silva',
    time: '15 min ago',
    type: 'success',
    icon: CheckCircle,
    color: '#10b981',
    bgColor: '#ecfdf5',
  },
  {
    id: 3,
    title: 'Server alert',
    message: 'High CPU usage detected on server-01',
    time: '1 hour ago',
    type: 'warning',
    icon: AlertTriangle,
    color: '#f59e0b',
    bgColor: '#fffbeb',
  },
  {
    id: 4,
    title: 'Task completed',
    message: 'Data migration finished successfully',
    time: '3 hours ago',
    type: 'success',
    icon: CheckCircle,
    color: '#10b981',
    bgColor: '#ecfdf5',
  },
  {
    id: 5,
    title: 'Security alert',
    message: 'Suspicious login attempt blocked',
    time: '5 hours ago',
    type: 'warning',
    icon: AlertTriangle,
    color: '#ef4444',
    bgColor: '#fef2f2',
  },
]

export function Notifications() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          <p className="text-sm text-gray-500 mt-1">Stay updated with recent events</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
          <Check className="w-4 h-4" />
          Mark all read
        </button>
      </div>

      <div className="space-y-3">
        {notifications.map((notification, i) => (
          <motion.div
            key={notification.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
          >
            <div className="flex items-start gap-4">
              <div
                className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: notification.bgColor, color: notification.color }}
              >
                <notification.icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-gray-900">{notification.title}</h3>
                  <span className="text-xs text-gray-400 flex-shrink-0">{notification.time}</span>
                </div>
                <p className="text-sm text-gray-600 mt-1">{notification.message}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
