"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useAuth } from "@/hooks/useAuth";

const NAV_ITEMS = [
  { href: "/", label: "Overview" },
  { href: "/platforms/youtube", label: "YouTube", indent: true },
  { href: "/platforms/twitter", label: "X / Twitter", indent: true },
  { href: "/platforms/instagram", label: "Instagram", indent: true },
  { href: "/platforms/tiktok", label: "TikTok", indent: true },
  { href: "/comparison", label: "Comparison" },
  { href: "/accounts", label: "Accounts" },
  { href: "/profiles", label: "Profiles" },
  { href: "/settings", label: "Settings" },
];

const ADMIN_ITEMS = [
  { href: "/users", label: "Users" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, isAdmin } = useAuth();

  return (
    <aside className="flex w-56 flex-shrink-0 flex-col border-r border-gray-200 bg-white">
      {/* Logo */}
      <div className="flex h-14 items-center border-b border-gray-200 px-4">
        <Link href="/" className="flex items-center gap-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logos/clutch-black.png"
            alt="Clutch Group"
            className="h-7 w-auto"
          />
          <span className="text-[8px] font-bold uppercase tracking-widest text-clutch-black">
            Social
          </span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-0.5 p-3">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                item.indent ? "pl-6" : ""
              } ${
                isActive
                  ? "bg-clutch-blue/5 text-clutch-blue"
                  : "text-clutch-grey hover:bg-clutch-white"
              }`}
            >
              {item.label}
            </Link>
          );
        })}

        {isAdmin && (
          <>
            <div className="my-2 border-t border-gray-100" />
            {ADMIN_ITEMS.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-clutch-blue/5 text-clutch-blue"
                      : "text-clutch-grey hover:bg-clutch-white"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* User info + logout */}
      <div className="border-t border-gray-200 p-3">
        <div className="mb-2 px-3">
          <p className="truncate text-sm font-medium text-clutch-black">
            {user?.name}
          </p>
          <p className="truncate text-xs text-clutch-grey/50">{user?.email}</p>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-red-500 transition-colors hover:bg-red-50"
        >
          Sign Out
        </button>
      </div>
    </aside>
  );
}
