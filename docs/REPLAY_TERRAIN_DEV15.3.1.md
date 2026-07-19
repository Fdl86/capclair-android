# Relief du Replay - DEV15.3.1

## Objectif

Afficher le relief sous une trace existante sans modifier le moteur GPS, l'enregistrement, le stockage natif ou le contenu de la trace.

## Déclenchement

Le chargement est lancé uniquement lors de l'ouverture du Replay d'une trace. Aucune requête de relief n'est effectuée en arrière-plan, pendant un vol ou pendant l'enregistrement GPS.

## Échantillonnage

CAP CLAIR sélectionne au maximum 180 positions réparties sur la distance totale de la trace. Les premiers et derniers points sont conservés.

L'API Open-Meteo accepte jusqu'à 100 coordonnées par appel. CAP CLAIR découpe donc le profil en deux lots maximum pour une trace complète.

## Source

Endpoint :

`https://api.open-meteo.com/v1/elevation`

Données : Copernicus DEM 2021 GLO-90, résolution annoncée de 90 mètres.

Attribution affichée dans l'interface :

`Relief estimé - Open-Meteo / Copernicus DEM GLO-90, résolution 90 m.`

## Cache

Le profil est enregistré dans le stockage local de la WebView avec une clé propre à la trace. Une empreinte basée sur la géométrie de la trace évite de réutiliser un profil devenu obsolète.

Une trace déjà chargée peut ensuite afficher son relief hors connexion. Un échec de cache n'empêche jamais l'ouverture ou la lecture du Replay.

## Affichage

La frise superpose :

- la courbe d'altitude GPS ;
- la silhouette du relief ;
- le curseur de position courant.

La carte de métriques affiche également :

- altitude GPS ;
- altitude du sol estimée ;
- hauteur sol estimée.

## Limites

Le relief n'est pas une base obstacles. Il ne contient pas les arbres, bâtiments, pylônes, antennes ou autres obstacles verticaux.

L'altitude GPS et le modèle terrain peuvent chacun comporter une marge d'erreur. La hauteur sol affichée est donc une estimation non réglementaire.
