"""Logique de conversion des fichiers Excel Odoo vers Moodle XML."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from io import BytesIO
import re
from typing import Dict, Iterable, List, Optional

import pandas as pd
from lxml import etree

from .utils import create_cdata, is_blank, norm_points, norm_yn, normalize_header, slugify_filename


DEFAULT_OPTIONS = {
    "multichoice_mode": "auto",  # auto | all_or_nothing | partial
    "shuffleanswers": True,
}

logger = logging.getLogger(__name__)

OPTIONAL_COLUMNS = {
    "version": "Version",
    "duration": "Durée",
    "status": "État",
}


@dataclass
class Answer:
    text: str
    is_correct: bool
    feedback: str = ""
    points_value: Optional[float] = None


@dataclass
class ParsedQuestion:
    reference: str
    title: str
    question_text: str
    raw_type: str
    moodle_type: str
    defaultgrade: str
    answers: List[Answer]
    single: bool
    shuffle: bool
    errors: List[str]

    @property
    def summary(self) -> Dict[str, object]:
        return {
            "reference": self.reference,
            "name": self.title,
            "detected_type": self.moodle_type,
            "raw_type": self.raw_type,
            "answers_count": len(self.answers),
            "points": self.defaultgrade,
            "errors": self.errors,
        }


class ConversionError(Exception):
    """Erreur levée lorsque la conversion d'un fichier échoue."""


def process_excel_file(file_obj, options: Optional[Dict] = None) -> Tuple[str, bytes, List[Dict[str, object]]]:
    """Lit un fichier Excel et renvoie le couple (nom_xml, contenu_xml, aperçu)."""
    merged_options = {**DEFAULT_OPTIONS, **(options or {})}
    try:
        file_obj.seek(0)
    except Exception:
        pass

    try:
        df = pd.read_excel(file_obj, dtype=str)
    except Exception as exc:  # pragma: no cover - lecture pandas
        raise ConversionError(f"Impossible de lire le fichier Excel: {exc}") from exc

    questions = extract_questions(df, merged_options)
    errors = [q for q in questions if q.errors]
    if not questions:
        raise ConversionError("Aucune question exploitable trouvée dans le fichier.")

    xml_bytes = convert_questions_to_xml(questions)
    xml_name = slugify_filename(getattr(file_obj, "filename", "export") or "export")
    if not xml_name.lower().endswith(".xml"):
        xml_name = f"{xml_name}.xml"

    return xml_name, xml_bytes, [q.summary for q in questions]


def convert_df_to_xml(df: pd.DataFrame, options: Optional[Dict] = None) -> bytes:
    """Convertit un DataFrame en XML Moodle."""
    merged_options = {**DEFAULT_OPTIONS, **(options or {})}
    questions = extract_questions(df, merged_options)
    if not questions:
        raise ConversionError("Aucune question exploitable trouvée dans la feuille.")
    return convert_questions_to_xml(questions)


def build_preview(df: pd.DataFrame, options: Optional[Dict] = None) -> List[Dict[str, object]]:
    """Génère la liste des questions pour l'aperçu JSON."""
    merged_options = {**DEFAULT_OPTIONS, **(options or {})}
    questions = extract_questions(df, merged_options)
    return [q.summary for q in questions]


def extract_questions(df: pd.DataFrame, options: Dict) -> List[ParsedQuestion]:
    """Transforme le DataFrame en liste de questions prêtes pour Moodle."""
    df = df.copy()
    rename_map = {
        col: normalize_header(str(col))
        for col in df.columns
        if normalize_header(str(col))
    }
    df = df.rename(columns=rename_map)

    required = {"reference", "question", "type"}
    missing = required - set(df.columns)
    if missing:
        readable = ", ".join(sorted(missing))
        raise ConversionError(f"Colonnes manquantes dans le fichier : {readable}")

    missing_optional = []
    for key, label in OPTIONAL_COLUMNS.items():
        if key not in df.columns:
            df[key] = None
            missing_optional.append(label)
    for label in missing_optional:
        logger.warning("Colonne manquante : %s — ignorée", label)

    for col in ("name", "points", "answer", "solution", "acceptable"):
        if col not in df.columns:
            df[col] = None

    ffill_columns = ["reference", "name", "question", "type", "points"]
    df[ffill_columns] = df[ffill_columns].ffill()

    # Supprimer les lignes totalement vides.
    df = df.dropna(how="all")

    # Génération d'un identifiant de groupe stable.
    def group_identifier(row):
        parts = [
            str(row.get("reference") or ""),
            str(row.get("question") or ""),
            str(row.get("name") or ""),
        ]
        return "||".join(parts)

    df["__group_id"] = df.apply(group_identifier, axis=1)

    questions: List[ParsedQuestion] = []
    seen_keys = set()

    for _, group in df.groupby("__group_id", sort=False):
        base = group.iloc[0]
        reference = str(base.get("reference") or "").strip() or f"Question {len(questions) + 1}"
        title = str(base.get("name") or base.get("question") or reference).strip() or reference
        question_text = str(base.get("question") or "").strip()
        raw_type = str(base.get("type") or "").strip()

        key = (reference, question_text)
        if key in seen_keys:
            reference = f"{reference}-{len(questions) + 1}"
        seen_keys.add(key)

        cleaned_type = _clean_type_label(raw_type)
        answers = _extract_answers(group, cleaned_type)
        if not answers:
            tf_value = None
            if cleaned_type in {"ouinon", "truefalse", "vraifaux"}:
                tf_value = _guess_truefalse_answer([], base)
            if tf_value is not None:
                answers = [
                    Answer(text="true", is_correct=tf_value is True),
                    Answer(text="false", is_correct=tf_value is False),
                ]
            else:
                # On ignore les entrées sans réponses réelles (lignes d'entête ou métadonnées).
                continue
        has_points_column = False
        if "answer_points_checked" in group.columns:
            cleaned_points = (
                group["answer_points_checked"]
                .astype(str)
                .str.strip()
                .replace({"nan": "", "None": ""})
            )
            has_points_column = cleaned_points.ne("").any()

        parsed = _build_question(
            reference,
            title,
            question_text,
            raw_type,
            answers,
            base,
            has_points_column,
            options,
        )
        questions.append(parsed)

    return questions


def _extract_answers(group: pd.DataFrame, cleaned_type: str) -> List[Answer]:
    """Retourne la liste des réponses d'un groupe."""
    only_acceptable = cleaned_type in {"qcu", "choixunique", "singlechoice"}
    preferred_markers = ("acceptable",) if only_acceptable else ("solution", "acceptable")

    question_points_value: Optional[float] = None
    if only_acceptable:
        raw_points = group.iloc[0].get("points") if "points" in group.columns else None
        if raw_points is not None and str(raw_points).strip() != "":
            try:
                question_points_value = float(str(raw_points).replace(",", "."))
            except (ValueError, TypeError):
                question_points_value = None

    def _has_values(marker: str) -> bool:
        if marker not in group.columns:
            return False
        values = (
            group[marker]
            .dropna()
            .astype(str)
            .str.strip()
        )
        return values.ne("").any()

    if any(_has_values(marker) for marker in preferred_markers):
        text_markers = preferred_markers
    else:
        text_markers = ("solution", "acceptable")

    bool_markers = text_markers

    textual_solutions: set[str] = set()
    for marker in text_markers:
        if marker not in group.columns:
            continue
        for value in group[marker].dropna().astype(str):
            if norm_yn(value) is not None:
                continue
            parts = re.split(r"[;\n\r,/]+", value)
            for part in parts:
                cleaned = part.strip()
                if cleaned:
                    textual_solutions.add(cleaned.lower())

    answers: List[Answer] = []
    for _, row in group.iterrows():
        text = row.get("answer")
        if is_blank(text):
            continue
        candidate = str(text).strip()
        candidate_norm = candidate.lower()
        is_correct = False

        for marker in bool_markers:
            flag = norm_yn(row.get(marker))
            if flag is True:
                is_correct = True
                break

        if not is_correct and textual_solutions:
            # Comparaison insensible à la casse pour les réponses textuelles.
            if candidate_norm in textual_solutions:
                is_correct = True

        answer = Answer(text=candidate, is_correct=is_correct)
        if only_acceptable and question_points_value is not None:
            answer.points_value = question_points_value if is_correct else 0.0
        elif "answer_points_checked" in group.columns and not only_acceptable:
            try:
                raw = row.get("answer_points_checked")
                if raw is not None and str(raw).strip() != "":
                    value = float(str(raw).replace(",", "."))
                    answer.is_correct = value > 0
                    answer.points_value = value
            except Exception:  # pragma: no cover - conversion defensive
                pass
        answers.append(answer)
    return answers


def _clean_type_label(label: str) -> str:
    """Nettoie le libellé de type pour faciliter la détection."""
    return "".join(ch for ch in label.lower() if ch.isalnum())


def _build_question(
    reference: str,
    title: str,
    question_text: str,
    raw_type: str,
    answers: List[Answer],
    base_row: pd.Series,
    has_points_column: bool,
    options: Dict,
) -> ParsedQuestion:
    """Crée l'objet question prêt pour la sérialisation XML."""
    errors: List[str] = []

    cleaned_type = _clean_type_label(raw_type)
    moodle_type = determine_moodle_type(cleaned_type, answers, options, has_points_column)

    defaultgrade = norm_points(base_row.get("points"))
    shuffle = bool(options.get("shuffleanswers", True))
    single = moodle_type == "multichoice"  # multichoice Moodle (QCU) => single

    if moodle_type in {"multichoice", "multichoiceset", "oumultiresponse"}:
        correct_count = sum(1 for ans in answers if ans.is_correct)
        if correct_count == 0:
            errors.append("Aucune bonne réponse identifiée.")
        elif moodle_type == "multichoice" and correct_count != 1:
            errors.append("La question à choix unique possède plusieurs bonnes réponses.")
        elif moodle_type != "multichoice" and correct_count < 1:
            errors.append("La question à choix multiple nécessite au moins une bonne réponse.")

    if moodle_type == "truefalse":
        # Détermination du booléen correct.
        tf_correct = _guess_truefalse_answer(answers, base_row)
        if tf_correct is None:
            errors.append("Impossible d'inférer la réponse Vrai/Faux.")
        else:
            answers = [
                Answer("true", tf_correct is True),
                Answer("false", tf_correct is False),
            ]
    elif moodle_type == "essay":
        answers = []

    return ParsedQuestion(
        reference=reference,
        title=title,
        question_text=question_text,
        raw_type=raw_type,
        moodle_type=moodle_type,
        defaultgrade=defaultgrade,
        answers=answers,
        single=single,
        shuffle=shuffle,
        errors=errors,
    )


def determine_moodle_type(
    cleaned_type: str,
    answers: List[Answer],
    options: Dict,
    has_points_column: bool = False,
) -> str:
    """Sélectionne le type Moodle en fonction du type détecté et des options."""
    if cleaned_type in {"ouinon", "truefalse", "vraifaux"}:
        return "truefalse"
    if cleaned_type in {"qcu", "choixunique", "singlechoice"}:
        return "multichoice"
    if cleaned_type in {
        "qcm",
        "choixmultiple",
        "multiplechoice",
        "multichoice",
        "toutourien",
        "allonothing",
    }:
        return determine_multichoice_variant(cleaned_type, answers, options, has_points_column)
    if cleaned_type in {"textelebre", "textelibre", "essay", "ouverte"}:
        return "essay"

    # Détection heuristique si le type est ambigu.
    correct_count = sum(1 for a in answers if a.is_correct)
    if correct_count <= 1:
        return "multichoice"
    return determine_multichoice_variant(cleaned_type, answers, options, has_points_column)


def determine_multichoice_variant(
    cleaned_type: str,
    answers: List[Answer],
    options: Dict,
    has_points_column: bool,
) -> str:
    """Retourne la variante adéquate pour le QCM."""
    mode = options.get("multichoice_mode", "auto")
    correct_count = sum(1 for a in answers if a.is_correct)

    if mode == "all_or_nothing":
        return "multichoiceset"
    if mode == "partial":
        return "oumultiresponse"

    if has_points_column and correct_count:
        return "oumultiresponse"
    # Mode automatique basé sur le libellé et le nombre de bonnes réponses.
    if "toutourien" in cleaned_type or "allonothing" in cleaned_type:
        return "multichoiceset"
    if "partial" in cleaned_type or "partiel" in cleaned_type:
        return "oumultiresponse"
    if correct_count <= 1:
        return "multichoice"
    return "multichoiceset"


def _guess_truefalse_answer(answers: List[Answer], base_row: pd.Series) -> Optional[bool]:
    """Tente de déterminer la bonne réponse pour une question Vrai/Faux."""
    for ans in answers:
        tf_value = norm_yn(ans.text)
        if ans.is_correct and tf_value is not None:
            return tf_value
    for field in ("solution", "answer", "acceptable"):
        value = base_row.get(field)
        tf_value = norm_yn(value)
        if tf_value is not None:
            return tf_value
    return None


def convert_questions_to_xml(questions: Iterable[ParsedQuestion]) -> bytes:
    """Génère le XML Moodle à partir de la liste de questions."""
    quiz = etree.Element("quiz")

    for question in questions:
        q_element = etree.SubElement(quiz, "question", type=question.moodle_type)
        # Nom de la question.
        name_el = etree.SubElement(q_element, "name")
        name_text = etree.SubElement(name_el, "text")
        name_text.text = question.title

        questiontext_el = etree.SubElement(q_element, "questiontext", format="html")
        questiontext_text = etree.SubElement(questiontext_el, "text")
        questiontext_text.text = create_cdata(question.question_text)

        generalfeedback_el = etree.SubElement(q_element, "generalfeedback", format="html")
        generalfeedback_text = etree.SubElement(generalfeedback_el, "text")
        generalfeedback_text.text = create_cdata("")

        etree.SubElement(q_element, "defaultgrade").text = question.defaultgrade or "0"
        etree.SubElement(q_element, "penalty").text = "0"
        etree.SubElement(q_element, "hidden").text = "0"

        if question.moodle_type in {"multichoice", "multichoiceset", "oumultiresponse"}:
            etree.SubElement(q_element, "single").text = "true" if question.single else "false"
            etree.SubElement(q_element, "shuffleanswers").text = "1" if question.shuffle else "0"
            etree.SubElement(q_element, "answernumbering").text = "abc"
            add_multichoice_answers(q_element, question)
        elif question.moodle_type == "truefalse":
            add_multichoice_answers(q_element, question)
        elif question.moodle_type == "essay":
            add_essay_settings(q_element)

    buffer = BytesIO()
    xml_bytes = etree.tostring(
        quiz,
        xml_declaration=True,
        encoding="UTF-8",
        pretty_print=True,
    )
    buffer.write(xml_bytes)
    return buffer.getvalue()


def add_multichoice_answers(q_element: etree.Element, question: ParsedQuestion) -> None:
    """Ajoute les balises <answer> pour les QCM et Vrai/Faux."""
    correct_count = sum(1 for ans in question.answers if ans.is_correct)
    fractions: List[str] = []

    if question.moodle_type == "oumultiresponse" and correct_count:
        fraction_value = 100 / correct_count
        fractions = [
            f"{fraction_value:.6f}".rstrip("0").rstrip(".") if ans.is_correct else "0"
            for ans in question.answers
        ]
    if not fractions:
        fractions = [
            "100" if ans.is_correct else "0"
            for ans in question.answers
        ]

    for ans, fraction in zip(question.answers, fractions):
        answer_el = etree.SubElement(q_element, "answer", fraction=fraction)
        text_el = etree.SubElement(answer_el, "text")
        text_el.text = create_cdata(ans.text)

        feedback_el = etree.SubElement(answer_el, "feedback", format="html")
        feedback_text = etree.SubElement(feedback_el, "text")
        feedback_text.text = create_cdata(ans.feedback)


def add_essay_settings(q_element: etree.Element) -> None:
    """Ajoute la configuration standard pour une question de type essai."""
    etree.SubElement(q_element, "responseformat").text = "editor"
    etree.SubElement(q_element, "responserequired").text = "1"
    etree.SubElement(q_element, "responsefieldlines").text = "15"
    etree.SubElement(q_element, "attachments").text = "0"
    graderinfo_el = etree.SubElement(q_element, "graderinfo", format="html")
    graderinfo_text = etree.SubElement(graderinfo_el, "text")
    graderinfo_text.text = create_cdata("")

    response_el = etree.SubElement(q_element, "responsetemplate", format="html")
    response_text = etree.SubElement(response_el, "text")
    response_text.text = create_cdata("")


