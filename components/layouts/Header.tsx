"use client";

interface HeaderProps {
  title: string;
  children?: React.ReactNode;
}

export default function Header({ title, children }: HeaderProps) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <h1 className="text-2xl font-bold text-clutch-black">{title}</h1>
      {children && <div className="flex items-center gap-3">{children}</div>}
    </div>
  );
}
