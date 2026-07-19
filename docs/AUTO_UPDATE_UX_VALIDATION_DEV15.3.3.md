# DEV15.3.3 - Auto Update UX Validation

## Objectif

Faire de DEV15.3.3 la première mise à jour CAP CLAIR installée entièrement depuis l'updater de DEV15.3.2, tout en améliorant l'information utilisateur sans automatiser le téléchargement ou l'installation.

## Déclenchement

Une recherche automatique est programmée environ 7 secondes après l'initialisation de l'application. Elle ne démarre que lorsque l'état global est compatible avec une opération réseau légère.

La recherche attend la fin de :

- l'enregistrement ou de la finalisation GPS ;
- la récupération ou de la vérification des traces ;
- l'export du PDF Log nav.

Une seule tentative automatique est effectuée par lancement. La vérification manuelle reste disponible dans `Plus`.

## Notification

Une Release plus récente déclenche :

- une notification discrète hors des écrans Suivi et Replay ;
- un badge sur l'onglet `Plus` ;
- une action `Voir` ;
- une action `Plus tard` qui masque la notification pendant 12 heures.

Le report ne supprime pas la Release détectée et ne masque pas la fiche détaillée dans l'écran `Plus`.

## Progression native

Le plugin Android publie des événements Capacitor pendant `verifyCurrentApk()` :

- `preparing` ;
- `sha256` ;
- `package` ;
- `version` ;
- `signature` ;
- `complete`.

Ces événements correspondent aux étapes réellement exécutées dans le code natif et ne sont pas des animations simulées.

## Journal diagnostic

Le journal local enregistre les 30 derniers événements :

- initialisation ;
- vérification distante ;
- téléchargement ;
- étapes de vérification ;
- autorisation Android ;
- ouverture de l'installateur ;
- erreurs éventuelles.

Il est stocké dans le localStorage WebView, ne contient aucune donnée de vol et peut être effacé par l'utilisateur.

## Nettoyage

Le plugin supprimait déjà l'APK au lancement lorsque son versionCode est inférieur ou égal à celui installé. DEV15.3.3 ajoute aussi la suppression immédiate d'un APK en attente lorsqu'une Release plus récente est détectée.

## Invariants

Aucune modification fonctionnelle du GPS, des traces, du Replay, du relief ou du PDF Log nav.
