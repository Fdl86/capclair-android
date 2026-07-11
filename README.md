# CAP CLAIR DEV15.1.5 - TRACE STORAGE HOTFIX

CAP CLAIR est une application VFR mobile-first en Vite, React, TypeScript, OpenLayers et Capacitor Android.

DEV15.1.5 corrige deux anomalies ciblées de la DEV15.1.4 sans modifier le GPS natif, le filtrage, le mode TRK UP ni le plein écran.

## Correctifs DEV15.1.5

### Suppression de la dernière trace

- une liste vide est maintenant un état valide et est écrite explicitement dans `capclair.traces` ;
- la dernière trace peut être supprimée comme les autres ;
- la suppression du journal natif est attendue et confirmée avant mise à jour de l'interface ;
- une erreur native conserve la trace visible pour éviter sa réapparition au lancement suivant ;
- la suppression native est idempotente si le journal a déjà disparu ;
- la boîte de dialogue affiche `Suppression...` et bloque les doubles validations.

### Arrêt sans trace exploitable

- zéro ou un seul point ne déclenche plus une fausse erreur de sauvegarde ;
- le bouton devient `Arrêter le GPS` tant que deux points valides ne sont pas disponibles ;
- l'arrêt affiche un message neutre : `Suivi arrêté - trace trop courte, aucune trace enregistrée.` ;
- le petit journal natif incomplet est nettoyé ;
- à partir de deux points, le comportement reste `Arrêter et sauvegarder`.

## Version et identification du build

```text
applicationId fr.capclair.app
versionCode 15015
versionName 15.1.5
```

Le bandeau affiche :

```text
CAP CLAIR DEV15.1.5 - TRACE STORAGE HOTFIX - build <hash court>
```

Le hash court provient du commit GitHub Actions. Il permet de vérifier immédiatement que l'appareil exécute bien l'APK du dernier run.

## Versionnement automatisé

```bash
npm run version:bump -- 15.1.6 "NOM DE VERSION"
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
3. Télécharger uniquement l'artifact du dernier run : `cap-clair-dev15-1-5-debug-apk`.
4. Installer l'APK par-dessus DEV15.1.4. Le `versionCode 15015` autorise la mise à jour avec la même signature CI.
5. Vérifier dans le bandeau : `DEV15.1.5` et le hash court du commit attendu.
6. Si la version affichée ne correspond pas, ne pas déboguer le code : vérifier l'artifact et l'installation.

## Tests téléphone prioritaires

1. Avec une seule trace enregistrée, la supprimer et vérifier l'état `Aucune trace sauvegardée`.
2. Fermer puis rouvrir l'application et vérifier que la trace supprimée ne réapparaît pas.
3. Démarrer le GPS puis l'arrêter avant deux points : aucun message d'erreur de sauvegarde.
4. Vérifier le message neutre de trace trop courte.
5. Enregistrer au moins deux points, arrêter et vérifier la sauvegarde normale.
6. Vérifier que le plein écran et le mode NORD UP / TRK UP de DEV15.1.4 restent fonctionnels.
7. Vérifier que l'empreinte SHA-256 de `apk-signature.txt` reste inchangée.
