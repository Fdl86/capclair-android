# CAP CLAIR DEV15.2.15 - NAV LOG UI HOTFIX

## Objet

Correction des incohérences de données et des petits défauts UI relevés dans la planification et le log de navigation.

## Corrections

- La TAS de calcul suit toujours le profil avion actif.
- La TAS n'est plus modifiable séparément dans le log.
- L'altitude par défaut est saisie directement en pieds ou au format FL.
- Les altitudes de branche sont de vraies exceptions au réglage général.
- Le bouton d'application globale efface les exceptions de branche.
- Les fréquences fictives du constructeur de route sont supprimées.
- Une navigation vide n'affiche plus de fausse vitesse sol.
- Le vent mémorisé est signalé correctement après redémarrage.
- Les codes aérodromes invalides ne restent plus affichés.
- Nouvelle nav demande confirmation et efface aussi le dégagement.
- Les champs numériques avion et carburant sont validés à la sortie du champ.
- Les profils avion peuvent être supprimés, sauf le dernier.
- Les traces longues sont affichées en heures et minutes.
- Le texte sur le GPS écran éteint est actualisé.
- La limite de huit branches du PDF est annoncée avant export.

## Contrôles effectués

- `npm run version:check`
- `npm test` : 111 tests réussis
- `npm run build:android`
- absence de service worker dans le build natif
- `npx cap sync android`
- présence des fichiers Gradle générés par Capacitor
- contrôle des versions dans package.json, package-lock.json, build.gradle, index.html et APP_VERSION
- contrôle du nom d'artifact GitHub Actions
- comparaison SHA-256 des sources GPS et Trace avec DEV15.2.14

## Contrôle restant sur GitHub Actions

Le test `./gradlew testDebugUnitTest` doit être exécuté par GitHub Actions. L'environnement local n'a pas pu télécharger Gradle depuis `services.gradle.org`.
