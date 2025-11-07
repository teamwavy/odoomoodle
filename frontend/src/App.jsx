import { useMemo, useState } from "react";
import { convertFiles, getPreview } from "./api.js";
import UploadZone from "./components/UploadZone.jsx";
import FileList from "./components/FileList.jsx";
import PreviewTable from "./components/PreviewTable.jsx";
import SettingsPanel from "./components/SettingsPanel.jsx";
import ProgressBar from "./components/ProgressBar.jsx";
import { formatBytes, summarizeReport } from "./helpers.js";
import hotLogo from "./assets/HOT_logo.png";

const MAPPING_INFO = [
  { left: "Texte libre", right: "essay", detail: "Reponse ecrite manuelle" },
  { left: "Oui/Non", right: "truefalse", detail: "Question booleenne" },
  { left: "QCU", right: "multichoice (single=true)", detail: "Une seule bonne reponse" },
  { left: "QCM + Reponses", right: "oumultiresponse", detail: "Multi-bonnes reponses ponderees" },
  { left: "QCM + Question", right: "multichoiceset", detail: "Tout ou rien" },
];

function TypeRow({ left, right, detail }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-white/10 px-3 py-2 text-white">
      <div>
        <p className="text-sm font-semibold">{left}</p>
        <p className="text-xs text-white/70">{detail}</p>
      </div>
      <p className="text-sm font-semibold">{right}</p>
    </div>
  );
}

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
      pushToast(`Limite de ${MAX_FILES} fichiers depassee.`, "error");
      return;
    }

    let incomingSize = 0;
    const accepted = [];
    const now = Date.now();

    files.forEach((file, index) => {
      if (file.size > MAX_PER_FILE) {
        pushToast(`"${file.name}" depasse la taille maximale de 50 MB.`, "error");
        return;
      }
      incomingSize += file.size;
      accepted.push({
        id: `${now}-${index}-${file.name}`,
        file,
        status: "pret",
        errors: [],
      });
    });

    if (!accepted.length) return;
    if (totalSize + incomingSize > MAX_TOTAL) {
      pushToast("La taille totale depasse 200 MB. Retirez certains fichiers.", "error");
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
      pushToast("Ajoutez au moins un fichier avant de lancer l'aperçu.", "warning");
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
                errors: (found.errors || []).map((err) => err.message || JSON.stringify(err)),
              }
            : item;
        })
      );
      pushToast("Aperçu genere avec succes.", "success");
    } catch (error) {
      const serverMessage =
        error?.response?.data?.detail ||
        error?.response?.data?.message ||
        error?.message ||
        "Impossible de generer l'aperçu. Verifiez les fichiers.";
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
              total: entries.length,
            });
          }
        }
      );
      if (conversionReport) {
        setReport(conversionReport);
        const summaryReport = summarizeReport(conversionReport);
        setProgress({ current: summaryReport.converted, total: summaryReport.total });
        setEntries((prev) =>
          prev.map((item) => {
            const found = conversionReport.files?.find((p) => p.file === item.file.name);
            return found
              ? {
                  ...item,
                  status: found.status,
                  errors: found.message ? [found.message] : [],
                }
              : item;
          })
        );
      } else {
        setProgress({ current: entries.length, total: entries.length });
      }
      downloadBlob(blob, "moodle_exports.zip");
      pushToast("Archive telechargee.", "success");
    } catch (error) {
      const serverMessage =
        error?.response?.data?.detail ||
        error?.response?.data?.message ||
        (error?.response?.data ? "Erreur cote serveur pendant la conversion." : null) ||
        "Conversion impossible. Verifiez les fichiers ou relancez.";
      pushToast(serverMessage, "error");
    } finally {
      setIsConverting(false);
    }
  };

  const summary = useMemo(() => summarizeReport(report), [report]);

  return (
    <div className="relative min-h-screen bg-[#f6f1e7] pb-16 text-slate-900">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.9),_rgba(247,240,231,0.4)),linear-gradient(120deg,_rgba(255,255,255,0.4),_rgba(255,255,255,0))]"
      />

      <header className="relative z-10 border-b border-white/60 bg-white/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <img src={hotLogo} alt="House of Training" className="h-12 w-auto" />
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">House of Training</p>
              <p className="text-sm font-semibold text-[#122655]">Odoo → Moodle Conversion Studio</p>
            </div>
          </div>
        </div>
      </header>

      <section className="relative z-10 mx-auto max-w-6xl px-6 pt-12">
        <div className="grid gap-8 lg:grid-cols-[1.5fr,1fr]">
          <div className="space-y-6">
            <h1 className="text-4xl font-extrabold leading-tight text-[#122655] sm:text-5xl">
              Bienvenue à toutes et <span className="text-[#ea5480]">à tous !</span>
            </h1>
            <p className="text-base text-slate-600">
              C'est Lilo, et voici une web app qui convertit vos examens Odoo en fichiers Moodle XML, prêts à importer.
              Importez, visualisez et exportez vos questions rapidement dans une interface simple et inspirée de House of Training.
            </p>
            <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-500">
              By Lilo Bennardo
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href="https://houseoftraining.lu/web/login"
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-gradient-to-r from-[#f6be7b] via-[#f27396] to-[#a66dea] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#f27396]/30 transition hover:shadow-xl"
              >
                Aller sur Odoo
              </a>
              <a
                href="https://digital.houseoftraining.lu/login/index.php"
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-[#122655] px-6 py-3 text-sm font-semibold text-[#122655] transition hover:bg-[#122655] hover:text-white"
              >
                Aller sur Moodle
              </a>
            </div>
            <div className="rounded-3xl border border-[#122655]/15 bg-white/80 p-4 shadow-lg shadow-slate-200/80 backdrop-blur">
              <p className="text-sm font-semibold text-[#122655]">En cas de problème ou de bug</p>
              <p className="text-sm text-slate-600">
                Contactez le service IT — Éric ou Lilo — ou écrivez-leur directement. Ils vous aideront à relancer l’import ou à dépanner rapidement.
              </p>
              <a
                href="mailto:informatique.informatique@houseoftraining.lu"
                className="mt-3 inline-flex items-center justify-center rounded-full bg-[#122655] px-4 py-2 text-sm font-semibold text-white shadow hover:bg-[#0f1c3f]"
              >
                Contacter le Support IT
              </a>
            </div>
          </div>
          <div className="rounded-3xl bg-gradient-to-r from-[#f3c969] via-[#f68ca9] to-[#8977f5] p-6 text-white shadow-2xl shadow-[#d87ab5]/40">
            <h2 className="mt-3 text-2xl font-semibold">Comment vos questions sont mappees</h2>
            <p className="mt-2 text-sm text-white/80">Chaque type Excel trouve automatiquement son equivalent Moodle.</p>
            <div className="mt-4 space-y-2 text-sm">
              {MAPPING_INFO.map((item) => (
                <TypeRow key={item.left} {...item} />
              ))}
            </div>
          </div>
        </div>
        <div className="mt-10" />
      </section>

      <main className="relative z-10 mx-auto mt-10 max-w-6xl px-6">
        <div className="flex flex-col gap-6">
          <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-lg shadow-slate-200/60 backdrop-blur">
            <UploadZone onFilesAdded={handleFilesAdded} disabled={isPreviewing || isConverting} />
          </div>
          <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
            <div className="flex flex-col gap-6">
              <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-lg shadow-slate-200/60 backdrop-blur">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-[#122655]">Fichiers selectionnes</h2>
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
                    className="rounded-full bg-gradient-to-r from-[#f6be7b] via-[#f27396] to-[#a66dea] px-5 py-2 text-sm font-semibold text-white shadow hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isPreviewing ? "Apercu en cours..." : "Generer l'aperçu"}
                  </button>
                  <button
                    type="button"
                    onClick={handleConvert}
                    disabled={isConverting}
                    className="rounded-full border border-[#122655] px-5 py-2 text-sm font-semibold text-[#122655] hover:bg-[#122655] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isConverting ? "Conversion..." : "Generer le ZIP Moodle"}
                  </button>
                  <button
                    type="button"
                    onClick={handleReset}
                    disabled={isPreviewing || isConverting || !entries.length}
                    className="rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Reinitialiser
                  </button>
                </div>
              </div>
              <ProgressBar current={progress.current} total={progress.total || entries.length} isActive={isConverting} />
              {summary.total ? (
                <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-lg shadow-slate-200/60 backdrop-blur">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-[#122655]">Resultat de conversion</h2>
                  <p className="mt-2 text-sm text-slate-600">
                    {summary.converted}/{summary.total} fichiers convertis. {summary.errors} erreurs detectees.
                  </p>
                </div>
              ) : null}
            </div>
            <div className="flex flex-col gap-6">
              <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-lg shadow-slate-200/60 backdrop-blur">
                <SettingsPanel value={mode} onChange={setMode} />
              </div>
              {toasts.length ? (
                <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-lg shadow-slate-200/60 backdrop-blur">
                  <div className="space-y-2">
                    {toasts.map((toast) => (
                      <div
                        key={toast.id}
                        className={`flex items-start justify-between rounded-2xl border px-4 py-3 text-sm shadow ${
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
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <PreviewTable data={previewData} />
      </main>
      <footer className="z-10 border-t border-white/60 bg-white/70 py-4 text-center text-xs text-slate-500">
        © 2025 Lilo Bennardo — Version V0.0.4
      </footer>
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
