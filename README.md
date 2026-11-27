# TokenFlex

Tableau de bord local en français pour l’activité Codex et son équivalent API estimé. Python 3.9+ et CodexBar CLI sont requis ; aucune dépendance Python externe.

```sh
./tokenflex
```

Le lanceur ouvre une page locale. Ctrl+C arrête le serveur ; ferme ensuite l’onglet. Le serveur écoute seulement sur 127.0.0.1.

## Calcul

TokenFlex utilise directement `codexbar cost --provider codex --format json --period all`. Le CLI est découvert dans le PATH, dans l’application macOS CodexBar ou via `TOKENFLEX_CODEXBAR=/chemin/vers/codexbar`.

Les montants journaliers et les répartitions par modèle viennent du rapport CodexBar. Les sections projets et totaux ne sont pas ajoutées aux jours : elles décrivent le même usage. Aucun catalogue de prix ni tarif de repli n’est appliqué par TokenFlex. Les coûts manquants restent non chiffrés. Le coût du jour et la moyenne de la période sont distincts. La moyenne inclut les jours calendaires sans activité.

Principe du moteur : `(entrée − cache) × tarif entrée + cache × tarif cache + sortie × tarif sortie`. Le raisonnement est déjà compris dans la sortie. CodexBar fournit les règles de modèles, de tarifs, de contexte et de dédoublonnage ; leur couverture dépend de sa version et des journaux disponibles.

Les montants sont des **équivalents API en USD**, pas des frais facturés en supplément ni une conversion du quota de l’abonnement. Les quotas en pourcentage proviennent séparément des journaux Codex. Un historique local ne couvre pas nécessairement tous les appareils ou tout l’usage ChatGPT.

Pour comparer avec CodexBar, utiliser la même période, les mêmes sources locales et la même devise. CodexBar peut afficher des dollars canadiens tandis que TokenFlex reste en USD. Un relevé conservé en cas d’échec est explicitement signalé ; son horodatage reste celui de CodexBar.

## Données locales

Les agrégats et quotas restent dans `data/usage.sqlite3`, exclu de Git. Les jours retournés par CodexBar remplacent leur précédent relevé sans addition. Les jours absents d’un futur relevé sont conservés comme historique local. Pour sauvegarder les données, arrêter TokenFlex puis copier `data/`. Aucune conversation, authentification ni base de données ne doit être publiée sur GitHub.

## Vérification

```sh
python3 -m unittest discover -s tests -v
node --check public/app.js
```

Source du moteur : [steipete/CodexBar](https://github.com/steipete/CodexBar), installé séparément. TokenFlex ne redistribue pas son binaire.
