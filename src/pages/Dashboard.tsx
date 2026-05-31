import { motion } from 'framer-motion'
import {
  TrendingUp,
  TrendingDown,
  Users,
  DollarSign,
  ShoppingCart,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react'

const stats = [
  {
    title: 'Total Revenue',
    value: 'R$ 45.231',
    change: '+12.5%',
    positive: true,
    icon: DollarSign,
    color: '#6366f1',
    bgColor: '#eef2ff',
  },
  {
    title: 'Total Users',
    value: '2.350',
    change: '+8.2%',
    positive: true,
    icon: Users,
    color: '#10b981',
    bgColor: '#ecfdf5',
  },
  {
    title: 'Orders',
    value: '1.247',
    change: '-3.1%',
    positive: false,
    icon: ShoppingCart,
    color: '#f59e0b',
    bgColor: '#fffbeb',
  },
  {
    title: 'Active Now',
    value: '573',
    change: '+24.0%',
    positive: true,
    icon: Activity,
    color: '#ef4444',
    bgColor: '#fef2f2',
  },
]

const recentActivity = [
  { id: 1, user: 'Ana Silva', action: 'completed purchase', time: '2 min ago', color: '#6366f1' },
  { id: 2, user: 'Carlos Mendes', action: 'signed up', time: '5 min ago', color: '#10b981' },
  { id: 3, user: 'Maria Santos', action: 'updated profile', time: '12 min ago', color: '#f59e0b' },
  { id: 4, user: 'João Oliveira', action: 'left a review', time: '18 min ago', color: '#ef4444' },
  { id: 5, user: 'Pedro Costa', action: 'added to cart', time: '25 min ago', color: '#6366f1' },
]

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
}

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
}

export function Dashboard() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Welcome back! Here's your overview.</p>
        </div>
      </div>

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {stats.map((stat) => (
          <motion.div
            key={stat.title}
            variants={item}
            className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between">
              <div className="space-y-3">
                <p className="text-sm text-gray-500">{stat.title}</p>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                <div className={`flex items-center gap-1 text-sm font-medium ${
                  stat.positive ? 'text-emerald-600' : 'text-red-600'
                }`}>
                  {stat.positive ? (
                    <ArrowUpRight className="w-4 h-4" />
                  ) : (
                    <ArrowDownRight className="w-4 h-4" />
                  )}
                  <span>{stat.change}</span>
                  <span className="text-gray-400 font-normal">vs last month</span>
                </div>
              </div>
              <div
                className="p-3 rounded-xl"
                style={{ backgroundColor: stat.bgColor, color: stat.color }}
              >
                <stat.icon className="w-5 h-5" />
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm"
        >
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h2>
          <div className="space-y-4">
            {recentActivity.map((activity) => (
              <div key={activity.id} className="flex items-center gap-3">
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: activity.color }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900">
                    <span className="font-medium">{activity.user}</span>
                    <span className="text-gray-500"> {activity.action}</span>
                  </p>
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">{activity.time}</span>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm"
        >
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Performance Overview</h2>
          <div className="space-y-4">
            {[
              { label: 'Page Views', value: 75, color: '#6366f1' },
              { label: 'Conversion Rate', value: 62, color: '#10b981' },
              { label: 'Bounce Rate', value: 45, color: '#f59e0b' },
              { label: 'Session Duration', value: 88, color: '#ef4444' },
            ].map((metric) => (
              <div key={metric.label}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">{metric.label}</span>
                  <span className="text-sm font-semibold text-gray-900">{metric.value}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${metric.value}%` }}
                    transition={{ duration: 1, delay: 0.5 }}
                    className="h-full rounded-full"
                    style={{ backgroundColor: metric.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  )
}
