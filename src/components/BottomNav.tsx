import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import { LayoutDashboard, BarChart3, Users, Bell, Settings } from 'lucide-react'

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard, color: '#6366f1', bgColor: '#eef2ff' },
  { path: '/analytics', label: 'Analytics', icon: BarChart3, color: '#10b981', bgColor: '#ecfdf5' },
  { path: '/users', label: 'Users', icon: Users, color: '#f59e0b', bgColor: '#fffbeb' },
  { path: '/notifications', label: 'Alerts', icon: Bell, color: '#ef4444', bgColor: '#fef2f2' },
  { path: '/settings', label: 'Config', icon: Settings, color: '#64748b', bgColor: '#f8fafc' },
]

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-lg sm:hidden bottom-nav-safe">
      <div className="flex items-center justify-around px-2 py-2">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all duration-200 ${
                isActive
                  ? 'font-semibold'
                  : 'text-gray-400 hover:text-gray-600'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <div
                  className={`relative p-2 rounded-xl transition-all duration-200 ${
                    isActive ? 'scale-110' : ''
                  }`}
                  style={
                    isActive
                      ? { backgroundColor: item.bgColor, color: item.color }
                      : {}
                  }
                >
                  <item.icon className="w-5 h-5" />
                  {isActive && (
                    <motion.div
                      layoutId="bottomNavIndicator"
                      className="absolute inset-0 rounded-xl"
                      style={{ backgroundColor: item.bgColor }}
                      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    />
                  )}
                </div>
                <span className="text-[10px] leading-tight">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
