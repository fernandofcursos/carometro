import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  AlertTriangle,
  Settings,
} from "lucide-react";

const items = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/", color: "#6366f1", bgColor: "#eef2ff" },
  { icon: Users, label: "Pessoas", href: "/carometro", color: "#10b981", bgColor: "#ecfdf5" },
  { icon: GraduationCap, label: "Estudantes", href: "/estudantes", color: "#f59e0b", bgColor: "#fffbeb" },
  { icon: AlertTriangle, label: "Ocorrências", href: "/ocorrencias", color: "#ef4444", bgColor: "#fef2f2" },
  { icon: Settings, label: "Config", href: "/lgpd", color: "#64748b", bgColor: "#f8fafc" },
];

export function BottomNav() {
  const [location] = useLocation();

  const isActive = (href: string) => {
    if (href === "/") return location === "/";
    return location.startsWith(href);
  };

  return (
    <nav
      role="navigation"
      aria-label="Navegação principal"
      className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur border-t border-border flex items-center justify-around px-2 pb-[env(safe-area-inset-bottom,0px)] md:hidden"
    >
      {items.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-colors",
              active ? "font-semibold" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <motion.div
              className="p-2 rounded-xl"
              animate={{
                scale: active ? 1.1 : 1,
                backgroundColor: active ? item.bgColor : "transparent",
              }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              <item.icon
                className="w-5 h-5"
                style={active ? { color: item.color } : undefined}
              />
            </motion.div>
            <span className="text-[10px] font-semibold leading-none">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
