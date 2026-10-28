import type { PartialTranslation } from "../../message";
import type { messages as source } from "../en/agentTeam";

export const messages = {
  "agentTeam.export.done": "{count} agents enregistrés dans {file}.",
  "agentTeam.export.masked": "Des valeurs ressemblant à des secrets ont été masquées dans {count} agents.",
  "agentTeam.export.failed": "Impossible d’exporter l’équipe.",
  "agentTeam.import.title": "Importer l’équipe {name}",
  "agentTeam.import.summary": "{agents} agents seront créés dans {sections} sections.",
  "agentTeam.import.renamed": "{count} noms sont déjà pris et recevront un numéro.",
  "agentTeam.import.contents": "Ils comportent ensemble {skills} compétences et {routines} routines.",
  "agentTeam.import.safety":
    "Les compétences démarrent désactivées et les routines en pause. Les agents existants ne sont pas modifiés.",
  "agentTeam.import.action": "Importer l’équipe",
  "agentTeam.import.pending": "Importation…",
  "agentTeam.import.done": "{count} agents importés.",
  "agentTeam.import.failed": "Impossible d’importer l’équipe. Ce qui a été créé avant l’échec est conservé.",
  "agentTeam.problem.json": "Ce n’est pas un fichier d’équipe : le JSON n’est pas valide.",
  "agentTeam.problem.format": "Ce n’est pas un fichier d’équipe.",
  "agentTeam.problem.version": "Le fichier provient d’une version plus récente et ne peut pas être lu.",
  "agentTeam.problem.tooLarge": "Le fichier est trop volumineux.",
  "agentTeam.problem.name": "L’équipe n’a pas de nom valide.",
  "agentTeam.problem.sections": "Le fichier n’a aucune section ou en a trop.",
  "agentTeam.problem.agents": "Le fichier contient trop d’agents.",
  "agentTeam.problem.sectionName": "Une section n’a pas de nom valide : {name}",
  "agentTeam.problem.agent": "L’agent {name} dépasse les limites.",
  "agentTeam.problem.marketplaceSkill":
    "L’agent {name} utilise une compétence du marketplace, qu’un fichier d’équipe ne peut pas contenir.",
  "agentTeam.problem.duplicate": "Deux agents s’appellent {name}.",
  "agentTeam.manage.title": "Équipes",
  "agentTeam.manage.description":
    "Une équipe a un responsable. Les membres échangent librement entre eux. Seul le responsable écrit aux agents extérieurs à l’équipe, et les agents extérieurs joignent l’équipe par son responsable.",
  "agentTeam.manage.empty":
    "Aucune équipe pour l’instant. Les agents qui ne sont dans aucune équipe ne sont pas limités.",
  "agentTeam.manage.new": "Nouvelle équipe",
  "agentTeam.manage.edit": "Modifier",
  "agentTeam.manage.delete": "Supprimer",
  "agentTeam.manage.back": "Retour",
  "agentTeam.manage.name": "Nom de l’équipe",
  "agentTeam.manage.lead": "Responsable",
  "agentTeam.manage.members": "Membres",
  "agentTeam.manage.ranks": "Rangs",
  "agentTeam.manage.ranksPlaceholder": "Senior, Junior, Stagiaire",
  "agentTeam.manage.ranksHint":
    "Le plus élevé d'abord, séparés par des virgules. Le responsable est au-dessus de tous les rangs. Un membre écrit à son rang et aux rangs inférieurs, et vers le haut seulement au rang directement supérieur.",
  "agentTeam.manage.rankOf": "Rang de {agent}",
  "agentTeam.manage.noRank": "Sans rang",
  "agentTeam.manage.save": "Enregistrer",
  "agentTeam.manage.saving": "Enregistrement…",
  "agentTeam.manage.summary": "Responsable : {lead}. Membres : {count}.",
  "agentTeam.manage.saveFailed": "Impossible d’enregistrer l’équipe.",
  "agentTeam.manage.deleteFailed": "Impossible de supprimer l’équipe.",
  "agentTeam.manage.loadFailed": "Impossible de charger les équipes.",
} as const satisfies PartialTranslation<typeof source>;
