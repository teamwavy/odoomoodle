const OPTIONS = [
  { value: "auto", label: "Détection automatique" },
  { value: "all_or_nothing", label: "Tout ou rien (multichoiceset)" },
  { value: "partial", label: "Points partiels (oumultiresponse)" }
];

export default function SettingsPanel({ value, onChange }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Paramètres QCM</h2>
      <p className="mt-1 text-sm text-slate-500">
        Choisissez la stratégie de conversion des QCM lorsque plusieurs bonnes réponses sont possibles.
      </p>
      <div className="mt-3 space-y-2">
        {OPTIONS.map((option) => (
          <label
            key={option.value}
            className="flex cursor-pointer items-center gap-2 rounded-lg border border-transparent px-3 py-2 hover:border-accent/40"
          >
            <input
              type="radio"
              name="multichoice_mode"
              value={option.value}
              checked={value === option.value}
              onChange={(event) => onChange?.(event.target.value)}
              className="h-4 w-4 text-primary focus:ring-primary"
            />
            <span className="text-sm text-slate-700">{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
