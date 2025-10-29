"""Application FastAPI pour la conversion Odoo -> Moodle."""

from __future__ import annotations

import json
from io import BytesIO
from typing import Dict, List

import pandas as pd
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from .converter import ConversionError, build_preview, process_excel_file

MAX_FILES = 50
MAX_PER_FILE_MB = 50
MAX_PER_FILE = MAX_PER_FILE_MB * 1024 * 1024
MAX_TOTAL = 200 * 1024 * 1024


app = FastAPI(
    title="Odoo vers Moodle",
    description="API de conversion d'examens Odoo vers Moodle XML.",
    version="1.0.0",
)

# CORS minimal pour usage interne.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _validate_file_count(files: List[UploadFile]) -> None:
    """Vérifie le nombre maximum de fichiers reçus."""
    if not files:
        raise HTTPException(status_code=400, detail="Aucun fichier envoyé.")
    if len(files) > MAX_FILES:
        raise HTTPException(
            status_code=400,
            detail=f"Limite dépassée : maximum {MAX_FILES} fichiers par requête.",
        )


def _validate_sizes(file_size: int, total_size: int, filename: str) -> None:
    """Applique les limites de taille individuelles et cumulées."""
    if file_size > MAX_PER_FILE:
        raise HTTPException(
            status_code=400,
            detail=f"Le fichier {filename} dépasse la taille maximale de {MAX_PER_FILE_MB} MB.",
        )
    if total_size > MAX_TOTAL:
        raise HTTPException(
            status_code=400,
            detail="La taille cumulée des fichiers dépasse la limite de 200 MB.",
        )


@app.post("/api/preview")
async def preview_endpoint(
    files: List[UploadFile] = File(...),
    multichoice_mode: str = Form("auto"),
):
    """Produit un aperçu JSON des questions détectées."""
    _validate_file_count(files)

    results = []
    total_size = 0
    options: Dict[str, str] = {"multichoice_mode": multichoice_mode}

    for upload in files:
        data = await upload.read()
        file_size = len(data)
        total_size += file_size
        _validate_sizes(file_size, total_size, upload.filename or "fichier")

        buffer = BytesIO(data)
        buffer.name = upload.filename

        try:
            df = pd.read_excel(buffer, dtype=str)
            questions = build_preview(df, options)
            errors = [
                {"question": item["reference"], "messages": item["errors"]}
                for item in questions
                if item["errors"]
            ]
            status = "ok" if not errors else "warning"
        except ConversionError as conv_err:
            questions = []
            errors = [{"message": str(conv_err)}]
            status = "error"
        except Exception as exc:  # pragma: no cover - erreur Pandas inattendue
            raise HTTPException(
                status_code=400,
                detail=f"Erreur de lecture du fichier {upload.filename}: {exc}",
            ) from exc

        results.append(
            {
                "file": upload.filename,
                "status": status,
                "questions": questions,
                "errors": errors,
            }
        )

    return JSONResponse({"files": results})


@app.post("/api/convert")
async def convert_endpoint(
    files: List[UploadFile] = File(...),
    multichoice_mode: str = Form("auto"),
):
    """Convertit les fichiers Excel en XML dans une archive ZIP."""
    _validate_file_count(files)

    total_size = 0
    report = {"files": []}
    options: Dict[str, str] = {"multichoice_mode": multichoice_mode}

    zip_buffer = BytesIO()
    from zipfile import ZIP_DEFLATED, ZipFile

    converted_count = 0

    with ZipFile(zip_buffer, "w", ZIP_DEFLATED) as zf:
        for idx, upload in enumerate(files, start=1):
            data = await upload.read()
            file_size = len(data)
            total_size += file_size
            _validate_sizes(file_size, total_size, upload.filename or "fichier")

            buffer = BytesIO(data)
            buffer.name = upload.filename

            try:
                xml_name, xml_bytes, summaries = process_excel_file(buffer, options)
                folder = f"export_{idx:03}"
                archive_name = f"{folder}/{xml_name}"
                zf.writestr(archive_name, xml_bytes)
                converted_count += 1
                report["files"].append(
                    {
                        "file": upload.filename,
                        "status": "converted",
                        "xml": archive_name,
                        "questions": summaries,
                    }
                )
            except ConversionError as conv_err:
                report["files"].append(
                    {
                        "file": upload.filename,
                        "status": "error",
                        "message": str(conv_err),
                    }
                )
            except Exception as exc:  # pragma: no cover - erreur Pandas inattendue
                raise HTTPException(
                    status_code=400,
                    detail=f"Erreur de lecture du fichier {upload.filename}: {exc}",
                ) from exc

    if converted_count == 0:
        raise HTTPException(
            status_code=400,
            detail="Conversion échouée : aucun fichier valide.",
        )

    zip_buffer.seek(0)
    headers = {
        "Content-Disposition": 'attachment; filename="moodle_exports.zip"',
        "X-Conversion-Report": json.dumps(report),
    }
    return StreamingResponse(zip_buffer, media_type="application/zip", headers=headers)
