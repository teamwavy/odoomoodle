"""Outils utilitaires pour la conversion Odoo -> Moodle."""

from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation
from typing import Dict, Iterable, Optional

from lxml import etree
from slugify import slugify


# Cartographie des colonnes possibles vers les noms canoniques utilisés dans la conversion.
COLUMN_ALIASES: Dict[str, Iterable[str]] = {
    "reference": ("référence", "reference", "ref", "id", "identifiant"),
    "name": ("nom", "name", "titre", "title"),
    "question": (
        "question",
        "intitulé",
        "intitule",
        "question text",
        "questiontexte",
    ),
    "type": ("type", "question type", "categorie", "catégorie"),
    "points": ("point", "points", "score", "defaultgrade"),
    "answer": (
        "réponse à la question",
        "réponse",
        "reponse",
        "answer",
        "choice",
        "option",
    ),
    "solution": ("solution", "correcte", "bonne réponse", "is correct", "correct"),
    "acceptable": (
        "réponse à la question/solution acceptable",
        "acceptable",
        "solution acceptable",
        "response acceptable",
        "réponse à la question/simulation acceptable",
        "réponse à la question solution acceptable",
        "solution acceptable (points)",
    ),
    "answer_points_checked": (
        "réponse à la question/point (case cochée)",
        "response points checked",
        "points checked",
    ),
    "answer_points_unchecked": (
        "réponse à la question/point (case décochée)",
        "response points unchecked",
        "points unchecked",
    ),
}


def normalize_header(name: str) -> Optional[str]:
    """Retourne le nom canonique de colonne si reconnu, sinon None."""
    if not name:
        return None

    def _normalize(value: str) -> str:
        return re.sub(r"[\W_]+", " ", value, flags=re.UNICODE).strip().lower()

    normalized = _normalize(name)
    for canonical, candidates in COLUMN_ALIASES.items():
        if normalized == canonical:
            return canonical
        for candidate in candidates:
            if normalized == _normalize(candidate):
                return canonical
    return None


def norm_yn(value: object) -> Optional[bool]:
    """Normalise les valeurs Oui/Non en booléen."""
    if value is None:
        return None
    text = str(value).strip().lower()
    if text in {"oui", "yes", "vrai", "true", "1", "y"}:
        return True
    if text in {"non", "no", "faux", "false", "0", "n"}:
        return False
    return None


def norm_points(value: object) -> str:
    """Convertit le score en chaîne compatible Moodle (ex: 12,5 -> 12.5)."""
    if value is None or (isinstance(value, float) and value != value):
        return "0"
    text = str(value).strip().replace(",", ".")
    try:
        number = Decimal(text)
    except InvalidOperation:
        return "0"
    # Limiter à 6 décimales, suffisant pour Moodle.
    quantized = number.quantize(Decimal("0.000001")) if number % 1 else number
    return format(quantized.normalize(), "f")


def slugify_filename(raw_name: str, suffix: str = ".xml") -> str:
    """Transforme un nom de fichier en version sûre pour le ZIP."""
    base = slugify(raw_name or "export")
    return f"{base or 'export'}{suffix}"


def create_cdata(text: object) -> etree.CDATA:
    """Crée une section CDATA pour un contenu donné."""
    value = "" if text is None else str(text)
    # Moodle tolère les sections CDATA imbriquées si l'on échappe la séquence de fin.
    safe_value = value.replace("]]>", "]]]]><![CDATA[>")
    return etree.CDATA(safe_value)


def detect_question_type(explicit: Optional[str], inferred: Optional[str]) -> str:
    """Retourne le type de question en priorisant la valeur explicite."""
    if explicit:
        return explicit.lower().strip()
    return (inferred or "").lower().strip()


def is_blank(value: object) -> bool:
    """Indique si une valeur peut être considérée comme vide."""
    if value is None:
        return True
    if isinstance(value, float) and value != value:
        return True
    if isinstance(value, str) and value.strip() == "":
        return True
    return False
