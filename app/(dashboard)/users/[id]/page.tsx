"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Header from "@/components/layouts/Header";
import UserForm from "@/components/forms/UserForm";
import LoadingSpinner from "@/components/common/LoadingSpinner";

interface UserData {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

export default function EditUserPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [user, setUser] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchUser() {
      try {
        const res = await fetch(`/api/users/${id}`);
        const json = await res.json();
        if (!res.ok) {
          setError(json.error || "Failed to load user");
          return;
        }
        setUser(json.data);
      } catch {
        setError("Failed to load user");
      } finally {
        setIsLoading(false);
      }
    }
    fetchUser();
  }, [id]);

  const handleSubmit = async (data: { name: string; role: string; isActive?: boolean }) => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to update user");
      }
      router.push("/users");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600">
        {error || "User not found"}
      </div>
    );
  }

  return (
    <>
      <Header title={`Edit User: ${user.name}`} />
      <div className="mx-auto max-w-lg rounded-xl border border-gray-200 bg-white p-6">
        <UserForm user={user} onSubmit={handleSubmit} isLoading={isSaving} />
      </div>
    </>
  );
}
