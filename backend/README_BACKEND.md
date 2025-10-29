# Backend – API FastAPI

Cette API transforme les fichiers Excel exportés d’Odoo en XML compatibles Moodle.

## Installation

```bash
cd odoo2moodle/backend
python -m venv .venv
.venv\Scripts\activate  # Sous Windows
pip install -r requirements.txt
```

## Lancement du serveur

```bash
uvicorn backend.main:app --reload
```

Le serveur écoute par défaut sur `http://127.0.0.1:8000`.

## Endpoints

- `POST /api/preview` : retourne un aperçu JSON des questions détectées dans les fichiers (1 à 50 fichiers par requête).  
- `POST /api/convert` : renvoie une archive ZIP contenant un XML Moodle par fichier Excel.

### Paramètres communs

- `files`: tableau `files[]` de fichiers Excel (`.xlsx`).  
- `multichoice_mode`: stratégie QCM (`auto`, `all_or_nothing`, `partial`).

### Limites imposées

- 50 fichiers maximum par requête.
- 50 MB maximum par fichier.
- 200 MB maximum par requête.

Les limites sont vérifiées côté backend et frontend.

## Exemple de réponse `/api/preview`

```json
{
  "files": [
    {
      "file": "Examen1.xlsx",
      "status": "ok",
      "questions": [
        {
          "reference": "Q1",
          "name": "Capitales européennes",
          "detected_type": "multichoice",
          "raw_type": "QCU",
          "answers_count": 4,
          "points": "2",
          "errors": []
        }
      ],
      "errors": []
    }
  ]
}
```

## Exemple d’erreur JSON

```json
{
  "detail": "Limite dépassée : maximum 50 fichiers par requête."
}
```

## Structure de conversion

- Le XML final respecte la structure `<quiz>` de Moodle.
- Les questions QCM sont exportées selon le mode demandé (multichoice, multichoiceset, oumultiresponse).
- Les sections `<questiontext>` et `<feedback>` sont encapsulées en CDATA.

## Échantillon Excel

Un fichier de démonstration `backend/samples/SAMPLE_EXCEL.xlsx` est fourni pour tester la conversion.
