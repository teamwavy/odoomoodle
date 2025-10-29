export function formatBytes(bytes, decimals = 1) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function summarizeReport(report) {
  if (!report?.files?.length) {
    return {
      converted: 0,
      errors: 0,
      warnings: 0,
      total: 0
    };
  }
  let converted = 0;
  let errors = 0;
  report.files.forEach((item) => {
    if (item.status === "converted") converted += 1;
    if (item.status === "error") errors += 1;
  });
  return {
    converted,
    errors,
    warnings: 0,
    total: report.files.length
  };
}
