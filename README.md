# CAP CLAIR DEV15.2.0 - GPX REPLAY

CAP CLAIR est une application VFR mobile-first en Vite, React, TypeScript, OpenLayers et Capacitor Android.

DEV15.2.0 ajoute un module de Replay / Débrief aux traces sauvegardées, sans modifier le GPS natif, le filtrage, le mode TRK UP, le plein écran, la signature ni le stockage validé de DEV15.1.5.

## Replay et débrief

- ouverture directe d'une trace depuis `Mes traces` ;
- lecture, pause, retour au début et vitesses x1, x5, x10 et x20 ;
- déplacement manuel depuis le profil d'altitude ou le curseur temporel ;
- carte OpenAIP ou OACI 1/500k ;
- trace réelle ambre et route prévue cyan ;
- avion Evektor V4 orienté uniquement depuis la trajectoire ;
- heure, vitesse sol, altitude GPS, distance et écart à la route prévue ;
- portrait et paysage ;
- chronologie compressée : les coupures GPS ne créent ni attente ni fausse ligne droite.

## Route prévue

- un instantané minimal de la route est figé au démarrage du suivi ;
- modifier ensuite l'onglet `Planifier` ne change pas le débrief historique ;
- le champ `plannedRoute` est optionnel et conserve la compatibilité des anciennes traces ;
- les traces antérieures restent rejouables sans superposition de route ;
- la reprise d'une session native réutilise l'instantané temporaire lorsqu'il est disponible.

## Compatibilité et optimisation

- aucune nouvelle dépendance graphique ;
- profil SVG décimé selon la largeur disponible ;
- marqueur OpenLayers mis à jour impérativement à cadence limitée ;
- segmentation à 12 secondes et prise en charge des limites explicites ;
- vitesse et route recalculées uniquement en secours ;
- altitude legacy conservée si la précision verticale est inconnue ;
- distance des coupures exclue du débrief ;
- module Replay chargé à la demande.

## Version et identification du build

```text
applicationId fr.capclair.app
versionCode 15020
versionName 15.2.0
```

Le bandeau affiche :

```text
CAP CLAIR DEV15.2.0 - GPX REPLAY - build <hash court>
```

Le hash court provient du commit GitHub Actions. Il permet de vérifier immédiatement que l'appareil exécute bien l'APK du dernier run.

## Versionnement automatisé

```bash
npm run version:bump -- 15.2.1 "NOM DE VERSION"
npm run version:check
```

Le script met à jour :

- `package.json` ;
- `package-lock.json` ;
- `android/app/build.gradle` ;
- `src/app/version.ts` ;
- `index.html` ;
- le nom de l'artifact GitHub Actions.

## Scripts

```bash
npm ci
npm run version:check
npm test
npm run build:android
npx cap sync android
```

Le dossier `android/app/src/main/assets/public/` ne doit jamais être modifié manuellement. Il est produit uniquement par le build Vite natif puis `cap sync`.

## Livraison APK

1. Pousser le projet sur `main` dans `capclair-android`.
2. Attendre le dernier run vert `Android Debug APK`.
3. Télécharger uniquement l'artifact du dernier run : `cap-clair-dev15-2-0-debug-apk`.
4. Installer l'APK par-dessus DEV15.1.5. Le `versionCode 15020` autorise la mise à jour avec la même signature CI.
5. Vérifier dans le bandeau : `DEV15.2.0` et le hash court du commit attendu.
6. Si la version affichée ne correspond pas, ne pas déboguer le code : vérifier l'artifact et l'installation.

## Tests téléphone prioritaires

1. Ouvrir une ancienne trace et vérifier carte, lecture, curseur et profil.
2. Ouvrir une trace DEV15.2.0 et afficher/masquer la route prévue.
3. Tester OpenAIP puis OACI 1/500k pendant la lecture.
4. Tester x1, x5, x10, x20, pause, retour au début et déplacement manuel.
5. Faire pivoter le téléphone et vérifier le paysage sans perte de position.
6. Vérifier une coupure GPS : aucune ligne fictive et saut instantané avec message.
7. Enregistrer puis supprimer une trace et confirmer les comportements validés de DEV15.1.5.
8. Vérifier le plein écran Suivi et NORD UP / TRK UP.
9. Vérifier que l'empreinte SHA-256 de `apk-signature.txt` reste inchangée.
