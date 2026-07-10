# CAP CLAIR DEV15.1.2 - TRACE DURABILITY AND NATIVE HARDENING

CAP CLAIR est une application VFR mobile-first en Vite, React, TypeScript, OpenLayers et Capacitor Android.

DEV15.1.2 consolide la base Android native validée en vol. Le filtrage GPS, l'orientation de l'avion et le vent à l'instant T sont conservés. Le bouton `Exporter PDF` reste volontairement inchangé pour une étape ultérieure.

## Ce que DEV15.1.2 apporte

### Journal GPS natif persistant

- chaque point natif est journalisé dans un fichier JSONL interne Android ;
- le buffer mémoire n'est plus la source de vérité ;
- une session possède un `sessionId`, un début, une fin, une route et une version de schéma ;
- une WebView recréée se rattache au service déjà actif sans effacer le journal ;
- une session interrompue ou arrêtée depuis la notification est récupérée au prochain lancement ;
- les traces Android récentes peuvent être restaurées même si le stockage WebView a été vidé ;
- la suppression volontaire d'une trace est répercutée dans le journal natif ;
- les anciens journaux sauvés sont nettoyés avec une rétention bornée.

### Arrêt et sauvegarde sécurisés

- récupération finale des points natifs avant arrêt ;
- état `Sauvegarde...` visible ;
- confirmation réelle de l'écriture locale avant l'état `Sauvé` ;
- en cas d'échec, l'interface indique que le journal natif reste récupérable ;
- aucun `clearBuffer()` automatique au démarrage React.

### GPX préparé pour le replay

- schéma de trace enrichi ;
- `sessionId`, source, dates de début/fin ;
- plusieurs `<trkseg>` après les coupures GPS supérieures à 12 secondes ;
- plus de ligne droite artificielle à travers une interruption GPS ;
- export JSON de secours conservé.

### GPS Android renforcé

- priorité au provider satellite GPS ;
- bascule automatique vers le meilleur provider disponible ;
- retour automatique au GPS satellite lorsqu'il redevient disponible ;
- aucun ancien `lastKnownLocation` injecté dans la trace ;
- aucune boussole : orientation selon le track sol GPS ou le relèvement calculé.

### Android et permissions

- demande de notification sur Android récent ;
- avertissement dans l'app si elle est refusée ;
- suppression de `ACCESS_BACKGROUND_LOCATION` non nécessaire ;
- suppression de la permission native `WAKE_LOCK` inutilisée ;
- suivi écran éteint conservé via foreground service de type `location`.

### Signature et CI

- signature CAP CLAIR obligatoire ;
- échec du build si un secret manque ;
- vérification de l'APK avec `apksigner` ;
- empreinte SHA-256 du certificat jointe à l'artifact ;
- caches npm et Gradle ;
- annulation des builds obsolètes ;
- artifact `cap-clair-dev15-1-2-debug-apk` conservé 7 jours.

### Séparation APK/PWA

- build Android dédié sans service worker ni `registerSW.js` ;
- build web/PWA classique toujours disponible avec `npm run build` ;
- dossier et dépendance iOS retirés de la branche APK ;
- écrans secondaires chargés à la demande pour alléger le bundle initial.

### Corrections fonctionnelles

- `Enregistrer le log` devient `Valider et passer au suivi` ;
- saisie altitude validée à la confirmation, bornée entre 500 et 12 500 ft ;
- libellés carburant corrigés : aucune fausse prétention de connaître le carburant réellement à bord ;
- vent conservé à l'instant T pour une navigation préparée en vue d'un départ immédiat ;
- caches météo/vent expirés nettoyés ;
- exports temporaires Android limités et nettoyés ;
- FileProvider limité au dossier d'export.

## Scripts

```bash
npm ci
npm test
npm run build
npm run build:android
npx cap sync android
```

## Build GitHub Actions

Le workflow `.github/workflows/android-debug-apk.yml` se lance sur les branches `dev15-*`.

Secrets obligatoires :

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Ne jamais régénérer la clé stable.

## Tests effectués avant livraison

- `npm ci --no-audit --no-fund`
- `npm test` : 5 tests passés
- `npm run build` : OK
- `npm run build:android` : OK, aucun service worker généré
- `npx cap sync android` : OK
- `npm audit --omit=dev` : 0 vulnérabilité

La compilation Gradle complète doit être validée par GitHub Actions, l'environnement de génération local ne pouvant pas résoudre `services.gradle.org`.

## Tests téléphone prioritaires

1. Installer DEV15.1.2 par-dessus DEV15.1.1.
2. Vérifier que les données existantes restent présentes.
3. Démarrer le GPS natif et accepter la notification.
4. Changer d'écran puis éteindre/rallumer l'écran.
5. Arrêter et sauvegarder.
6. Exporter GPX et JSON.
7. Vérifier qu'une coupure volontaire produit plusieurs segments GPX.
8. Forcer la fermeture de l'interface pendant une courte trace, rouvrir l'app et vérifier la reprise/récupération.
9. Vérifier dans les logs GitHub que l'empreinte SHA-256 reste identique à la version précédente signée stable.

## Étape suivante

DEV15.2 : replay GPX, curseur synchronisé, profil altitude et mode paysage.
