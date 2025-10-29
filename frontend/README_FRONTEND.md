# Frontend – React + Vite + Tailwind

Interface utilisateur permettant d’uploader des exports Odoo, consulter l’aperçu puis télécharger les XML Moodle.

## Installation

```bash
cd odoo2moodle/frontend
npm install
```

## Développement

```bash
npm run dev
```

Un serveur de développement Vite se lance sur `http://localhost:5173` avec un proxy vers `http://localhost:8000` pour les appels API.

## Build de production

```bash
npm run build
npm run preview
```

## Fonctionnalités clés

- Gestion de l’import multi-fichiers (limite 50 fichiers).
- Contrôles de taille (50 MB par fichier, 200 MB cumulés).
- Paramétrage du mode de conversion QCM.
- Aperçu des questions avant conversion.
- Téléchargement automatique du ZIP Moodle.
