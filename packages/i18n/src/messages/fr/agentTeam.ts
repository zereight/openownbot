import type { PartialTranslation } from "../../message";
import type { messages as source } from "../en/agentTeam";

export const messages = {
  "agentTeam.export.done": "{count} agents enregistrés dans {file}.",
  "agentTeam.export.masked": "Des valeurs ressemblant à des secrets ont été masquées dans {count} agents.",
  "agentTeam.export.failed": "Impossible d’exporter les sections.",
  "agentTeam.import.title": "Importer {name}",
  "agentTeam.import.summary": "{agents} agents seront créés dans {sections} sections.",
  "agentTeam.import.renamed": "{count} noms sont déjà pris et recevront un numéro.",
  "agentTeam.import.contents": "Ils comportent ensemble {skills} compétences et {routines} routines.",
  "agentTeam.import.safety":
    "Les compétences démarrent désactivées et les routines en pause. Les agents existants ne sont pas modifiés.",
  "agentTeam.import.action": "Importer les sections",
  "agentTeam.import.pending": "Importation…",
  "agentTeam.import.done": "{count} agents importés.",
  "agentTeam.import.failed": "Impossible d’importer les sections. Ce qui a été créé avant l’échec est conservé.",
  "agentTeam.problem.json": "Ce n’est pas un fichier de sections : le JSON n’est pas valide.",
  "agentTeam.problem.format": "Ce n’est pas un fichier de sections.",
  "agentTeam.problem.version": "Le fichier provient d’une version plus récente et ne peut pas être lu.",
  "agentTeam.problem.tooLarge": "Le fichier est trop volumineux.",
  "agentTeam.problem.name": "Le fichier n’a pas de nom valide.",
  "agentTeam.problem.sections": "Le fichier n’a aucune section ou en a trop.",
  "agentTeam.problem.agents": "Le fichier contient trop d’agents.",
  "agentTeam.problem.sectionName": "Une section n’a pas de nom valide : {name}",
  "agentTeam.problem.agent": "L’agent {name} dépasse les limites.",
  "agentTeam.problem.marketplaceSkill":
    "L’agent {name} utilise une compétence du marketplace, qu’un fichier de sections ne peut pas contenir.",
  "agentTeam.problem.duplicate": "Deux agents s’appellent {name}.",
} as const satisfies PartialTranslation<typeof source>;
