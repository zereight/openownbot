import type { PartialTranslation } from "../../../message";
import type { messages as source } from "../../en/error/update";

export const messages = {
  // Updater state the user reads.
  "error.update.unsupported":
    "Les mises à jour sont disponibles dans les versions installées de l’application de bureau.",
  "error.update.notReady": "Une mise à jour n’est pas prête à être installée.",
  "error.update.restartFailed": "zereight bot n’a pas pu redémarrer pour installer la mise à jour.",
  "error.update.downloadStalled": "Le téléchargement de la mise à jour ne répond plus. Réessayez.",
  "error.update.installFailed":
    "Impossible d’installer la mise à jour. Quittez puis rouvrez zereight bot, et réessayez.",
  "error.update.downloadFailed": "Impossible de télécharger la mise à jour. Réessayez.",
  "error.update.checkFailed": "Impossible de rechercher des mises à jour. Réessayez.",
  "error.update.checkStalled": "La recherche de mise à jour ne répond plus. Réessayez.",
  "error.update.checkOffline":
    "Impossible de joindre le service de mise à jour. Vérifiez votre connexion Internet, puis réessayez.",
  "error.update.checkUnavailable":
    "Le service de mise à jour n’a pas répondu. zereight bot réessaiera de lui-même dans quelques minutes.",
  "error.update.checkNoRelease":
    "Aucune mise à jour publiée n’a été trouvée pour cette plateforme. zereight bot réessaiera de lui-même dans quelques minutes.",
  "error.update.managedByNix":
    "Nix installe les mises à jour de cette copie d’zereight bot. Mettez-la à jour avec Nix.",
  "error.update.managedByHost":
    "Sur ce Mac, l’hôte installe les mises à jour. La mise à jour reste prête jusqu’à la maintenance de l’hôte.",
  "error.update.siblingSession":
    "Une autre session zereight bot utilise encore cette application. Quittez d’abord zereight bot dans tous les autres comptes utilisateur macOS, puis installez de nouveau la mise à jour.",
  "error.update.siblingSessionSameAccount":
    "Un autre processus zereight bot est toujours en cours d’exécution dans ce compte utilisateur. Quittez-le, puis installez à nouveau la mise à jour.",
  "error.update.siblingCheckFailed":
    "Impossible de vérifier les autres sessions zereight bot. Réessayez avant l’installation.",
  "error.update.remoteDisabled": "Les mises à jour des administrateurs du serveur sont désactivées sur cet ordinateur.",
  "error.update.restartStarted": "zereight bot redémarre déjà pour installer la mise à jour.",
  "error.update.alreadyRestarting": "zereight bot redémarre déjà.",
} as const satisfies PartialTranslation<typeof source>;
