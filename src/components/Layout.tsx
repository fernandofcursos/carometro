import { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { BottomNav } from './BottomNav'
import { LGPDBanner } from './LGPDBanner'

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[#f8fafc]">
      <Sidebar />
      <main className="flex-1 min-h-screen pb-20 sm:pb-0">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
      <BottomNav />
      <LGPDBanner />
    </div>
  )
}
