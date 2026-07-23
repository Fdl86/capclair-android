# DEV15.4.2 - Loop Route and Nav Safety Fixes

## Route en boucle

Le départ et l'arrivée peuvent désormais utiliser le même aérodrome. Les deux points conservent des identifiants distincts et encadrent les points tournants de la navigation.

Une boucle n'est prête que lorsqu'elle contient au moins un point intermédiaire distinct et deux branches de distance positive. Une route composée uniquement de deux occurrences du même aérodrome ne génère aucune branche et reste bloquée pour le Log nav, le PDF et le démarrage du Suivi.

## Dégagement

Le dégagement reste facultatif, mais il doit correspondre à un aérodrome connu et être différent de l'arrivée. Si l'arrivée change et devient identique au dégagement mémorisé, ce dernier est effacé afin de ne pas conserver un calcul carburant incohérent.

## Espaces aériens

L'ancien moteur testait un nombre fixe de positions le long de chaque branche. Une zone étroite pouvait se trouver entre deux positions et ne pas être détectée.

DEV15.4.2 calcule les intersections entre le segment de route et chaque contour de zone. Les rapports d'entrée et de sortie sont issus des intersections réelles, puis utilisés par le profil de branche.

## Pertinence SUP AIP

La distance d'une publication SUP AIP est maintenant calculée entre :

- chaque segment complet de la route ;
- les contours de ses polygones et multipolygones.

Une zone traversée ou située près du milieu d'une longue branche est donc classée correctement. Ce calcul influence uniquement le classement et la synthèse. Toutes les publications restent accessibles et aucune SUP AIP n'est masquée par l'altitude.

## Carte et NOTAM

Les marqueurs utilisent désormais :

- `D` pour le départ ;
- `A` pour l'arrivée ;
- `D/A` lorsqu'ils occupent le même emplacement.

Un NOTAM concernant l'aérodrome commun d'une boucle porte la pertinence `Départ et arrivée`.

## Invariants

DEV15.4.2 ne modifie pas :

- le moteur GPS natif ;
- l'enregistrement et la récupération des traces ;
- le Replay et le relief ;
- l'export PDF natif ;
- le stockage des profils et réglages ;
- la base SUP AIP locale versionnée ;
- l'auto-update Android.
