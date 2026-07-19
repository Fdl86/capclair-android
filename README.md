# CAP CLAIR DEV15.3.3 - AUTO UPDATE UX VALIDATION

Application VFR mobile-first Vite, React, TypeScript, OpenLayers et Capacitor Android.

DEV15.3.3 améliore l'expérience du système de mise à jour semi-automatique introduit en DEV15.3.0 et corrigé en DEV15.3.2. Cette version sert de première validation complète d'une mise à jour détectée, téléchargée, vérifiée et installée directement depuis CAP CLAIR.

## Recherche automatique

CAP CLAIR lance une vérification légère environ 7 secondes après son démarrage lorsque l'application est disponible.

La recherche est reportée si l'une des activités suivantes est en cours :

- enregistrement ou finalisation GPS ;
- récupération ou vérification d'une trace ;
- export du log de navigation.

La recherche ne déclenche jamais le téléchargement ni l'installation.

## Information utilisateur

Lorsqu'une version plus récente est disponible :

- une notification discrète apparaît dans l'application ;
- un badge est affiché sur l'onglet `Plus` ;
- le bouton `Voir` ouvre la fiche complète ;
- le bouton `Plus tard` masque la notification pendant 12 heures ;
- la fiche de mise à jour reste toujours accessible dans `Plus`.

L'écran affiche aussi la date et l'heure de la dernière tentative de vérification.

## Téléchargement et vérifications

Le téléchargement reste volontaire et utilise le DownloadManager Android. Les étapes de sécurité sont désormais affichées précisément :

- calcul du SHA-256 ;
- vérification du package `fr.capclair.app` ;
- vérification du versionCode et du versionName ;
- vérification de la signature Android ;
- APK prêt à installer.

Un journal diagnostic local conserve les 30 derniers événements de l'updater. Il ne contient ni jeton, ni donnée de vol, ni information sensible et peut être effacé depuis l'écran `Plus`.

## Nettoyage

- un APK plus ancien est supprimé lorsqu'une Release plus récente est détectée ;
- après une installation réussie, l'ancien APK est supprimé au prochain lancement ;
- les téléchargements interrompus ou invalides continuent d'être supprimés immédiatement.

## Fonctions conservées

DEV15.3.3 conserve intégralement :

- le relief terrain du Replay ;
- la prise en charge des anciennes traces et GPX importés ;
- les protections SHA-256, package, versionCode et signature ;
- le refus des versions identiques ou plus anciennes ;
- l'ouverture de l'installateur système avec confirmation Android.

## Invariants

Le moteur GPS, le Suivi, la collecte des positions, le stockage natif des traces, le Replay, le relief et le PDF Log nav ne sont pas modifiés.

## Version

- versionName : 15.3.3
- versionCode : 1503003
- APP_VERSION : CAP CLAIR DEV15.3.3 - AUTO UPDATE UX VALIDATION
- artifact : cap-clair-dev15-3-3-release-apk
- tag Release : android-v15.3.3

Consulter `LIVRAISON_DEV15.3.3.txt`, `docs/AUTO_UPDATE_UX_VALIDATION_DEV15.3.3.md`, `docs/AUTO_UPDATE_BRIDGE_HOTFIX_DEV15.3.2.md` et `docs/AUTO_UPDATE_DEV15.3.0.md`.
