# CAP CLAIR DEV15.2.14 - CI SYNC ORDER HOTFIX

Application VFR mobile-first Vite, React, TypeScript, OpenLayers et Capacitor Android.

Cette version corrige le défaut observé sur Xiaomi avec écran éteint : les positions ponctuelles du watchdog étaient prises pour une reprise du flux GPS continu. Le service restait alors en boucle de récupération légère et ne déclenchait jamais les niveaux de récupération complets.

## Correction principale

Le service Android distingue désormais :

- le dernier point reçu, quelle que soit sa source ;
- le dernier point du flux GPS continu ;
- le dernier point ponctuel de secours ;
- le dernier flux continu réellement confirmé.

Une position ponctuelle est enregistrée dans le journal, mais elle ne remet jamais la récupération à zéro. Le flux n'est déclaré rétabli qu'après trois positions continues rapprochées.

## Récupération écran éteint

En cas de perte du flux continu :

1. état dégradé détecté après 15 secondes ;
2. réinscription du listener après 30 secondes ;
3. reconstruction du thread, du LocationManager, du listener et du callback GNSS après 60 secondes ;
4. recyclage complet du runtime GPS natif après 120 secondes ;
5. positions ponctuelles de secours toutes les 5 secondes, puis toutes les 10 secondes si la panne persiste.

Le même sessionId, le même journal natif et la même route prévue sont conservés pendant toute la récupération.

## Protections

- un probe ne peut plus simuler une reprise ;
- trois callbacks continus sont obligatoires pour revenir à l'état sain ;
- les anciens callbacks de probe sont ignorés grâce à un numéro de génération ;
- un seul probe est actif à la fois ;
- aucune action supplémentaire n'est exécutée tant que le flux normal est sain ;
- les points du journal indiquent désormais leur source : continuous ou probe ;
- les diagnostics distinguent flux continu, secours ponctuel, dégradation et récupération réelle.

## Correctif de build GitHub Actions

Le code GPS de DEV15.2.13 est inchangé. Le workflow exécute désormais le build web natif et `npx cap sync android` avant les tests Gradle Android, afin de générer `android/capacitor-cordova-android-plugins/cordova.variables.gradle` avant toute configuration Gradle.

## Version

- versionName : 15.2.14
- versionCode : 1502014
- APP_VERSION : CAP CLAIR DEV15.2.14 - CI SYNC ORDER HOTFIX
- artifact : cap-clair-dev15-2-14-debug-apk

Consulter `LIVRAISON_DEV15.2.14.txt`.
