Spacedog Toolbox
---

Pré-requis
===

`nodejs` et `npm` installés : https://nodejs.org/en/download/

Installation
===

`npm install -g dog-toolbox`

Cela va installer de façon globale les outils de la toolbox.

Pour mettre à jour, il faut lancer la même commande. Pour voir la version installée : `dog-toolbox-* -v`

Utilisation
===

**Dump ** `dog-toolbox-dump`

Il faut fournir à cette commande l'url du backend, le nom d'utilisateur et le mot de passe. Cela va créer, à l'emplacement où la commande est lancée, un répertoire `dump`. La commande va récupérer les données du backend et les persister dans le repertoire `dump`. A utiliser en coordination avec `restore`.

*Exemple* : `dog-toolbox-dump -u fred -p azerty -b https://suezcantodev1`

**Restore ** `dog-toolbox-restore`

Il faut fournir à cette commande l'url du backend, le nom d'utilisateur et le mot de passe. Il faut lancer cette commande au même niveau que le répertoire `dump`. Cette commande va lire le contenu de `dump` et créer les schémas et envoyer les données par batch de 10.

*Exemple* : `dog-toolbox-restore -u fred -p azerty -b -m $NewPassword123 https://suezcantodev2.spacedog.io`

**Limitations des commandes Dump et Restore**

Ces 2 commandes ont 2 limitations : sur les `credentials` d'abord. De l'extérieur, on ne peut pas dupliquer un mot de passe. Du coup, lorsqu'on `restore` un backend, les mots de passes sont tous réinitialisées. Vous pouvez passer un paramètre à la commande `dog-toolbox-restore` pour mettre un mot de passe à tout les utilisateurs (`-m $NewPassword123`).

La deuxième limitation concerne les settings : ceux-ci ne sont ni dumpés ni restorés.


Contribuer
===

En local, la commande `npm link` permet d'installer la version de travail. Suite à cette commande, les commandes `dog-toolbox-*` pointent vers le répertoire de travail.


Publier
===

`npm version <major | minor | patch> && npm publish`



