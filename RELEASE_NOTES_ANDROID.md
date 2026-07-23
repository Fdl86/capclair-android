# CAP CLAIR DEV15.4.2

- Autorisation d'un départ et d'une arrivée identiques pour préparer une navigation en boucle.
- Blocage explicite d'une boucle sans point tournant afin d'éviter une branche de 0 NM, un temps fictif et un carburant erroné.
- Blocage du Log nav, du PDF et du démarrage du Suivi tant que la boucle n'est pas réellement construite.
- Suppression des branches à distance nulle dans le moteur de route.
- Validation du dégagement : il doit être connu et différent de l'arrivée.
- Harmonisation de la saisie au clavier et de la sélection dans les suggestions d'aérodromes.
- Correction des marqueurs cartographiques : `D` pour le départ, `A` pour l'arrivée et `D/A` pour une boucle.
- Libellé NOTAM `Départ et arrivée` lorsque le même aérodrome occupe les deux rôles.
- Remplacement de l'échantillonnage des espaces aériens par une intersection géométrique segment-polygone.
- Calcul de la pertinence SUP AIP par rapport aux branches complètes de la route et aux contours des zones.
- Ajout de tests dédiés aux boucles, dégagements, marqueurs, NOTAM, espaces aériens, SUP AIP et progression du Suivi.
- Aucun changement du moteur GPS, du stockage des traces, du Replay, du relief, de l'export PDF natif, de la base SUP AIP locale ou de l'auto-update.
