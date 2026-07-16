# CI sync order hotfix DEV15.2.14

## Cause

Le workflow lançait `./gradlew testDebugUnitTest` avant `npx cap sync android`. Le script Gradle généré `android/capacitor-cordova-android-plugins/cordova.variables.gradle` n'existait donc pas encore sur le runner propre.

## Ordre corrigé

1. installation npm ;
2. tests Vitest ;
3. build Android des assets web ;
4. synchronisation Capacitor Android ;
5. contrôle des fichiers Gradle générés ;
6. tests Android natifs ;
7. compilation et signature de l'APK.

## Portée

Aucun changement du service GPS, de la récupération écran éteint, des traces, du Replay ou du PDF.
