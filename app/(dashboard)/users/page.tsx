"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Header from "@/components/layouts/Header";
import LoadingSpinner from "@/components/common/LoadingSpinner";

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/users");
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to load users");
        return;
      }
      setUsers(json.data);
    } catch {
      setError("Failed to load users");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Deactivate user "${name}"? They will no longer be able to log in.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json();
        alert(json.error || "Failed to deactivate user");
        return;
      }
      fetchUsers();
    } catch {
      alert("Failed to deactivate user");
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600">{error}</div>;
  }

  return (
    <>
      <Header title="User Management">
        <Link
          href="/users/new"
          className="rounded-lg bg-clutch-red px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700"
        >
          Add User
        </Link>
      </Header>

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-100 text-clutch-grey/50">
                <th className="px-4 pb-2 pt-4 font-medium">Name</th>
                <th className="px-4 pb-2 pt-4 font-medium">Email</th>
                <th className="px-4 pb-2 pt-4 font-medium">Role</th>
                <th className="px-4 pb-2 pt-4 font-medium">Status</th>
                <th className="px-4 pb-2 pt-4 font-medium">Created</th>
                <th className="px-4 pb-2 pt-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-gray-50">
                  <td className="px-4 py-3 font-medium text-clutch-black">
                    {user.name}
                  </td>
                  <td className="px-4 py-3 text-clutch-grey/70">{user.email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        user.role === "admin"
                          ? "bg-purple-50 text-purple-600"
                          : "bg-gray-50 text-gray-600"
                      }`}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        user.isActive
                          ? "bg-green-50 text-green-600"
                          : "bg-red-50 text-red-600"
                      }`}
                    >
                      {user.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-clutch-grey/50">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Link
                        href={`/users/${user.id}`}
                        className="text-xs text-clutch-blue hover:underline"
                      >
                        Edit
                      </Link>
                      {user.isActive && (
                        <button
                          onClick={() => handleDelete(user.id, user.name)}
                          className="text-xs text-red-600 hover:underline"
                        >
                          Deactivate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && (
            <p className="py-8 text-center text-sm text-clutch-grey/50">
              No users found
            </p>
          )}
        </div>
      </div>
    </>
  );
}
