"use client";

import { Sidebar } from "./Sidebar";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 lg:ml-64 p-6 pt-16 lg:pt-8 lg:p-8">
        {children}
      </main>
    </div>
  );
}
