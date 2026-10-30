import type { PartialTranslation } from "../../message";
import type { messages as source } from "../en/agentSection";

export const messages = {
  "agentSection.export.done": "{count} agents enregistrés dans {file}.",
  "agentSection.export.masked": "Des valeurs ressemblant à des secrets ont été masquées dans {count} agents.",
  "agentSection.export.failed": "Impossible d’exporter les sections.",
  "agentSection.import.title": "Importer {name}",
  "agentSection.import.summary": "{agents} agents seront créés dans {sections} sections.",
  "agentSection.import.renamed": "{count} noms sont déjà pris et recevront un numéro.",
  "agentSection.import.contents": "Ils comportent ensemble {skills} compétences et {routines} routines.",
  "agentSection.import.safety":
    "Les compétences démarrent désactivées et les routines en pause. Les agents existants ne sont pas modifiés.",
  "agentSection.import.action": "Importer les sections",
  "agentSection.import.pending": "Importation…",
  "agentSection.import.done": "{count} agents importés.",
  "agentSection.import.failed": "Impossible d’importer les sections. Ce qui a été créé avant l’échec est conservé.",
  "agentSection.problem.json": "Ce n’est pas un fichier de sections : le JSON n’est pas valide.",
  "agentSection.problem.format": "Ce n’est pas un fichier de sections.",
  "agentSection.problem.version": "Le fichier provient d’une version plus récente et ne peut pas être lu.",
  "agentSection.problem.tooLarge": "Le fichier est trop volumineux.",
  "agentSection.problem.name": "Le fichier n’a pas de nom valide.",
  "agentSection.problem.sections": "Le fichier n’a aucune section ou en a trop.",
  "agentSection.problem.agents": "Le fichier contient trop d’agents.",
  "agentSection.problem.sectionName": "Une section n’a pas de nom valide : {name}",
  "agentSection.problem.agent": "L’agent {name} dépasse les limites.",
  "agentSection.problem.marketplaceSkill":
    "L’agent {name} utilise une compétence du marketplace, qu’un fichier de sections ne peut pas contenir.",
  "agentSection.problem.duplicate": "Deux agents s’appellent {name}.",
} as const satisfies PartialTranslation<typeof source>;
