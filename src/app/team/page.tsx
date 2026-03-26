"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/DashboardLayout";

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export default function TeamPage() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const isAdmin = (session?.user as any)?.role === "admin";

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/users");
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const toggleActive = async (userId: string, currentActive: boolean) => {
    await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !currentActive }),
    });
    fetchUsers();
  };

  const toggleRole = async (userId: string, currentRole: string) => {
    const newRole = currentRole === "admin" ? "member" : "admin";
    await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    fetchUsers();
  };

  const deleteUser = async (userId: string, userName: string) => {
    if (!confirm(`Delete user "${userName}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/users/${userId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "Failed to delete user");
      return;
    }
    fetchUsers();
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8 animate-fade-in-down">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Team</h1>
            <p className="text-sm text-gray-500 mt-1">
              Manage team members and access
              {!isAdmin && " (admin access required to make changes)"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">{users.length} member{users.length !== 1 ? "s" : ""}</span>
            <span className="text-xs text-gray-300">|</span>
            <span className="text-xs text-green-600">{users.filter(u => u.is_active).length} active</span>
            <span className="text-xs text-amber-600">{users.filter(u => !u.is_active).length} pending</span>
          </div>
        </div>

        {loading ? (
          <div className="card p-6 space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-4">
                <div className="skeleton w-10 h-10 rounded-full" />
                <div className="flex-1"><div className="skeleton h-4 w-40 mb-2" /><div className="skeleton h-3 w-60" /></div>
                <div className="skeleton h-8 w-20 rounded-lg" />
              </div>
            ))}
          </div>
        ) : (
          <div className="card overflow-hidden animate-fade-in-up">
            {users.length === 0 ? (
              <div className="p-16 text-center">
                <svg className="w-28 h-28 mx-auto mb-6 text-gray-200" viewBox="0 0 120 120" fill="none">
                  <circle cx="40" cy="45" r="14" stroke="currentColor" strokeWidth="2" />
                  <circle cx="40" cy="39" r="5" fill="currentColor" opacity="0.3" />
                  <path d="M28 58a12 12 0 0124 0" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.3" />
                  <circle cx="75" cy="45" r="14" stroke="currentColor" strokeWidth="2" />
                  <circle cx="75" cy="39" r="5" fill="currentColor" opacity="0.3" />
                  <path d="M63 58a12 12 0 0124 0" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.3" />
                  <circle cx="95" cy="75" r="12" fill="#818cf8" opacity="0.15" stroke="#818cf8" strokeWidth="2" />
                  <path d="M92 75h6M95 72v6" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
                </svg>
                <p className="text-xl font-semibold text-gray-900 mb-2">No team members yet</p>
                <p className="text-gray-500 max-w-sm mx-auto">Team members will appear here once they register and join your organization.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {users.map((user) => (
                  <div key={user.id} className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors">
                    {/* Avatar */}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold ${
                      user.is_active
                        ? "bg-indigo-100 text-indigo-600"
                        : "bg-gray-100 text-gray-400"
                    }`}>
                      {user.name.charAt(0).toUpperCase()}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                          user.role === "admin" ? "bg-purple-50 text-purple-600" : "bg-gray-50 text-gray-500"
                        }`}>
                          {user.role}
                        </span>
                        {!user.is_active && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-600">
                            pending activation
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 truncate">{user.email}</p>
                    </div>

                    {/* Joined date */}
                    <span className="text-xs text-gray-400 hidden sm:block">
                      {new Date(user.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>

                    {/* Actions */}
                    {isAdmin && user.id !== (session?.user as any)?.id && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleActive(user.id, user.is_active)}
                          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                            user.is_active
                              ? "text-amber-600 border-amber-200 hover:bg-amber-50"
                              : "text-green-600 border-green-200 hover:bg-green-50"
                          }`}
                        >
                          {user.is_active ? "Deactivate" : "Activate"}
                        </button>
                        <button
                          onClick={() => toggleRole(user.id, user.role)}
                          className="text-xs text-purple-600 border border-purple-200 hover:bg-purple-50 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          {user.role === "admin" ? "Remove Admin" : "Make Admin"}
                        </button>
                        <button
                          onClick={() => deleteUser(user.id, user.name)}
                          className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1.5 rounded-lg transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    )}

                    {/* Self indicator */}
                    {user.id === (session?.user as any)?.id && (
                      <span className="text-[10px] text-indigo-500 font-medium">You</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
