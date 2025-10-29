# Odoo → Moodle – Convertisseur Web

Application complète (FastAPI + React) pour transformer des exports Excel Odoo en fichiers XML Moodle.

## Structure du projet

```
odoo2moodle/
├─ backend/             # API FastAPI + logique de conversion
├─ frontend/            # Interface React + Tailwind
└─ README.md            # Ce document
```

## Installation rapide

### Backend

```bash
cd odoo2moodle/backend
python -m venv .venv
.venv\Scripts\activate  # Windows
pip install -r requirements.txt
uvicorn backend.main:app --reload
```

### Frontend

```bash
cd odoo2moodle/frontend
npm install
npm run dev
```

Le front écoute sur `http://localhost:5173` et proxifie les appels `/api` vers `http://localhost:8000`.

## Fonctionnement

- Upload multi-fichiers (max 50).
- Conversion 1 Excel → 1 XML Moodle.
- Export ZIP avec tous les XML.
- Aperçu JSON des questions avant conversion.
- Pas de stockage persistant : tout est traité en mémoire.

## Exemple de scénarios de test

1. Lancer l’API, démarrer le frontend et importer `backend/samples/SAMPLE_EXCEL.xlsx`.
2. Vérifier que l’aperçu liste toutes les questions avec le type détecté.
3. Convertir et vérifier le ZIP téléchargé.

## Exemples XML générés

### Exemple multichoiceset (Tout ou rien)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="multichoiceset">
    <name>
      <text>QCM Laboratoire</text>
    </name>
    <questiontext format="html">
      <text><![CDATA[<p>Quels équipements de protection sont obligatoires&nbsp;?</p>]]></text>
    </questiontext>
    <defaultgrade>3</defaultgrade>
    <answer fraction="100">
      <text><![CDATA[Gants anti-coupure]]></text>
    </answer>
    <answer fraction="0">
      <text><![CDATA[Chaussures ouvertes]]></text>
    </answer>
    <answer fraction="100">
      <text><![CDATA[Lunettes de sécurité]]></text>
    </answer>
  </question>
</quiz>
```

### Exemple oumultiresponse (Points partiels)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="oumultiresponse">
    <name>
      <text>QCM Réseau</text>
    </name>
    <questiontext format="html">
      <text><![CDATA[<p>Quelles affirmations décrivent IPv6&nbsp;?</p>]]></text>
    </questiontext>
    <defaultgrade>4</defaultgrade>
    <answer fraction="50">
      <text><![CDATA[Adresse sur 128 bits]]></text>
    </answer>
    <answer fraction="0">
      <text><![CDATA[Utilise des adresses MAC uniquement]]></text>
    </answer>
    <answer fraction="50">
      <text><![CDATA[Supporte l’auto-configuration]]></text>
    </answer>
  </question>
</quiz>
```

## Générer sa propre archive d’exemple

Un fichier `SAMPLE_EXCEL.xlsx` (3 questions types) est fourni dans `backend/samples/`. Pour créer vos propres échantillons :

1. Exportez un examen depuis Odoo au format Excel.
2. Vérifiez que les colonnes essentielles existent (Référence, Question, Type).
3. Complétez les colonnes de réponses et d’indication de justesse.

## Déploiement (piste rapide)

- Uvicorn derrière Nginx (reverse proxy) avec une directive `client_max_body_size 200M;`.
- Build du frontend (`npm run build`) et hébergement statique (Nginx ou CDN).
- Variables à exposer : `MAX_FILES` (backend) et limites côté front selon vos besoins.
