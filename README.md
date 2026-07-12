# CAP CLAIR DEV15.2.3 - SUIVI REC UX

CAP CLAIR est une application VFR mobile-first en Vite, React, TypeScript, OpenLayers et Capacitor Android.

DEV15.2.3 conserve toutes les fonctions validées de DEV15.2.2 et clarifie la différence entre une localisation ponctuelle et l'enregistrement d'une trace. Elle ajoute les commandes d'enregistrement au Suivi plein écran et réorganise entièrement le Replay en paysage. L'import GPX est volontairement reporté à DEV15.3.0.

## Position GPS et enregistrement

- la bulle de carte décrit désormais la position GPS, indépendamment de l'enregistrement ;
- après un appui sur Centrer, une position ponctuelle récente est affichée sous la forme `POSITION 12 m` ;
- une position devenue ancienne passe en jaune, puis devient inactive ;
- les erreurs réelles restent rouges : GPS indisponible ou autorisation refusée ;
- l'état d'enregistrement utilise une information séparée : `NON ENREGISTRÉ`, `ACQUISITION`, `REC hh:mm:ss`, `SAUVEGARDE` ou `TRACE SAUVÉE` ;
- aucune localisation ponctuelle ne crée de trace.

## Suivi hors plein écran

- correction du chevauchement entre la bulle de position et le sélecteur OpenAIP / OACI 1/500k ;
- bouton principal renommé `Démarrer l'enregistrement` ;
- arrêt renommé selon le contexte : acquisition, enregistrement ou sauvegarde ;
- libellé `Alt GPS` utilisé pour éviter la troncature sur téléphone étroit ;
- disposition compacte DEV15.2.2 conservée ;
- trace réelle magenta avec halo sombre conservée.

## Suivi plein écran

- bulle de position GPS visible dans la barre supérieure ;
- chip d'enregistrement placée à côté de NORD UP / TRK UP ;
- chronomètre REC affiché pendant l'enregistrement ;
- bouton Record ajouté sous le bouton de zoom arrière ;
- cercle rouge pour démarrer ;
- carré blanc sur fond rouge pour arrêter ;
- état jaune pendant l'acquisition ou la sauvegarde ;
- arrêt toujours protégé par la confirmation existante ;
- bandeau cockpit et fonctionnement NORD UP / TRK UP conservés.

## Replay paysage

- carte placée sur toute la hauteur disponible à gauche ;
- métriques regroupées en haut de la colonne droite ;
- profil d'altitude déplacé sous les métriques dans la colonne droite ;
- vitesses x1, x5, x10 et x20 conservées sous le profil ;
- commandes lecture, pause et Début conservées sur la carte ;
- distance totale conservée à la fin exacte du Replay ;
- portrait DEV15.2.2 conservé sans modification.

Le profil d'altitude est volontairement plus compact en paysage. Une trace longue doit être contrôlée sur téléphone afin de confirmer la lisibilité du profil décimé et la précision du déplacement tactile.

## Fonctions conservées

- GPS Android natif précis ;
- stockage, suppression et récupération des traces ;
- export GPX et JSON ;
- Replay des anciennes traces ;
- route prévue superposée au vol réel ;
- modes NORD UP et TRK UP ;
- Suivi plein écran ;
- bandeau cockpit ;
- ajout continu de points dans Planifier ;
- altitude par pas de 100 ft ;
- localisation ponctuelle sans création de trace ;
- signature Android et workflow GitHub Actions.

## Compatibilité et sécurité

- aucun changement du service Android de suivi en arrière-plan ;
- aucun changement des fichiers Java du GPS natif ;
- aucun changement du format des traces ;
- aucune nouvelle dépendance ;
- aucun service worker dans le build Android ;
- dossier Android synchronisé inclus dans la livraison ;
- import GPX non inclus dans cette version.

## Version et identification du build

```text
applicationId fr.capclair.app
versionCode 15023
versionName 15.2.3
```

Le bandeau affiche :

```text
CAP CLAIR DEV15.2.3 - SUIVI REC UX - build <hash court>
```

Le hash court provient du commit GitHub Actions.

## Contrôles réalisés

```text
10 fichiers de tests
32 tests réussis
npm run version:check réussi
npm run build:android réussi
npx cap sync android réussi
```

Le dossier `android/app/src/main/assets/public/` ne doit jamais être modifié manuellement. Il est produit uniquement par `npm run build:android`, puis synchronisé par `npx cap sync android`.

## Livraison APK

1. Vider le dossier local Android en conservant uniquement `.git`.
2. Copier le contenu complet de ce ZIP dans le dossier.
3. Vérifier dans GitHub Desktop que la branche active est `main`.
4. Utiliser le commit `DEV15.2.3 - Suivi REC et Replay paysage`.
5. Pousser sur GitHub.
6. Attendre le dernier run vert `Android Debug APK`.
7. Télécharger uniquement l'artifact `cap-clair-dev15-2-3-debug-apk` de ce run.
8. Installer l'APK et vérifier `DEV15.2.3` ainsi que le hash court avant tout diagnostic.

## Tests téléphone prioritaires

1. Appuyer sur Centrer avec l'enregistrement arrêté et vérifier `POSITION xx m`, sans trace créée.
2. Vérifier qu'une position ancienne passe en jaune puis devient inactive.
3. Vérifier l'absence de chevauchement avec OpenAIP / OACI 1/500k en portrait.
4. Démarrer puis arrêter un enregistrement depuis l'écran normal.
5. Passer en plein écran et vérifier le bouton Record sous le zoom arrière.
6. Vérifier `REC hh:mm:ss` à côté de NORD UP / TRK UP.
7. Arrêter depuis le plein écran, confirmer puis vérifier la sauvegarde.
8. Ouvrir le Replay en paysage et vérifier que la carte occupe toute la hauteur gauche.
9. Tester une trace longue dans le petit profil d'altitude à droite.
10. Vérifier la distance à la fin exacte du Replay.
11. Exporter GPX et JSON, supprimer la trace puis redémarrer l'application.
