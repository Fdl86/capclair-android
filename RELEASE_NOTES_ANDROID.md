# CAP CLAIR DEV15.4.0

- Nouvel espace Briefing aéronautique accessible depuis Plus.
- Import local des PDF PIB SOFIA et analyse du texte sans envoi serveur ni OCR.
- Liste, recherche, filtres et détails des NOTAM pertinents pour la navigation.
- Base SUP AIP complète avec 107 publications et 404 géométries embarquées en secours.
- Contrôle automatique de la base serveur au lancement, au retour en ligne, au retour au premier plan et toutes les 30 minutes hors activité GPS sensible.
- Téléchargement de la base complète uniquement lorsqu'une nouvelle révision serveur est disponible.
- Validation croisée du statut, du manifeste, des publications incomplètes et du GeoJSON avant activation.
- Cache IndexedDB transactionnel protégé par une empreinte SHA-256 et conservation de la dernière base valide.
- Avertissement visible lorsque la dernière génération serveur dépasse le seuil de 36 heures.
- Toutes les SUP AIP restent visibles sur la carte, sans filtre vertical et sans mode OFF.
- Affichage systématique du plancher et du plafond, ou du message "Limites verticales non extraites - consulter le PDF SIA".
- Accès direct aux PDF officiels SIA dans le navigateur Android.
- Carte Briefing indépendante du GPS, du Suivi, des traces, du Replay et du relief.
- Aucun changement fonctionnel du GPS, du Suivi, des traces, du Replay, du relief, du PDF Log nav ou de l'auto-update.
