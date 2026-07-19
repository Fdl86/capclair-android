# CAP CLAIR DEV15.4.1 - SUP AIP LOCAL DATABASE

Application VFR mobile-first construite avec Vite, React, TypeScript, OpenLayers et Capacitor Android.

DEV15.4.1 consolide l'espace Briefing introduit en DEV15.4.0. L'application utilise désormais le pipeline SUP AIP versionné de WEB13.30.4, vérifie chaque fichier avant activation et conserve une base locale complète utilisable hors ligne.

## Briefing aéronautique

L'espace Briefing fournit :

- import local d'un PIB SOFIA ;
- analyse et classement des NOTAM ;
- liste, détails et carte des SUP AIP ;
- accès aux PDF officiels SIA ;
- mise en évidence des éléments sélectionnés ;
- carte indépendante du GPS, du Suivi et du Replay.

Toutes les SUP AIP restent affichées sans filtrage vertical. Les limites plancher et plafond sont indiquées, ou le message `Limites verticales non extraites - consulter le PDF SIA` est utilisé.

## Base SUP AIP locale

L'application consulte `latest.json`, vérifie le manifeste et les fichiers immuables par taille et SHA-256, puis installe la nouvelle révision dans IndexedDB en une transaction.

Trois niveaux de secours sont disponibles :

- base locale active ;
- base locale précédente ;
- base complète embarquée dans l'APK.

Une révision inchangée ne provoque pas le retéléchargement du GeoJSON complet. Seules les informations de fraîcheur sont actualisées.

## Fonctions conservées

DEV15.4.1 conserve les fonctions validées de DEV15.3.3 et DEV15.4.0 :

- GPS écran éteint ;
- Suivi ;
- enregistrement et récupération des traces ;
- Replay et relief ;
- PDF Log nav ;
- profils et réglages ;
- mise à jour semi-automatique Android ;
- conservation des données après mise à jour.

## Version

- versionName : 15.4.1
- versionCode : 1504001
- APP_VERSION : CAP CLAIR DEV15.4.1 - SUP AIP LOCAL DATABASE
- artifact : cap-clair-dev15-4-1-release-apk
- tag Release : android-v15.4.1

Consulter `LIVRAISON_DEV15.4.1.txt`, `docs/SUP_AIP_LOCAL_DATABASE_DEV15.4.1.md` et `docs/ANDROID_BRIEFING_DEV15.4.0.md`.
