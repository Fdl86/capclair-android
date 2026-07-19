# CAP CLAIR DEV15.3.0

- Ajout de la vérification des nouvelles versions Android depuis les GitHub Releases publiques de CAP CLAIR.
- Affichage de la version installée, de la version disponible, de la taille de l’APK et des notes de mise à jour.
- Téléchargement natif avec progression, reprise après retour dans l’application et nettoyage des fichiers interrompus.
- Vérification locale du SHA-256, du package fr.capclair.app, du versionCode et de la signature Android CAP CLAIR.
- Refus automatique des versions identiques, plus anciennes, corrompues ou signées avec un autre certificat.
- Blocage de la mise à jour pendant le GPS, la finalisation ou récupération d’une trace et l’export PDF.
- Ouverture de l’installateur Android uniquement après confirmation et autorisation explicites de l’utilisateur.
- Publication automatique d’une GitHub Release immuable après un build entièrement vert.
