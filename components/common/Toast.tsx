"use client";

import { useEffect, useState, useCallback, createContext, useContext } from "react";

interface ToastMessage {
  id: string;
  type: "success" | "error" | "info";
  message: string;
}

interface ToastContextType {
  toast: (type: ToastMessage["type"], message: string) => void;
}

const ToastContext = createContext<ToastContextType>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const toast = useCallback((type: ToastMessage["type"], message: string) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, type, message }]);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastMessage;
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 4000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const colors = {
    success: "bg-green-600",
    error: "bg-red-600",
    info: "bg-clutch-blue",
  };

  return (
    <div
      className={`${colors[toast.type]} animate-in slide-in-from-right rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg`}
    >
      {toast.message}
    </div>
  );
}
