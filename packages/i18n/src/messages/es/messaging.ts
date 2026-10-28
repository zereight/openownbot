import type { PartialTranslation } from "../../message";
import type { messages as source } from "../en/messaging";

export const messages = {
  "messaging.help.invalid_token":
    "Slack ya no acepta zereight bot en este espacio de trabajo. Puede que se haya desinstalado. Conecta el espacio de trabajo de nuevo.",
  "messaging.help.secret_storage_unavailable":
    "zereight bot no puede leer los tokens guardados en este equipo. Desconecta el espacio de trabajo y vuelve a conectarlo.",
  "messaging.help.relay_unavailable":
    "zereight bot no puede recibir eventos de Slack en este equipo. Inicia sesión, asigna un nombre a este equipo en los ajustes del servidor y mantén zereight bot abierto.",
  "messaging.discordHelp.invalid_token":
    "Discord ya no acepta zereight bot en este servidor de Discord. Puede que se haya eliminado. Conecta el servidor de Discord de nuevo.",
  "messaging.discordHelp.secret_storage_unavailable":
    "zereight bot no puede leer los tokens guardados en este equipo. Desconecta el servidor de Discord y vuelve a conectarlo.",
  "messaging.discordHelp.relay_unavailable":
    "zereight bot no puede recibir eventos de Discord en este equipo. Inicia sesión, asigna un nombre a este equipo en los ajustes del servidor y mantén zereight bot abierto.",
} as const satisfies PartialTranslation<typeof source>;
