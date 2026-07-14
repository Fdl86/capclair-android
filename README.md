# CAP CLAIR DEV15.2.9 - GPS DIAGNOSTIC HOTFIX

Application VFR mobile-first basée sur Vite, React, TypeScript, OpenLayers et Capacitor Android.

## Fonction principale de cette version

DEV15.2.9 ajoute une instrumentation native destinée à déterminer précisément l'origine d'une coupure de trace GPS en arrière-plan.

Le service Android écrit désormais un journal d'événements comprenant notamment :

- battement du service toutes les 60 secondes ;
- démarrage, redémarrage et destruction du service ;
- retrait de l'application des tâches récentes ;
- état du provider GPS et réseau ;
- première position reçue ;
- reprise après un trou de positions supérieur à 30 secondes.

Dans Mes traces, le bouton Diagnostic GPS exporte un ZIP contenant :

- diagnostic.json ;
- native-metadata.json ;
- native-journal.jsonl ;
- native-events.jsonl ;
- local-trace.json.

Cela permet de distinguer trois cas :

- journal Android continu mais trace locale incomplète : problème de bridge ou de reconstruction ;
- service vivant avec battements réguliers mais absence de positions : provider GPS ou réception ;
- battements interrompus en même temps que les positions : service Android suspendu, tué ou redémarré.

## Version

- versionName : 15.2.9
- versionCode : 1502009
- APP_VERSION : CAP CLAIR DEV15.2.9 - GPS DIAGNOSTIC HOTFIX
- artifact : cap-clair-dev15-2-9-debug-apk

## Livraison

Consulter `LIVRAISON_DEV15.2.9.txt`.
