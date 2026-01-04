"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { JSX, useState } from "react";
import Logo from "@/components/Logo";
import { supabase } from "@/lib/supabaseClient";

type NavItem = {
  href: string;
  label: string;
  icon: JSX.Element;
};

// Employee navigation items
const navItems: NavItem[] = [
  {
    href: "/dashboard",
    label: "Home",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    href: "/rota",
    label: "My Rota",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  {
    href: "/leave",
    label: "Leave",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  },
  {
    href: "/employee/profile",
    label: "Profile",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
];

export default function EmployeeShell({ 
  children, 
  employeeName,
  companyName 
}: { 
  children: React.ReactNode;
  employeeName?: string | null;
  companyName?: string | null;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const onLogout = async () => {
    try {
      await fetch("/auth/signout", { method: "POST", credentials: "include", cache: "no-store" });
    } catch {}
    window.location.replace("/sign-in");
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20 md:pb-0">
      {/* Mobile Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 md:hidden">
        <div className="flex items-center justify-between px-4 h-14">
          <Link href="/dashboard">
            <Logo width={100} height={24} />
          </Link>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="h-10 w-10 grid place-items-center rounded-full hover:bg-slate-100"
            aria-label="Menu"
          >
            {menuOpen ? (
              <svg className="h-6 w-6 text-slate-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg className="h-6 w-6 text-slate-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            )}
          </button>
        </div>

        {/* Mobile Menu Dropdown */}
        {menuOpen && (
          <div className="absolute top-14 left-0 right-0 bg-white border-b border-slate-200 shadow-lg">
            <div className="px-4 py-3 border-b border-slate-100">
              <p className="text-sm font-medium text-slate-900">{employeeName || "Employee"}</p>
              <p className="text-xs text-slate-500">{companyName || "Company"}</p>
            </div>
            <nav className="py-2">
              {navItems.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 ${
                      active ? "bg-indigo-50 text-indigo-600" : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <span className={active ? "text-indigo-600" : "text-slate-500"}>{item.icon}</span>
                    <span className="font-medium">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
            <div className="px-4 py-3 border-t border-slate-100">
              <button
                onClick={onLogout}
                className="flex items-center gap-3 w-full text-left text-red-600 hover:text-red-700"
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                <span className="font-medium">Sign out</span>
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:left-0 md:w-64 md:border-r md:border-slate-200 md:bg-white">
        <div className="h-14 px-4 flex items-center border-b border-slate-100">
          <Link href="/dashboard">
            <Logo width={120} height={30} />
          </Link>
        </div>
        
        <div className="px-4 py-4 border-b border-slate-100">
          <p className="text-sm font-medium text-slate-900">{employeeName || "Employee"}</p>
          <p className="text-xs text-slate-500">{companyName || "Company"}</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${
                  active 
                    ? "bg-indigo-600 text-white" 
                    : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                <span className={active ? "text-white" : "text-slate-500"}>{item.icon}</span>
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-slate-100">
          <button
            onClick={onLogout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-slate-700 hover:bg-slate-100"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6 text-slate-500" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span className="font-medium">Sign out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 md:hidden safe-area-inset-bottom">
        <div className="grid grid-cols-4 h-16">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center gap-1 ${
                  active ? "text-indigo-600" : "text-slate-500"
                }`}
              >
                {item.icon}
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Main Content */}
      <main className="md:ml-64">
        {children}
      </main>
    </div>
  );
}
