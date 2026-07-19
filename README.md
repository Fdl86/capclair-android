# CAP CLAIR DEV15.3.2 - AUTO UPDATE BRIDGE HOTFIX

Application VFR mobile-first Vite, React, TypeScript, OpenLayers et Capacitor Android.

DEV15.3.2 conserve intégralement le relief du Replay ajouté en DEV15.3.1 et corrige la transmission du `versionCode` entre TypeScript et le plugin Android de mise à jour.

## Correctif de mise à jour

La détection d'une nouvelle Release fonctionnait, mais le téléchargement était refusé avec le message `versionCode de mise à jour invalide`.

Le pont Capacitor transmet les nombres JavaScript sous une forme numérique qui n'était pas récupérée correctement par `PluginCall.getLong()`. Le plugin utilise désormais le convertisseur numérique robuste déjà employé par le GPS.

Le `versionCode` est accepté sous les formes suivantes :

- entier Java ;
- nombre JavaScript représenté en décimal ;
- chaîne numérique.

Une valeur absente, négative ou non numérique reste refusée.

## Relief dans le Replay

CAP CLAIR conserve toutes les fonctions de DEV15.3.1 :

- profil du relief sous les traces CAP CLAIR existantes ;
- prise en charge des GPX importés ;
- altitude terrain et hauteur sol estimée ;
- cache local et réouverture hors connexion ;
- aucun appel réseau pendant l'enregistrement GPS.

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

Le moteur GPS, le Suivi, la collecte des positions, le stockage natif des traces et le PDF Log nav ne sont pas modifiés.

## Version

- versionName : 15.3.2
- versionCode : 1503002
- APP_VERSION : CAP CLAIR DEV15.3.2 - AUTO UPDATE BRIDGE HOTFIX
- artifact : cap-clair-dev15-3-2-release-apk
- tag Release : android-v15.3.2

Consulter `LIVRAISON_DEV15.3.2.txt`, `docs/AUTO_UPDATE_BRIDGE_HOTFIX_DEV15.3.2.md`, `docs/REPLAY_TERRAIN_DEV15.3.1.md` et `docs/AUTO_UPDATE_DEV15.3.0.md`.
