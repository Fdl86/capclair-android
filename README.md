# CAP CLAIR DEV15.2.2 - SUIVI UX

CAP CLAIR est une application VFR mobile-first en Vite, React, TypeScript, OpenLayers et Capacitor Android.

DEV15.2.2 conserve toutes les fonctions validées de DEV15.2.1 et améliore l'écran Suivi hors plein écran, la lisibilité de la trace réelle et la disposition du Replay en paysage. Le fonctionnement du GPS natif, le stockage et les exports de traces restent inchangés.

## Suivi hors plein écran

- petite bulle d'état GPS en haut à gauche de la carte ;
- états explicites avec couleur et texte : GPS arrêté, recherche, signal dégradé, actif ou perdu ;
- précision horizontale affichée directement lorsque disponible ;
- écart à la route affiché dans une pastille compacte sur la carte ;
- quatre données principales compactes sous la carte : vitesse sol, altitude GPS, route GPS et précision ;
- prochaine étape regroupée dans une ligne compacte avec distance, cap magnétique et ETA ;
- commandes de démarrage, simulation et arrêt conservées ;
- diagnostics GPS et trace conservés dans un panneau repliable ;
- mode plein écran existant conservé sans refonte structurelle.

## Lisibilité de la trace

- trace réelle désormais magenta vif `#FF3FA4` ;
- halo sombre sous la trace pour rester visible sur OpenAIP et OACI 1/500k ;
- même présentation dans Suivi et Replay ;
- route prévue conservée en cyan ;
- coupures GPS toujours représentées par des segments séparés, sans ligne droite artificielle.

## Replay paysage

- correction de disposition uniquement en paysage ;
- carte nettement agrandie ;
- profil d'altitude réduit sans perdre son interaction tactile ;
- métriques compactées ;
- vitesses x1, x5, x10 et x20 placées sur une seule ligne ;
- commandes de lecture réduites pour masquer moins de carte ;
- portrait DEV15.2.1 conservé.

## Fonctions DEV15.2.1 conservées

- bouton `Replay` depuis `Mes traces` ;
- suivi avion actif par défaut ;
- lecture, pause et retour au début sur la carte ;
- déplacement manuel sur le profil d'altitude ;
- Planifier verrouillé au nord ;
- préférence NORD UP / TRK UP propre à Suivi ;
- ajout continu de plusieurs points depuis la carte ;
- altitude par défaut réglable par pas de 100 ft ;
- localisation ponctuelle par le bouton Centrer sans création de trace ;
- exports GPX et JSON ;
- stockage et suppression des traces ;
- compatibilité avec les anciennes traces.

## Compatibilité et sécurité

- aucun changement du service Android de suivi en arrière-plan ;
- aucun changement des fichiers Java du GPS natif ;
- signature et workflow GitHub Actions conservés ;
- aucune nouvelle dépendance graphique ;
- aucun service worker dans le build Android ;
- dossier Android synchronisé inclus dans la livraison.

## Version et identification du build

```text
applicationId fr.capclair.app
versionCode 15022
versionName 15.2.2
```

Le bandeau affiche :

```text
CAP CLAIR DEV15.2.2 - SUIVI UX - build <hash court>
```

Le hash court provient du commit GitHub Actions.

## Contrôles réalisés

```text
9 fichiers de tests
28 tests réussis
npm run version:check réussi
npm run build:android réussi
npx cap sync android réussi
```

L'assemblage Gradle local nécessite le téléchargement de Gradle 8.14.3. Il doit être confirmé par le dernier run vert GitHub Actions lorsque l'environnement local ne dispose pas de cette distribution.

Le dossier `android/app/src/main/assets/public/` ne doit jamais être modifié manuellement. Il est produit uniquement par `npm run build:android`, puis synchronisé par `npx cap sync android`.

## Livraison APK

1. Vider le dossier local Android en conservant uniquement `.git`.
2. Copier le contenu complet de ce ZIP dans le dossier.
3. Vérifier dans GitHub Desktop que la branche active est `main`.
4. Utiliser le commit `DEV15.2.2 - Suivi UX et trace renforcée`.
5. Pousser sur GitHub.
6. Attendre le dernier run vert `Android Debug APK`.
7. Télécharger uniquement l'artifact `cap-clair-dev15-2-2-debug-apk` de ce run.
8. Installer l'APK et vérifier `DEV15.2.2` ainsi que le hash court avant tout diagnostic.

## Tests téléphone prioritaires

1. Vérifier le Replay en portrait, qui doit rester identique à la version validée.
2. Vérifier en paysage que la carte est plus haute et que les quatre vitesses tiennent sur une ligne.
3. Ouvrir Suivi avec le GPS arrêté et vérifier la bulle rouge `GPS ARRÊTÉ`.
4. Démarrer le GPS et suivre le passage jaune puis vert avec affichage de la précision.
5. Vérifier la lisibilité de la trace magenta sur OpenAIP puis OACI 1/500k.
6. Vérifier l'écart route compact sur la carte.
7. Vérifier que les données sous la carte restent lisibles sans panneaux surdimensionnés.
8. Ouvrir puis refermer les détails GPS et trace.
9. Passer en plein écran et confirmer que les commandes et le bandeau cockpit validés fonctionnent toujours.
10. Enregistrer, sauvegarder, exporter et supprimer une trace pour confirmer les non-régressions.
