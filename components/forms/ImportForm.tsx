"use client";

import { useState, useRef } from "react";

interface ImportResult {
  importId: string;
  rowsAttempted: number;
  rowsSuccessful: number;
  errors: { row: number; column: string; error: string }[];
}

interface ImportFormProps {
  onComplete?: (result: ImportResult) => void;
}

export default function ImportForm({ onComplete }: ImportFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [platform, setPlatform] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setIsImporting(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      if (platform) formData.append("platform", platform);

      const res = await fetch("/api/posts/import", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Import failed");
        return;
      }

      setResult(json.data);
      onComplete?.(json.data);
    } catch {
      setError("Import failed. Please try again.");
    } finally {
      setIsImporting(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* File upload */}
      <div>
        <label className="mb-1 block text-xs font-medium text-clutch-grey">
          File
        </label>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-clutch-red file:px-3 file:py-1 file:text-xs file:font-medium file:text-white"
        />
        <p className="mt-1 text-[10px] text-clutch-grey/50">
          Accepted formats: .csv, .xlsx, .xls
        </p>
      </div>

      {/* Platform selector */}
      <div>
        <label className="mb-1 block text-xs font-medium text-clutch-grey">
          Platform Filter (optional)
        </label>
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">All Platforms</option>
          <option value="youtube">YouTube</option>
          <option value="twitter">Twitter</option>
          <option value="instagram">Instagram</option>
          <option value="tiktok">TikTok</option>
        </select>
        <p className="mt-1 text-[10px] text-clutch-grey/50">
          Filter rows to import only a specific platform
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-xs text-red-600">{error}</div>
      )}

      {/* Results */}
      {result && (
        <div className="rounded-lg border border-gray-200 p-4">
          <div className="mb-3 flex items-center gap-2">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${
                result.rowsSuccessful === result.rowsAttempted
                  ? "bg-green-500"
                  : result.rowsSuccessful > 0
                    ? "bg-yellow-500"
                    : "bg-red-500"
              }`}
            />
            <span className="text-sm font-medium text-clutch-black">
              Import Complete
            </span>
          </div>

          <div className="mb-3 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-gray-50 p-2">
              <p className="text-lg font-bold text-clutch-black">{result.rowsAttempted}</p>
              <p className="text-[10px] text-clutch-grey/50">Attempted</p>
            </div>
            <div className="rounded-lg bg-green-50 p-2">
              <p className="text-lg font-bold text-green-600">{result.rowsSuccessful}</p>
              <p className="text-[10px] text-clutch-grey/50">Successful</p>
            </div>
            <div className="rounded-lg bg-red-50 p-2">
              <p className="text-lg font-bold text-red-600">{result.errors.length}</p>
              <p className="text-[10px] text-clutch-grey/50">Errors</p>
            </div>
          </div>

          {result.errors.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-lg bg-red-50 p-3">
              <p className="mb-2 text-xs font-medium text-red-700">Errors:</p>
              {result.errors.map((err, i) => (
                <p key={i} className="text-[10px] text-red-600">
                  Row {err.row}{err.column ? `, ${err.column}` : ""}: {err.error}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        {result ? (
          <button
            type="button"
            onClick={handleReset}
            className="rounded-lg bg-clutch-red px-4 py-2 text-xs font-medium text-white hover:bg-red-700"
          >
            Import Another File
          </button>
        ) : (
          <button
            type="submit"
            disabled={!file || isImporting}
            className="rounded-lg bg-clutch-red px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            {isImporting ? "Importing..." : "Import Data"}
          </button>
        )}
      </div>
    </form>
  );
}
