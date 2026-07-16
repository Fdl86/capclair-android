# Background GPS recovery DEV15.2.13

## Problème observé

Sur le diagnostic écran éteint de DEV15.2.12, le listener GPS continu cessait de recevoir des callbacks. Les demandes ponctuelles réussissaient, puis la logique considérait chaque point ponctuel comme une reprise complète. Le compteur de récupération revenait donc à zéro avant les niveaux hard et runtime.

## Nouvelle règle

- continuous : alimente la validation du flux continu ;
- probe : fournit un point de secours, mais ne valide jamais la reprise ;
- trois points continuous espacés de moins de 5 secondes sont nécessaires pour confirmer le retour du flux.

## Machine d'états

- normal : aucune action supplémentaire ;
- dégradé : absence de flux continu depuis 15 secondes ;
- soft : listener recréé après 30 secondes ;
- hard : runtime de localisation reconstruit après 60 secondes ;
- runtime : composants GNSS, thread, Wake Lock et notification recyclés après 120 secondes ;
- secours : probes espacés de 5 secondes, puis 10 secondes.

## Invariants

- un seul listener actif ;
- un seul probe actif ;
- anciens callbacks invalidés par génération ;
- sessionId inchangé ;
- journal JSONL inchangé ;
- route prévue inchangée ;
- aucune dépendance à React pour la récupération.
