import { Alert, AlertActions, AlertContent, AlertDescription, AlertIcon, AlertTitle, Button, Moon } from "@robot/ui";
import { useText } from "../../text";
import type { HostedUpsellHost } from "./hosted-server-upsell-host";

export interface HostedServerUpsellNoticeProps {
  /** The active routines that stop when the computer is off. */
  count: number;
  host: HostedUpsellHost;
  onSeePlans: () => void;
  onDismiss: () => void;
}

/** The offer of a hosted server at the routine list, while routines depend on a computer. */
export function HostedServerUpsellNotice(props: HostedServerUpsellNoticeProps) {
  const { t } = useText();
  const title = () => {
    const host = props.host;
    return host === "this-computer"
      ? t("server.upsell.notice.title.local", { count: props.count })
      : t("server.upsell.notice.title.remote", { count: props.count, server: host.name });
  };
  return (
    <Alert class="hosted-upsell-notice" role="status" report={false}>
      <AlertIcon>
        <Moon />
      </AlertIcon>
      <AlertContent>
        <AlertTitle>{title()}</AlertTitle>
        <AlertDescription>{t("server.upsell.notice.description")}</AlertDescription>
        <AlertActions>
          <Button size="sm" onClick={() => props.onSeePlans()}>
            {t("server.upsell.seePlans")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => props.onDismiss()}>
            {t("server.upsell.notNow")}
          </Button>
        </AlertActions>
      </AlertContent>
    </Alert>
  );
}
