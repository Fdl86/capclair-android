# CAP CLAIR DEV15.2.1 - REPLAY UX

CAP CLAIR est une application VFR mobile-first en Vite, React, TypeScript, OpenLayers et Capacitor Android.

DEV15.2.1 améliore l'ergonomie du Replay, verrouille correctement les orientations de carte, facilite la création des routes et ajoute une localisation GPS ponctuelle pour le bouton Centrer, sans démarrer le service de suivi ni créer de trace.

## Replay

- bouton `Replay` depuis `Mes traces` ;
- suivi de l'avion activé par défaut ;
- lecture et pause directement sur la carte ;
- temps courant, durée totale et retour au début dans une commande compacte ;
- suppression du curseur temporel redondant ;
- déplacement manuel conservé sur le profil d'altitude ;
- vitesses x1, x5, x10 et x20 ;
- carte plus grande en portrait et en paysage ;
- profil d'altitude plus compact ;
- écart à la route affiché uniquement sur la carte ;
- Replay verrouillé en nord en haut ;
- route prévue cyan, trace réelle ambre et coupures GPS conservées.

## Planification et cartes

- écran Planifier verrouillé à 0 degré ;
- mode Suivi TRK UP conservé indépendamment lors des changements d'écran ;
- rotation tactile désactivée en TRK UP ;
- rotation tactile autorisée en NORD UP dans Suivi ;
- bouton flottant `+ Point` sur la carte ;
- ajout continu de plusieurs points jusqu'au bouton `Terminer` ;
- suppression des points toujours disponible dans la liste ;
- altitude par défaut réglable par pas de 100 ft ;
- bouton Imprimer supprimé ;
- bouton Exporter PDF conservé pour le futur module dédié.

## Localisation ponctuelle

- le bouton Centrer utilise une position récente si elle existe ;
- en suivi actif, la position courante est réutilisée ;
- sinon, une acquisition Android native ponctuelle est demandée ;
- aucun service de suivi n'est lancé ;
- aucune session, aucun point de trace et aucune notification persistante ne sont créés ;
- repli web disponible hors Android natif ;
- délai maximal et message d'erreur gérés dans la carte.

## Compatibilité et sécurité

- stockage des traces existant inchangé ;
- exports GPX et JSON inchangés ;
- service Android de suivi en arrière-plan inchangé ;
- signature et workflow GitHub Actions conservés ;
- anciennes traces compatibles ;
- aucune nouvelle dépendance graphique lourde ;
- aucun service worker dans le build Android.

## Version et identification du build

```text
applicationId fr.capclair.app
versionCode 15021
versionName 15.2.1
```

Le bandeau affiche :

```text
CAP CLAIR DEV15.2.1 - REPLAY UX - build <hash court>
```

Le hash court provient du commit GitHub Actions.

## Scripts de contrôle

```bash
npm ci
npm run version:check
npm test
npm run build:android
npx cap sync android
```

Le dossier `android/app/src/main/assets/public/` ne doit jamais être modifié manuellement. Il est produit uniquement par le build Vite natif puis `cap sync android`.

## Livraison APK

1. Vider le dossier local de la branche Android en conservant uniquement `.git`.
2. Copier le contenu complet de ce ZIP dans le dossier.
3. Vérifier les changements dans GitHub Desktop et pousser sur `main`.
4. Attendre le dernier run vert `Android Debug APK`.
5. Télécharger uniquement l'artifact `cap-clair-dev15-2-1-debug-apk` du dernier run.
6. Installer l'APK puis vérifier dans le bandeau `DEV15.2.1` et le hash court attendu.
7. Ne diagnostiquer aucune anomalie avant cette vérification de version.

## Tests téléphone prioritaires

1. Ouvrir une ancienne trace, lancer Replay et vérifier le suivi avion par défaut.
2. Tester lecture, pause, retour au début, x1, x5, x10 et x20.
3. Déplacer le curseur directement sur le profil d'altitude.
4. Tester portrait et paysage sans perte de position.
5. Vérifier que Planifier reste strictement au nord.
6. Sélectionner TRK UP dans Suivi, ouvrir Planifier, puis revenir dans Suivi et confirmer que TRK UP est conservé.
7. En NORD UP dans Suivi, vérifier que la carte peut être tournée manuellement.
8. En TRK UP, vérifier que la rotation manuelle est bloquée.
9. Dans Planifier, activer `+ Point`, ajouter plusieurs points sans quitter le mode, puis appuyer sur `Terminer`.
10. Avec le GPS de suivi arrêté, appuyer sur Centrer dans Planifier puis dans Suivi et confirmer qu'aucune trace parasite n'est créée.
11. Vérifier les pas de 100 ft sur l'altitude par défaut.
12. Enregistrer, exporter puis supprimer une trace pour confirmer les non-régressions de DEV15.1.5.
