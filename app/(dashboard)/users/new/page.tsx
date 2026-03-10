"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/layouts/Header";
import UserForm from "@/components/forms/UserForm";

export default function NewUserPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const handleSubmit = async (data: { name: string; email: string; role: string }) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to create user");
      }
      // Show temp password before navigating
      if (json.data.tempPassword) {
        setTempPassword(json.data.tempPassword);
      } else {
        router.push("/users");
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (tempPassword) {
    return (
      <>
        <Header title="User Created" />
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="mb-4 rounded-lg bg-green-50 p-4 text-sm text-green-700">
            User created successfully!
          </div>
          <p className="mb-2 text-sm text-clutch-grey">
            Share this temporary password with the new user. They should change it after first login.
          </p>
          <div className="mb-4 rounded-lg bg-gray-50 p-3 font-mono text-sm">
            {tempPassword}
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(tempPassword);
            }}
            className="mr-2 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-clutch-grey hover:bg-gray-50"
          >
            Copy Password
          </button>
          <button
            onClick={() => router.push("/users")}
            className="rounded-lg bg-clutch-red px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
          >
            Done
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Add User" />
      <div className="mx-auto max-w-lg rounded-xl border border-gray-200 bg-white p-6">
        <UserForm onSubmit={handleSubmit} isLoading={isLoading} />
      </div>
    </>
  );
}
