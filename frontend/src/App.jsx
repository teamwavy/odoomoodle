import { useMemo, useState } from "react";
import { convertFiles, getPreview } from "./api.js";
import UploadZone from "./components/UploadZone.jsx";
import FileList from "./components/FileList.jsx";
import PreviewTable from "./components/PreviewTable.jsx";
import SettingsPanel from "./components/SettingsPanel.jsx";
import ProgressBar from "./components/ProgressBar.jsx";
import { formatBytes, summarizeReport } from "./helpers.js";

const MAX_FILES = 50;
const MAX_TOTAL = 200 * 1024 * 1024;
const MAX_PER_FILE = 50 * 1024 * 1024;

export default function App() {
  const [entries, setEntries] = useState([]);
  const [mode, setMode] = useState("auto");
  const [previewData, setPreviewData] = useState([]);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [toasts, setToasts] = useState([]);
  const [report, setReport] = useState(null);

  const totalSize = useMemo(
    () => entries.reduce((acc, item) => acc + item.file.size, 0),
    [entries]
  );

  const pushToast = (message, tone = "info") => {
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, tone }]);
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  const handleFilesAdded = (files) => {
    if (!files?.length) return;

    if (entries.length + files.length > MAX_FILES) {
      pushToast(`Limite de ${MAX_FILES} fichiers dépassée.`, "error");
      return;
    }

    let incomingSize = 0;
    const accepted = [];
    const now = Date.now();

    files.forEach((file, index) => {
      if (file.size > MAX_PER_FILE) {
        pushToast(`"${file.name}" dépasse la taille maximale de 50 MB.`, "error");
        return;
      }
      incomingSize += file.size;
      accepted.push({
        id: `${now}-${index}-${file.name}`,
        file,
        status: "prêt",
        errors: []
      });
    });

    if (!accepted.length) {
      return;
    }

    if (totalSize + incomingSize > MAX_TOTAL) {
      pushToast("La taille totale dépasse 200 MB. Retirez certains fichiers.", "error");
      return;
    }

    setEntries((prev) => [...prev, ...accepted]);
    setPreviewData([]);
    setReport(null);
  };

  const handleRemove = (id) => {
    setEntries((prev) => prev.filter((item) => item.id !== id));
    setPreviewData([]);
  };

  const handleReset = () => {
    setEntries([]);
    setPreviewData([]);
    setProgress({ current: 0, total: 0 });
    setReport(null);
  };

  const handlePreview = async () => {
    if (!entries.length) {
      pushToast("Ajoutez au moins un fichier avant de lancer l’aperçu.", "warning");
      return;
    }
    setIsPreviewing(true);
    try {
      const response = await getPreview(
        entries.map((item) => item.file),
        mode
      );
      const preview = response.files || [];
      setPreviewData(preview);
      setEntries((prev) =>
        prev.map((item) => {
          const found = preview.find((p) => p.file === item.file.name);
          return found
            ? {
                ...item,
                status: found.status,
                errors: (found.errors || []).map((err) => err.message || JSON.stringify(err))
              }
            : item;
        })
      );
      pushToast("Aperçu généré avec succès.", "success");
    } catch (error) {
      const serverMessage =
        error?.response?.data?.detail ||
        error?.response?.data?.message ||
        error?.message ||
        "Impossible de générer l’aperçu. Vérifiez les fichiers.";
      pushToast(serverMessage, "error");
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleConvert = async () => {
    if (!entries.length) {
      pushToast("Ajoutez des fichiers avant de lancer la conversion.", "warning");
      return;
    }
    setIsConverting(true);
    setProgress({ current: 0, total: entries.length });
    try {
      const { blob, report: conversionReport } = await convertFiles(
        entries.map((item) => item.file),
        mode,
        (event) => {
          if (event.total) {
            setProgress({
              current: Math.min(entries.length, Math.round((event.loaded / event.total) * entries.length)),
              total: entries.length
            });
          }
        }
      );
      if (conversionReport) {
        setReport(conversionReport);
        const summary = summarizeReport(conversionReport);
        setProgress({ current: summary.converted, total: summary.total });
        setEntries((prev) =>
          prev.map((item) => {
            const found = conversionReport.files?.find((p) => p.file === item.file.name);
            return found
              ? {
                  ...item,
                  status: found.status,
                  errors: found.message ? [found.message] : []
                }
              : item;
          })
        );
      } else {
        setProgress({ current: entries.length, total: entries.length });
      }
      downloadBlob(blob, "moodle_exports.zip");
      pushToast("Archive téléchargée.", "success");
    } catch (error) {
      const serverMessage =
        error?.response?.data?.detail ||
        error?.response?.data?.message ||
        (error?.response?.data ? "Erreur côté serveur pendant la conversion." : null) ||
        "Conversion impossible. Vérifiez les fichiers ou relancez.";
      pushToast(serverMessage, "error");
    } finally {
      setIsConverting(false);
    }
  };

  const summary = useMemo(() => summarizeReport(report), [report]);

  return (
    <div className="min-h-screen bg-slate-100 pb-16">
      <header className="bg-primary py-6 text-white shadow">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-6">
          <h1 className="text-2xl font-bold">Convertisseur Odoo → Moodle</h1>
          <p className="text-sm text-white/80">
            Importez jusqu’à 50 fichiers Excel, visualisez l’aperçu des questions puis générez un ZIP Moodle prêt à importer.
          </p>
          <p className="text-xs uppercase tracking-widest text-white/60">by Lilo Bennardo</p>
        </div>
      </header>

      <main className="mx-auto mt-8 max-w-5xl px-6">
        <section className="grid gap-6 lg:grid-cols-[2fr,1fr]">
          <div className="flex flex-col gap-6">
            <UploadZone onFilesAdded={handleFilesAdded} disabled={isPreviewing || isConverting} />
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Fichiers sélectionnés</h2>
                <span className="text-xs text-slate-500">
                  {entries.length}/{MAX_FILES} • {formatBytes(totalSize)} / 200 MB
                </span>
              </div>
              <div className="mt-3">
                <FileList files={entries} onRemove={handleRemove} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handlePreview}
                  disabled={isPreviewing || isConverting}
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white shadow hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {isPreviewing ? "Aperçu en cours..." : "Générer l’aperçu"}
                </button>
                <button
                  type="button"
                  onClick={handleConvert}
                  disabled={isConverting}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {isConverting ? "Conversion..." : "Générer le ZIP Moodle"}
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={isPreviewing || isConverting || !entries.length}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Réinitialiser
                </button>
              </div>
            </div>
            <ProgressBar current={progress.current} total={progress.total || entries.length} isActive={isConverting} />
            {summary.total ? (
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Résultat de conversion</h2>
                <p className="mt-2 text-sm text-slate-600">
                  {summary.converted}/{summary.total} fichiers convertis. {summary.errors} erreurs détectées.
                </p>
              </div>
            ) : null}
          </div>
          <div className="flex flex-col gap-6">
            <SettingsPanel value={mode} onChange={setMode} />
            {toasts.length ? (
              <div className="space-y-2">
                {toasts.map((toast) => (
                  <div
                    key={toast.id}
                    className={`flex items-start justify-between rounded-lg border px-3 py-2 text-sm shadow-sm ${
                      toast.tone === "error"
                        ? "border-rose-200 bg-rose-50 text-rose-700"
                        : toast.tone === "success"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : toast.tone === "warning"
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : "border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    <span>{toast.message}</span>
                    <button
                      type="button"
                      onClick={() => removeToast(toast.id)}
                      className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </section>
        <PreviewTable data={previewData} />
      </main>
    </div>
  );
}

function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}
