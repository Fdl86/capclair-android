# CAP CLAIR DEV15.3.0 - AUTO UPDATE

Application VFR mobile-first Vite, React, TypeScript, OpenLayers et Capacitor Android.

DEV15.3.0 ajoute un système de mise à jour Android semi-automatique à la base stable DEV15.2.15.

## Mise à jour Android

Dans l'écran `Plus`, CAP CLAIR peut désormais :

- vérifier la dernière version publiée sur le dépôt public `Fdl86/capclair-android` ;
- afficher la version installée, la version disponible, la taille de l'APK et le changelog ;
- télécharger l'APK avec le DownloadManager Android ;
- reprendre l'affichage d'un téléchargement après retour dans l'application ;
- supprimer les téléchargements échoués, interrompus ou trop anciens ;
- vérifier le SHA-256, le package, le versionCode et la signature Android ;
- ouvrir l'installateur système sans jamais confirmer l'installation à la place de l'utilisateur.

## Protections

- package attendu : `fr.capclair.app` ;
- certificat SHA-256 épinglé dans le code natif ;
- refus d'une version identique ou plus ancienne ;
- refus d'un APK corrompu, mal signé ou associé à un autre package ;
- nouvelle vérification complète juste avant l'ouverture de l'installateur ;
- aucune installation silencieuse ;
- aucun accès général au stockage Android ;
- téléchargement interdit pendant le GPS, la finalisation ou récupération d'une trace et l'export PDF ;
- démarrage GPS et export PDF bloqués pendant un téléchargement ou une vérification APK.

## Publication GitHub Release

Le workflow GitHub Actions :

1. vérifie les versions et exécute les tests ;
2. lance `npm run build:android` puis `npx cap sync android` ;
3. exécute les tests Gradle Android ;
4. produit un APK `release` signé avec la clé CAP CLAIR actuelle ;
5. vérifie package, versionCode, versionName et certificat ;
6. génère `update.json`, `SHA256SUMS.txt`, `CHANGELOG.md` et `apk-signature.txt` ;
7. publie une GitHub Release immuable uniquement après un build entièrement vert.

## Invariants

Le moteur GPS, le Suivi, la collecte des positions, le Replay, le stockage des traces et le PDF Log nav ne sont pas modifiés. Seuls des verrous d'activité globaux empêchent leur lancement simultané avec une opération de mise à jour.

## Version

- versionName : 15.3.0
- versionCode : 1503000
- APP_VERSION : CAP CLAIR DEV15.3.0 - AUTO UPDATE
- artifact : cap-clair-dev15-3-0-release-apk
- tag Release : android-v15.3.0

Consulter `LIVRAISON_DEV15.3.0.txt` et `docs/AUTO_UPDATE_DEV15.3.0.md`.
