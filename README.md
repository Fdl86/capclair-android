# CAP CLAIR DEV15.1.3 - COCKPIT MAP MODES

CAP CLAIR est une application VFR mobile-first en Vite, React, TypeScript, OpenLayers et Capacitor Android.

DEV15.1.3 repart de la base Android DEV15.1.2 validée et signée. Cette version ajoute deux fonctions cockpit ciblées : la carte en mode trajectoire en haut et le mode Suivi plein écran avec bandeau inférieur.

## Nouveautés DEV15.1.3

### Carte Nord en haut / Trajectoire en haut

- bouton de bascule directement sur la carte ;
- mode `NORD UP` : nord fixe en haut, avion orienté selon le track GPS ;
- mode `TRK UP` : avion dirigé vers le haut et carte tournée autour de lui ;
- aucune boussole ni magnétomètre utilisé ;
- rotation basée uniquement sur le track sol GPS ou le relèvement calculé ;
- dernière orientation fiable conservée à faible vitesse ;
- rotation lissée et trajet angulaire le plus court ;
- choix mémorisé entre les ouvertures de l'application.

### Suivi plein écran

- bouton visible pour entrer et quitter le plein écran applicatif ;
- aucune dépendance au bouton Retour Android ;
- compatible avec la navigation Xiaomi par gestes ;
- carte occupant tout l'écran en portrait ou paysage ;
- commandes permanentes : plein écran, centrage, orientation, zoom + et zoom - ;
- bandeau cockpit inférieur avec prochain point, distance, cap magnétique, vitesse sol, altitude GPS et ETA ;
- petits indicateurs supérieurs pour CAP CLAIR, état GPS et mode d'orientation ;
- état de zoom, centrage et orientation conservé en quittant le plein écran.

### Base DEV15.1.2 conservée

- GPS natif Android et foreground service ;
- journal GPS persistant et restauration de session ;
- récupération finale avant sauvegarde ;
- export GPX multi-segments et JSON ;
- signature stable obligatoire ;
- build Android sans service worker ;
- vent à l'instant T ;
- bouton `Exporter PDF` conservé pour l'étape suivante.

## Version Android

```text
applicationId fr.capclair.app
versionCode 15013
versionName 15.1.3
```

## Scripts

```bash
npm ci
npm test
npm run build
npm run build:android
npx cap sync android
```

## Build GitHub Actions

Le workflow `.github/workflows/android-debug-apk.yml` se lance sur la branche `main` du dépôt `capclair-android`.

Secrets obligatoires :

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Ne jamais régénérer la clé stable.

## Vérifications effectuées avant livraison

- `npm ci --no-audit --no-fund` : OK ;
- `npm test` : 8 tests sur 8 réussis ;
- `npm run build:android` : OK ;
- aucun service worker dans les assets Android : OK ;
- `npx cap sync android` : OK ;
- `npm audit --omit=dev` : 0 vulnérabilité ;
- compilation Gradle complète à valider dans GitHub Actions, le réseau local ne pouvant pas joindre `services.gradle.org`.

## Tests téléphone prioritaires

1. Installer DEV15.1.3 par-dessus DEV15.1.2.
2. Vérifier que la version 15.1.3 est affichée.
3. Lancer une simulation puis basculer entre `NORD UP` et `TRK UP`.
4. Vérifier que l'avion reste vers le haut en `TRK UP` et que la carte pivote sans tour complet parasite.
5. Tester le bouton de centrage dans les deux modes.
6. Entrer et sortir du mode plein écran uniquement avec le bouton visible.
7. Vérifier le bandeau inférieur en portrait puis en paysage.
8. Démarrer une vraie trace courte et confirmer que l'enregistrement, la sauvegarde et l'export restent fonctionnels.
9. Vérifier dans `apk-signature.txt` que l'empreinte SHA-256 reste inchangée.

## Étape suivante

Export PDF du log de navigation, puis replay GPX avec profil altitude synchronisé.
