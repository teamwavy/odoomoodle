export default function PreviewTable({ data }) {
  if (!data?.length) {
    return null;
  }

  const rows = [];
  data.forEach((fileBlock) => {
    if (!fileBlock.questions?.length) {
      rows.push(
        <tr key={`${fileBlock.file}-empty`}>
          <td className="px-3 py-2 font-semibold text-slate-700">{fileBlock.file}</td>
          <td className="px-3 py-2 italic text-slate-500" colSpan={6}>
            Aucun aperçu disponible. {fileBlock.errors?.[0]?.message || ""}
          </td>
        </tr>
      );
      return;
    }

    fileBlock.questions.forEach((question, index) => {
      rows.push(
        <tr key={`${fileBlock.file}-${index}`}>
          {index === 0 ? (
            <td
              className="px-3 py-2 align-top font-semibold text-slate-700"
              rowSpan={fileBlock.questions.length}
            >
              {fileBlock.file}
              <span className="block text-xs font-normal text-slate-500">
                Statut : {fileBlock.status}
              </span>
            </td>
          ) : null}
          <td className="px-3 py-2 text-slate-700">{question.reference}</td>
          <td className="px-3 py-2 text-slate-700">{question.name}</td>
          <td className="px-3 py-2 text-slate-600">{question.detected_type}</td>
          <td className="px-3 py-2 text-right text-slate-600">{question.answers_count}</td>
          <td className="px-3 py-2 text-right text-slate-600">{question.points}</td>
          <td className="px-3 py-2 text-xs text-rose-600">
            {question.errors?.length ? question.errors.join(" ; ") : ""}
          </td>
        </tr>
      );
    });
  });

  return (
    <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
          <tr>
            <th className="px-3 py-2 text-left">Fichier</th>
            <th className="px-3 py-2 text-left">Référence</th>
            <th className="px-3 py-2 text-left">Nom</th>
            <th className="px-3 py-2 text-left">Type détecté</th>
            <th className="px-3 py-2 text-right">Nb réponses</th>
            <th className="px-3 py-2 text-right">Points</th>
            <th className="px-3 py-2 text-left">Erreurs</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows}
        </tbody>
      </table>
    </div>
  );
}
