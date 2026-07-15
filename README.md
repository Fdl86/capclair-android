# CAP CLAIR DEV15.2.10 - TRACE RELIABILITY

Application VFR mobile-first basée sur Vite, React, TypeScript, OpenLayers et Capacitor Android.

## Fonction principale de cette version

DEV15.2.10 corrige les défauts observés pendant le vol réel LFBI-LFOU du 15 juillet 2026.

Le diagnostic a montré que le journal Android avait correctement conservé 4 583 positions, mais que l'arrêt avait produit une seconde trace locale de seulement 2 points. Cette tentative courte avait remplacé la première sauvegarde. L'application avait aussi ralenti lors du rattrapage de milliers de points vers React, et le provider Android avait connu un trou réel de callbacks de 6 min 48 s alors que le service restait vivant.

La version renforce toute la chaîne :

- écriture GPS native sur un thread dédié ;
- Wake Lock CPU pendant l'enregistrement ;
- watchdog du provider et relance automatique après 30 secondes sans callback ;
- notifications bridge coalescées pour éviter de saturer la WebView ;
- rattrapage des gros journaux par lots au lieu de rejouer chaque point dans React ;
- lecture paginée du journal complet à l'arrêt ;
- arrêt et sauvegarde idempotents ;
- identifiant stable par session ;
- une tentative courte ne peut plus remplacer une trace complète ;
- temps des check-lists et essais moteur conservé par points stationnaires stabilisés ;
- vraie coupure GPS conservée comme séparation de segment, sans distance fictive ;
- réparation automatique des traces longues réduites à 2 ou 3 points si le journal natif est encore présent ;
- diagnostic GPS brut toujours disponible dans Mes traces.

## Version

- versionName : 15.2.10
- versionCode : 1502010
- APP_VERSION : CAP CLAIR DEV15.2.10 - TRACE RELIABILITY
- artifact : cap-clair-dev15-2-10-debug-apk

## Livraison

Consulter `LIVRAISON_DEV15.2.10.txt`.
