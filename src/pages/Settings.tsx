import { motion } from 'framer-motion'
import { Settings, User, Bell, Shield, Globe, Moon } from 'lucide-react'
import { useState } from 'react'

const settingsSections = [
  {
    title: 'Profile',
    icon: User,
    color: '#6366f1',
    bgColor: '#eef2ff',
    items: [
      { label: 'Name', value: 'John Doe', type: 'text' },
      { label: 'Email', value: 'john@example.com', type: 'email' },
      { label: 'Bio', value: 'Product designer and developer', type: 'textarea' },
    ],
  },
  {
    title: 'Notifications',
    icon: Bell,
    color: '#f59e0b',
    bgColor: '#fffbeb',
    items: [
      { label: 'Email notifications', value: true, type: 'toggle' },
      { label: 'Push notifications', value: true, type: 'toggle' },
      { label: 'Marketing emails', value: false, type: 'toggle' },
    ],
  },
  {
    title: 'Security',
    icon: Shield,
    color: '#10b981',
    bgColor: '#ecfdf5',
    items: [
      { label: 'Two-factor auth', value: true, type: 'toggle' },
      { label: 'Login alerts', value: true, type: 'toggle' },
    ],
  },
  {
    title: 'Preferences',
    icon: Globe,
    color: '#3b82f6',
    bgColor: '#eff6ff',
    items: [
      { label: 'Language', value: 'Português (BR)', type: 'select' },
      { label: 'Timezone', value: 'America/Sao_Paulo', type: 'select' },
      { label: 'Dark mode', value: false, type: 'toggle' },
    ],
  },
]

export function Settings() {
  const [toggles, setToggles] = useState<Record<string, boolean>>({
    'Email notifications': true,
    'Push notifications': true,
    'Marketing emails': false,
    'Two-factor auth': true,
    'Login alerts': true,
    'Dark mode': false,
  })

  const toggle = (key: string) => {
    setToggles((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your preferences</p>
      </div>

      <div className="space-y-6">
        {settingsSections.map((section, i) => (
          <motion.div
            key={section.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
              <div
                className="p-2 rounded-lg"
                style={{ backgroundColor: section.bgColor, color: section.color }}
              >
                <section.icon className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900">{section.title}</h2>
            </div>
            <div className="divide-y divide-gray-50">
              {section.items.map((item) => (
                <div key={item.label} className="px-6 py-4 flex items-center justify-between">
                  <span className="text-sm text-gray-700">{item.label}</span>
                  {item.type === 'toggle' ? (
                    <button
                      onClick={() => toggle(item.label)}
                      className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
                        toggles[item.label] ? 'bg-indigo-600' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
                          toggles[item.label] ? 'translate-x-5' : ''
                        }`}
                      />
                    </button>
                  ) : item.type === 'text' || item.type === 'email' ? (
                    <input
                      type={item.type}
                      defaultValue={item.value as string}
                      className="w-48 sm:w-64 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  ) : (
                    <span className="text-sm text-gray-500">{item.value as string}</span>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
