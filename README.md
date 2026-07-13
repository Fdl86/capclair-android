# CAP CLAIR DEV15.2.4 - LOG NAV PDF

CAP CLAIR est une application VFR mobile-first en Vite, React, TypeScript, OpenLayers et Capacitor Android.

DEV15.2.4 conserve toutes les fonctions validées de DEV15.1.5 à DEV15.2.3 et ajoute le véritable export PDF du Log nav. Le document est généré localement à partir d'un instantané structuré, sans capture d'écran et sans envoi de la navigation vers un serveur.

## Export PDF du Log nav

Le bouton `Exporter PDF` du Log nav produit désormais la fiche de navigation A4 paysage validée visuellement.

Le parcours est le suivant :

1. préparer la navigation ;
2. ouvrir le Log nav ;
3. appuyer sur `Exporter PDF` ;
4. attendre l'état `Préparation PDF...` ;
5. partager ou enregistrer le document avec Android, ou le télécharger sur le web/PWA.

Le rendu reprend fidèlement le document de référence :

- structure générale et ordre des sections ;
- devis carburant ;
- tableau de navigation limité à 8 branches pour cette première version ;
- check-lists et aides de calcul ;
- gestion des réservoirs laissée vide ;
- cases manuelles laissées vides ;
- feuille A4 paysage imprimable ;
- bordures finales validées sur les colonnes REPERE, TAV et TOTAL.

## Données remplies automatiquement

CAP CLAIR remplit uniquement les données dont la source et le calcul sont certains :

- aérodrome de départ et altitude terrain ;
- aérodrome d'arrivée et altitude terrain ;
- facteur de base ;
- consommation en L/h et L/min ;
- essence inutilisable lorsqu'elle est renseignée dans le profil avion ;
- temps du trajet avec vent ;
- temps de déroutement lorsque le dégagement est défini ;
- arrivée déroutement fixée à 12 minutes ;
- réserve finale ;
- route magnétique ;
- dérive selon la convention de la fiche ;
- cap magnétique ;
- dérive maximale ;
- angle au vent ;
- facteur de base avec vent ;
- repère ;
- distance arrondie au NM entier le plus proche ;
- temps sans vent ;
- temps avec vent ;
- totaux distance, TSV et TAV.

## Données volontairement laissées vides

La règle appliquée est : en cas de doute, CAP CLAIR ne remplit pas la case.

Restent vides :

- pistes ;
- QNH ;
- fréquences radio et radionavigation ;
- Zmini ;
- Vs, Vs0, Vfe et VfinMax ;
- horamètres ;
- heures bloc ;
- marge carburant ;
- vol réglementaire ;
- carburant à bord ;
- temps de vol et heure limite ;
- HE et HR ;
- consommation et carburant restant par branche ;
- ETA ;
- gestion détaillée des réservoirs.

## Architecture

L'export repose sur les éléments suivants :

- `buildNavLogSnapshot()` construit un instantané stable du log ;
- les calculs sont centralisés et ne lisent pas directement les composants React ;
- `renderNavLogPdf()` applique les données sur le gabarit PDF local validé ;
- `pdf-lib` est chargé uniquement au moment de l'export ;
- Android reçoit le PDF en Base64 puis le partage comme fichier binaire ;
- le web/PWA télécharge le même tableau d'octets avec un Blob PDF ;
- le gabarit est inclus dans les ressources de l'APK et dans le cache PWA.

Le nom de fichier suit ce format :

```text
CAP-CLAIR_LOG-NAV_LFBI-LFOO_2026-07-12.pdf
```

Les caractères dangereux et les accents sont nettoyés uniquement dans le nom du fichier.

## Routes de plus de 8 branches

La première version imprime les 8 premières branches. L'export reste possible et affiche un avertissement indiquant le nombre de branches non imprimées. Les totaux du document correspondent uniquement aux branches effectivement affichées.

## Export Android

Le plugin `NativeTraceExportPlugin` conserve son comportement UTF-8 pour les exports GPX et JSON. Il accepte maintenant aussi un contenu Base64 pour écrire et partager un PDF binaire.

Les exports existants GPX et JSON restent inchangés.

## Fonctions conservées

- GPS Android natif précis ;
- stockage, suppression et récupération des traces ;
- export GPX et JSON ;
- Replay des anciennes traces ;
- route prévue superposée au vol réel ;
- modes NORD UP et TRK UP ;
- Suivi plein écran ;
- bandeau cockpit ;
- commandes d'enregistrement en plein écran ;
- ajout continu de points dans Planifier ;
- altitude par pas de 100 ft ;
- localisation ponctuelle sans création de trace ;
- signature Android stable ;
- workflow GitHub Actions.

## Compatibilité et sécurité

- aucun changement du GPS Android natif ;
- aucun changement du format des traces ;
- aucune modification du Replay ou du Suivi ;
- aucune exécution de contenu utilisateur ;
- aucune donnée de navigation envoyée vers un serveur ;
- génération déterministe à données identiques ;
- caractères français pris en charge ;
- aucune édition manuelle de `android/app/src/main/assets/public/` ;
- import GPX non inclus dans cette version.

## Version et identification du build

```text
applicationId fr.capclair.app
versionCode 15024
versionName 15.2.4
```

Le bandeau affiche :

```text
CAP CLAIR DEV15.2.4 - LOG NAV PDF - build <hash court>
```

Le hash court provient du commit GitHub Actions.

## Contrôles réalisés

```text
13 fichiers de tests
45 tests réussis
npm run version:check réussi
npm run build:android réussi
npx cap sync android réussi
npm run build:web réussi
```

Les tests couvrent notamment :

- construction du modèle d'export ;
- ordre des branches ;
- calculs Rm, X, Cm, Xmax, aw et Fbw ;
- arrondi des distances ;
- valeurs manquantes ;
- caractères accentués ;
- noms longs ;
- navigation courte ;
- navigation longue ;
- limite de 8 branches ;
- totaux ;
- nom de fichier ;
- PDF A4 paysage d'une page ;
- génération répétée déterministe ;
- non-régression des tests GPS, traces, cartes, Replay et exports GPX.

Le dossier `android/app/src/main/assets/public/` est produit uniquement par `npm run build:android`, puis synchronisé par `npx cap sync android`.

## Livraison APK

1. Vider le dossier local Android en conservant uniquement `.git`.
2. Copier le contenu complet de ce ZIP dans le dossier.
3. Vérifier dans GitHub Desktop que la branche active est `main`.
4. Utiliser le commit `DEV15.2.4 - Export PDF Log nav`.
5. Pousser sur GitHub.
6. Attendre le dernier run vert `Android Debug APK`.
7. Télécharger uniquement l'artifact `cap-clair-dev15-2-4-debug-apk` du dernier run vert.
8. Installer l'APK par-dessus la version précédente.
9. Vérifier `DEV15.2.4` et le hash court affiché avant tout diagnostic.

Ne désinstaller l'ancienne application qu'en cas de problème confirmé de `versionCode` ou de signature.

## Tests téléphone prioritaires

1. Préparer une navigation standard de 5 à 8 branches.
2. Ouvrir le Log nav et appuyer sur `Exporter PDF`.
3. Vérifier l'état `Préparation PDF...` puis l'ouverture du partage Android.
4. Enregistrer le PDF et l'ouvrir avec un lecteur indépendant.
5. Vérifier le format A4 paysage et l'absence de débordement.
6. Vérifier l'arrondi des distances au NM entier.
7. Vérifier que HE, HR, Conso, radio, QNH, Zmini, ETA et réservoirs restent vides.
8. Vérifier `Arr. Dérout.` à 12 minutes.
9. Vérifier le centrage des totaux et la continuité des bordures REPERE, TAV et TOTAL.
10. Tester une navigation de plus de 8 branches et vérifier l'avertissement.
11. Tourner le téléphone avant un nouvel export et vérifier que les données sont conservées.
12. Exporter ensuite une trace en GPX et JSON pour confirmer l'absence de régression.
