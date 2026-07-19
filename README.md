# CAP CLAIR DEV15.3.1 - REPLAY TERRAIN

Application VFR mobile-first Vite, React, TypeScript, OpenLayers et Capacitor Android.

DEV15.3.1 ajoute le profil du relief aux traces existantes et sert de première mise à jour réelle distribuée par le système semi-automatique introduit en DEV15.3.0.

## Relief dans le Replay

À l'ouverture d'une trace, CAP CLAIR peut désormais :

- calculer le profil du relief sous la trajectoire à partir des coordonnées enregistrées ;
- enrichir les traces CAP CLAIR déjà présentes et les GPX importés ;
- superposer le terrain et l'altitude GPS dans la frise verticale ;
- afficher l'altitude terrain et la hauteur sol estimée au point courant ;
- masquer ou afficher le relief ;
- conserver le profil en cache pour les ouvertures suivantes et l'usage hors connexion.

Le relief est calculé uniquement dans le Replay, après le vol. Aucun appel réseau n'est effectué pendant l'enregistrement GPS.

## Source du relief

- service : Open-Meteo Elevation API ;
- modèle numérique : Copernicus DEM GLO-90 ;
- résolution annoncée : 90 m ;
- maximum CAP CLAIR : 180 échantillons par trace ;
- requêtes découpées par lots de 100 coordonnées maximum.

Le relief et la hauteur sol sont des estimations non réglementaires. Ils ne comprennent pas les obstacles, bâtiments, arbres ou antennes.

## Mise à jour Android

Dans l'écran `Plus`, CAP CLAIR :

- effectue une vérification automatique une seule fois par lancement lorsque l'écran est ouvert ;
- permet une vérification manuelle à tout moment ;
- affiche la version installée, la version disponible, la taille de l'APK et le changelog ;
- télécharge l'APK avec le DownloadManager Android ;
- vérifie le SHA-256, le package, le versionCode et la signature Android ;
- ouvre l'installateur système sans installation silencieuse.

## Protections

- package attendu : `fr.capclair.app` ;
- certificat SHA-256 épinglé dans le code natif ;
- refus d'une version identique ou plus ancienne ;
- refus d'un APK corrompu, mal signé ou associé à un autre package ;
- mise à jour interdite pendant le GPS, la finalisation ou récupération d'une trace et l'export PDF.

## Invariants

Le moteur GPS, le Suivi, la collecte des positions, le stockage natif des traces et le PDF Log nav ne sont pas modifiés. Le relief est une couche de lecture du Replay uniquement.

## Version

- versionName : 15.3.1
- versionCode : 1503001
- APP_VERSION : CAP CLAIR DEV15.3.1 - REPLAY TERRAIN
- artifact : cap-clair-dev15-3-1-release-apk
- tag Release : android-v15.3.1

Consulter `LIVRAISON_DEV15.3.1.txt`, `docs/REPLAY_TERRAIN_DEV15.3.1.md` et `docs/AUTO_UPDATE_DEV15.3.0.md`.
