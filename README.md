# CAP CLAIR DEV15.4.2 - LOOP ROUTE AND NAV SAFETY FIXES

Application VFR mobile-first construite avec Vite, React, TypeScript, OpenLayers et Capacitor Android.

DEV15.4.2 autorise les navigations en boucle avec un départ et une arrivée identiques, corrige plusieurs validations de route et renforce les calculs géométriques utilisés pour les espaces aériens et la pertinence des SUP AIP.

## Routes en boucle

Une route comme `LFBI - point tournant - LFBI` est désormais autorisée.

Une simple route `LFBI - LFBI` reste volontairement incomplète tant qu'aucun point tournant distinct n'a été ajouté. CAP CLAIR affiche alors `Boucle à compléter : ajoutez au moins un point tournant.` et bloque le Log nav, le PDF et le démarrage du Suivi afin de ne pas générer un temps ou un carburant fictif.

## Sécurité de navigation

DEV15.4.2 apporte aussi :

- une intersection exacte entre chaque branche et les polygones d'espaces aériens, sans dépendre de quelques points échantillonnés ;
- un classement SUP AIP fondé sur la distance au tracé complet et non seulement aux points de navigation ;
- un dégagement obligatoirement distinct de l'arrivée ;
- une saisie cohérente entre clavier et suggestions d'aérodromes ;
- des marqueurs cartographiques `D`, `A` et `D/A` corrects ;
- le libellé NOTAM `Départ et arrivée` pour un aérodrome commun aux deux extrémités.

## Briefing et base SUP AIP

Les fonctions de DEV15.4.1 sont conservées :

- import local d'un PIB SOFIA ;
- analyse et carte des NOTAM ;
- données SUP AIP versionnées et vérifiées par SHA-256 ;
- base locale active, précédente et embarquée ;
- fonctionnement hors ligne ;
- accès aux PDF officiels SIA ;
- aucune SUP AIP masquée par un filtre vertical.

## Fonctions conservées

DEV15.4.2 conserve les fonctions Android déjà validées :

- GPS écran éteint ;
- Suivi et enregistrement ;
- récupération des traces ;
- Replay et relief ;
- PDF Log nav ;
- profils et réglages ;
- mise à jour semi-automatique Android ;
- conservation des données après mise à jour.

## Version

- versionName : 15.4.2
- versionCode : 1504002
- APP_VERSION : CAP CLAIR DEV15.4.2 - LOOP ROUTE AND NAV SAFETY FIXES
- artifact : cap-clair-dev15-4-2-release-apk
- tag Release : android-v15.4.2

Consulter `LIVRAISON_DEV15.4.2.txt`, `docs/LOOP_ROUTE_NAV_SAFETY_DEV15.4.2.md` et `docs/SUP_AIP_LOCAL_DATABASE_DEV15.4.1.md`.
