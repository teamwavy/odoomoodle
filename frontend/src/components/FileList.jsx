import { formatBytes } from "../helpers.js";

export default function FileList({ files, onRemove }) {
  if (!files.length) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
        Aucun fichier sélectionné pour l’instant.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {files.map((item) => (
        <li
          key={item.id}
          className="flex items-start justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm"
        >
          <div>
            <p className="text-sm font-semibold text-slate-800">{item.file.name}</p>
            <p className="text-xs text-slate-500">{formatBytes(item.file.size)}</p>
            {item.status && (
              <p
                className={`mt-1 text-xs font-semibold ${
                  item.status === "converted"
                    ? "text-emerald-600"
                    : item.status === "warning"
                    ? "text-amber-600"
                    : item.status === "error"
                    ? "text-rose-600"
                    : "text-slate-500"
                }`}
              >
                Statut : {item.status}
              </p>
            )}
            {item.errors?.length ? (
              <ul className="mt-1 list-disc pl-5 text-xs text-rose-600">
                {item.errors.map((err, idx) => (
                  <li key={idx}>{err.message || err}</li>
                ))}
              </ul>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => onRemove?.(item.id)}
            className="rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
          >
            Retirer
          </button>
        </li>
      ))}
    </ul>
  );
}
