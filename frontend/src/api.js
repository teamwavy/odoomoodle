import axios from "axios";

const client = axios.create({
  headers: {
    "X-Requested-With": "XMLHttpRequest"
  },
  timeout: 120000
});

export async function getPreview(files, mode) {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file, file.name));
  formData.append("multichoice_mode", mode);

  const response = await client.post("/api/preview", formData);
  return response.data;
}

export async function convertFiles(files, mode, onUploadProgress) {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file, file.name));
  formData.append("multichoice_mode", mode);

  const response = await client.post("/api/convert", formData, {
    responseType: "blob",
    onUploadProgress
  });

  let report = null;
  const header = response.headers["x-conversion-report"];
  if (header) {
    try {
      report = JSON.parse(header);
    } catch (error) {
      report = null;
    }
  }

  return { blob: response.data, report };
}
