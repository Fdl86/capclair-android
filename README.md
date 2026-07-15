# CAP CLAIR DEV15.2.11 - TRACE JOURNAL INTEGRITY

Application VFR mobile-first basée sur Vite, React, TypeScript, OpenLayers et Capacitor Android.

## Objectif de cette version

DEV15.2.11 corrige le défaut de pagination observé après la réparation du vol réel LFBI-LFOU du 15 juillet 2026.

Le journal Android complet contenait 4 583 positions, mais DEV15.2.10 pouvait accepter une première page de 500 positions comme si elle représentait le journal entier. Après filtrage stationnaire, cela produisait une trace de 57 points, 84 minutes et 0 NM.

La version impose désormais une lecture complète et vérifiable avant toute sauvegarde ou réparation :

- offset de départ et de fin contrôlé à chaque page ;
- taille réelle du journal renvoyée par Android ;
- fin de fichier explicite ;
- détection d'un offset bloqué ;
- détection d'une page finale prématurée ;
- refus d'une ligne finale partielle ;
- comptage des lignes valides et illisibles ;
- lecture unique partagée pour éviter les traitements lourds simultanés ;
- nouvelle lecture fraîche obligatoire après l'arrêt du service GPS ;
- aucune trace locale remplacée si la lecture native n'est pas complète ;
- statut de vérification distinct du schemaVersion ;
- réparation automatique des traces longues, très clairsemées ou à 0 NM ;
- priorité permanente à une trace vérifiée contre son journal complet.

## Régression sur le journal réel

Le journal LFBI-LFOU a été relu avec le moteur de pagination DEV15.2.11 :

- taille : 971 592 octets ;
- pages : 10 ;
- positions brutes : 4 583 ;
- positions reconstruites : 1 296 ;
- durée couverte : 5 055 secondes ;
- distance : 81,314886 NM ;
- segments : 2, avec conservation de la vraie coupure GPS.

Deux lectures successives produisent le même résultat.

## Version

- versionName : 15.2.11
- versionCode : 1502011
- APP_VERSION : CAP CLAIR DEV15.2.11 - TRACE JOURNAL INTEGRITY
- artifact : cap-clair-dev15-2-11-debug-apk

## Livraison

Consulter `LIVRAISON_DEV15.2.11.txt`.
