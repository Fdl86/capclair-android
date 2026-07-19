# DEV15.4.1 - SUP AIP Local Database

## Objectif

DEV15.4.1 raccorde l'application Android au pipeline versionné publié par WEB13.30.4. Le serveur reste responsable de l'extraction et de la validation des publications SIA. L'appareil conserve ensuite sa propre copie complète et utilisable hors ligne.

## Contrat serveur

L'application consulte d'abord `data/supaip/latest.json`. Ce pointeur fournit la révision active, les dates de fraîcheur, l'URL du manifeste immuable, sa taille et son SHA-256.

Chaque révision contient :

- `manifest.json` ;
- `status.json` ;
- `data.geojson` ;
- `unmapped.json`.

Une révision n'est activée qu'après validation de tous ces fichiers.

## Stockage local

IndexedDB contient deux emplacements durables :

- `active` pour la dernière base validée ;
- `previous` pour la base valide précédente.

La base complète embarquée dans l'APK reste le dernier secours. Au démarrage, une base active corrompue est rejetée. L'application tente alors de restaurer `previous`, puis utilise la base embarquée si nécessaire.

## Mise à jour transactionnelle

Lorsqu'une nouvelle révision est disponible :

1. téléchargement et contrôle du manifeste ;
2. téléchargement des trois fichiers de données ;
3. vérification des tailles et SHA-256 ;
4. validation des révisions, compteurs, géométries, limites verticales et PDF officiels ;
5. déplacement logique de l'ancienne base active vers `previous` ;
6. activation de la nouvelle base dans la même transaction IndexedDB.

Une erreur avant la fin de la transaction laisse la base active inchangée.

## Révision inchangée

Si `datasetRevision` est identique et que la base locale a déjà été validée avec le même manifeste, l'application ne retélécharge pas le GeoJSON. Elle actualise uniquement :

- `lastSuccessfulCheckAt` ;
- la date de dernière vérification effectuée par l'appareil.

## Transport Android

Le plugin `NativeSupAipDataPlugin` télécharge les fichiers SUP AIP sans transformer leur contenu. Il est limité :

- au protocole HTTPS ;
- au domaine `capclair.pages.dev` ;
- aux chemins de données SUP AIP ;
- à une taille maximale ;
- sans redirection automatique.

Cette lecture brute est nécessaire pour calculer les SHA-256 sur les octets réellement reçus.

## Invariants

DEV15.4.1 ne modifie pas le moteur GPS, le Suivi, le stockage des traces, le Replay, le relief, l'export PDF ou l'auto-update. Le seul changement natif est l'enregistrement du plugin SUP AIP dédié dans `MainActivity`.
