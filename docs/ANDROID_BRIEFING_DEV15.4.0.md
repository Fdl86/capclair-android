# DEV15.4.0 - Android Briefing Foundation

## Objectif

DEV15.4.0 ajoute un espace Android séparé pour les NOTAM et les SUP AIP sans intégrer cette logique dans les composants GPS, Suivi, traces ou Replay.

## Chaîne SUP AIP

La source principale reste la publication serveur produite par le workflow web toutes les 6 heures.

L'application :

- contrôle d'abord le petit fichier de statut ;
- compare la révision distante à la révision active ;
- télécharge le manifeste, l'index des publications incomplètes et le GeoJSON uniquement si la révision change ;
- valide les quatre fichiers avant activation ;
- enregistre la nouvelle base dans IndexedDB en une transaction ;
- conserve l'ancienne base si un téléchargement ou une validation échoue.

L'ordre de repli est :

1. dernière base serveur validée ;
2. dernière base locale validée ;
3. base complète embarquée dans l'APK.

## Contrôles de sécurité

Une base est rejetée en cas de :

- schéma non supporté ;
- révisions incohérentes ;
- compteur de publications ou de géométries incohérent ;
- régression serveur non résolue ;
- identifiant dupliqué ;
- géométrie ou coordonnée invalide ;
- URL officielle non HTTPS ;
- limite verticale extraite mais vide ;
- texte "À vérifier" dans les limites verticales ;
- message de repli différent de la formule obligatoire.

Le cache est relu et son empreinte SHA-256 est recalculée avant utilisation.

## Règles de visibilité

Toutes les géométries SUP AIP de la base active sont chargées sur la carte Briefing.

Il n'existe :

- aucun mode OFF ;
- aucun filtre par altitude ;
- aucune disparition liée à l'altitude prévue ou actuelle.

La proximité de la route sert uniquement à classer et signaler les publications.

## NOTAM

L'import PDF utilise la couche texte du document et reste local à l'appareil. Aucun OCR automatique n'est exécuté.

Les NOTAM peuvent produire :

- un polygone précis extrait du champ E ;
- un point précis ;
- un cercle Q explicitement indiqué comme approximatif ;
- une relation vers une géométrie SUP AIP déjà présente, sans duplication de cette géométrie.

## Optimisation

- écran Briefing chargé en lazy loading ;
- PDF.js chargé uniquement lors d'un import PDF ;
- listes paginées par groupes de 16 ;
- libellés cartographiques limités aux niveaux de zoom utiles ;
- contrôle serveur léger toutes les 30 minutes ;
- aucune synchronisation réseau SUP AIP pendant un enregistrement ou une finalisation GPS, une récupération de trace, un export PDF ou une opération d'auto-update.

## Invariants

Aucune modification fonctionnelle des services GPS, du Suivi, des traces, du Replay, du relief, du PDF Log nav ou du plugin natif de mise à jour.
