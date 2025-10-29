import { useState } from "react";

const MAX_FILES = 50;
const MAX_SIZE_MB = 50;

export default function UploadZone({ onFilesAdded, disabled }) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (event) => {
    event.preventDefault();
    if (disabled) return;
    setIsDragging(true);
  };

  const handleDragLeave = (event) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    if (disabled) return;
    setIsDragging(false);
    const received = Array.from(event.dataTransfer.files || []);
    onFilesAdded?.(received);
  };

  const handleInputChange = (event) => {
    const received = Array.from(event.target.files || []);
    onFilesAdded?.(received);
    event.target.value = "";
  };

  return (
    <div className="flex flex-col gap-3">
      <label className="text-sm font-semibold uppercase tracking-wide text-slate-600">
        Import de fichiers Excel
      </label>
      <div
        className={`rounded-xl border-2 border-dashed p-8 text-center transition ${
          isDragging ? "border-accent bg-accent/10" : "border-slate-300 bg-white"
        } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
        onKeyPress={() => {}}
      >
        <p className="text-base font-medium text-slate-700">
          Glissez vos fichiers exportés d’Odoo ici ou cliquez pour parcourir.
        </p>
        <p className="mt-2 text-sm text-slate-500">
          Jusqu’à {MAX_FILES} fichiers, {MAX_SIZE_MB} MB par fichier (200 MB au total).
        </p>
        <div className="mt-6 flex justify-center">
          <label className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white shadow hover:bg-primary/90">
            Choisir des fichiers
            <input
              type="file"
              accept=".xlsx"
              multiple
              className="hidden"
              onChange={handleInputChange}
              disabled={disabled}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
