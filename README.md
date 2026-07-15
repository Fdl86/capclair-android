# CAP CLAIR DEV15.2.12 - GPS RECOVERY INTEGRITY

Application VFR mobile-first Vite, React, TypeScript, OpenLayers et Capacitor Android.

Cette version corrige deux défauts distincts observés pendant le test routier du 15 juillet 2026 :

- l'offset de pagination transmis par JavaScript pouvait être décodé à `0` par le bridge Android à partir de la page 2 ;
- sur le téléphone Xiaomi, le service restait vivant mais le listener GNSS pouvait ne plus recevoir de positions après une immobilisation prolongée.

## Pagination du journal

- décodage indépendant du type numérique Java reçu (`Integer`, `Long`, `Double` ou chaîne) ;
- écho séparé de l'offset demandé et de l'offset réellement utilisé ;
- refus d'un offset hors limites ou modifié par le bridge ;
- lecture obligatoire jusqu'au dernier octet avant sauvegarde ou réparation ;
- aucune trace existante remplacée par une lecture incomplète.

## Récupération GNSS

Le watchdog applique désormais trois niveaux espacés :

1. réinscription du listener et demande immédiate de position après 30 secondes ;
2. reconstruction complète du `LocationManager`, du listener, du callback GNSS et du thread dédié après 75 secondes ;
3. recyclage complet du runtime GPS natif, du Wake Lock et de la notification après 150 secondes, puis avec recul progressif.

Les positions ponctuelles trop anciennes ne peuvent pas masquer une panne réelle. Les diagnostics enregistrent les satellites visibles/utilisés, les sondes, les reprises et chaque niveau de récupération.

## Régression réelle

Le journal LFBI-LFOU de 971 592 octets a été relu :

- 10 pages ;
- 4 583 points bruts ;
- dernier offset 971 592 ;
- 1 296 points reconstruits ;
- 84 min 15 s ;
- 81,314886 NM ;
- 2 segments.

## Version

- versionName : 15.2.12
- versionCode : 1502012
- APP_VERSION : CAP CLAIR DEV15.2.12 - GPS RECOVERY INTEGRITY
- artifact : cap-clair-dev15-2-12-debug-apk

Consulter `LIVRAISON_DEV15.2.12.txt`.
