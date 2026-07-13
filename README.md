# CAP CLAIR DEV15.2.6 - GPS SAFETY OPTIMIZATION

CAP CLAIR est une application VFR mobile-first en Vite, React, TypeScript, OpenLayers et Capacitor Android.

DEV15.2.6 conserve intégralement le PDF Log nav validé en DEV15.2.5 et applique l'audit optimisation, intégrité des traces et cohérence des calculs.

## Corrections principales

### Journal GPS Android incrémental

- Le journal JSONL n'est plus relu intégralement toutes les 4 secondes.
- Le bridge conserve un offset binaire et ne récupère que les nouveaux points.
- Le polling de secours est suspendu tant que les événements natifs arrivent normalement.
- Une lecture complète reste possible uniquement lors d'une récupération après redémarrage.

### Trace affichée incrémentalement

- La géométrie OpenLayers n'est plus reconstruite à chaque point.
- Les coordonnées sont ajoutées à la ligne active.
- Les coupures GPS de plus de 15 secondes créent toujours des segments distincts.
- La distance parcourue est cumulée au fil de l'eau au lieu d'être recalculée sur toute la trace.

### Intégrité et récupération des traces

- Une session native récupérée n'est marquée comme sauvegardée que si elle figure réellement dans la collection persistée.
- En cas de saturation du stockage local, les journaux non sauvegardés restent récupérables.
- Les sessions récupérables sont triées de la plus récente à la plus ancienne.
- Les sessions courtes supprimées sont effacées physiquement du stockage Android.
- La route prévue est maintenant enregistrée directement dans les métadonnées de la session native.
- Chaque nouvelle navigation possède un identifiant unique. L'ancien identifiant `active-route` est migré automatiquement.
- Après reprise d'une session native, la trace finale conserve l'identifiant et le nom de route de cette session.

### Sécurité d'écriture native

- Chaque point indique s'il a réellement été écrit dans le journal Android.
- Un échec disque ou un stockage plein place le GPS en état dégradé et affiche un avertissement persistant.
- Les points reçus restent visibles en mémoire, mais l'application ne prétend plus que le journal est sécurisé.

### Planification et carburant

- Modifier le départ ou l'arrivée conserve tous les points intermédiaires.
- Un devis carburant supérieur à la capacité utile affiche maintenant le déficit en rouge.
- La vitesse sol globale correspond à la moyenne réelle de la route, calculée depuis la distance et le temps avec vent.
- Le rafraîchissement du vent utilise `weatherAnalysisTimeIso` et ne modifie plus l'heure prévue de départ.

### Maintenance et livraison

- Le `versionCode` utilise désormais `major * 100000 + minor * 1000 + patch` pour éviter la collision entre `15.2.10` et `15.3.0`.
- Le contrôle de version vérifie aussi le nom exact de l'artifact GitHub Actions.
- Le cache Android des exports reste strictement limité à 8 fichiers après création du nouvel export.
- Le compteur de points de diagnostic augmente uniquement lorsqu'un point entre réellement dans la trace.

## Export PDF du Log nav

Le bouton `Exporter PDF` produit la fiche A4 paysage validée V5, sans changement visuel dans cette version.

Le PDF conserve notamment :

- le tableau strictement conforme au document de référence ;
- 8 branches maximum ;
- distances arrondies au NM entier ;
- arrivée déroutement fixée à 12 minutes ;
- HE, HR, Conso, radios, QNH, Zmini, ETA et réservoirs laissés vides ;
- bordures REPERE, TAV et TOTAL validées ;
- génération locale et partage Android natif ;
- export web/PWA avec le même moteur ;
- exports GPX et JSON inchangés.

## Fonctions conservées

- GPS Android natif précis ;
- sauvegarde, suppression et récupération des traces ;
- export GPX et JSON ;
- Replay des anciennes traces ;
- route prévue superposée au vol réel ;
- modes NORD UP et TRK UP ;
- Suivi plein écran ;
- bandeau cockpit ;
- localisation ponctuelle sans création de trace ;
- signature Android stable ;
- workflow GitHub Actions ;
- compatibilité avec les anciennes traces.

## Version et identification

```text
applicationId fr.capclair.app
versionCode 1502006
versionName 15.2.6
APP_VERSION CAP CLAIR DEV15.2.6 - GPS SAFETY OPTIMIZATION
artifact cap-clair-dev15-2-6-debug-apk
```

Le bandeau affiche également le hash court du commit GitHub Actions.

## Commandes de contrôle

```bash
npm ci --no-audit --no-fund
npm run lockfile:check
npm run version:check
npm test
npm run build:android
npx cap sync android
```

Le dossier `android/app/src/main/assets/public/` doit toujours provenir de `npm run build:android` puis de `npx cap sync android`. Ne jamais le modifier manuellement.

## Procédure GitHub Desktop

1. Vider le dossier local de la branche APK en conservant uniquement `.git`.
2. Copier tout le contenu du ZIP dans ce dossier.
3. Ouvrir GitHub Desktop et vérifier la branche `main`.
4. Créer le commit `DEV15.2.6 - GPS safety optimization`.
5. Pousser sur GitHub.
6. Attendre le dernier run vert `Android Debug APK`.
7. Télécharger uniquement `cap-clair-dev15-2-6-debug-apk`.
8. Installer l'APK par-dessus la version précédente.
9. Vérifier `DEV15.2.6` et le hash court avant tout diagnostic.

Ne désinstaller l'ancienne version qu'en cas de problème confirmé de signature ou de versionCode.

## Tests téléphone prioritaires

1. Ouvrir une navigation de 5 à 8 points, changer le départ puis l'arrivée et vérifier que les points intermédiaires restent présents.
2. Lancer un enregistrement GPS de 20 à 30 minutes et surveiller fluidité, chauffe et compteur de points.
3. Passer l'application en arrière-plan puis la rouvrir et vérifier la reprise de la même session.
4. Arrêter et sauvegarder, puis contrôler la route prévue dans Replay.
5. Créer une trace très courte, l'arrêter et vérifier qu'elle ne réapparaît pas après redémarrage.
6. Tester un devis carburant dépassant la capacité utile et vérifier l'alerte rouge avec déficit.
7. Rafraîchir le vent et vérifier que l'heure prévue de départ reste inchangée.
8. Exporter le PDF Log nav, puis une trace GPX et JSON.
