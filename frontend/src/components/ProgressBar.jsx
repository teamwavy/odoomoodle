export default function ProgressBar({ current, total, isActive }) {
  if (!isActive) {
    return null;
  }

  const percentage = total ? Math.round((current / total) * 100) : 0;

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-slate-700">Progression</p>
      <div className="mt-2 h-3 w-full rounded-full bg-slate-100">
        <div
          className="h-3 rounded-full bg-accent transition-[width]"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {current}/{total} fichiers convertis ({percentage}%)
      </p>
    </div>
  );
}
