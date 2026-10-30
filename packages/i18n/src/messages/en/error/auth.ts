import { defineMessages } from "../../../message";

export const messages = defineMessages("error.auth", {
  // Errors from the ROBot account service.
  "error.auth.serviceUnavailable":
    "ROBot could not reach the account service. Check that the API is running, then try again.",
  "error.auth.networkBlocked":
    "A firewall or proxy on this network blocked ROBot from reaching {host}. Ask your network administrator to allow {host}, then try again.",
  "error.auth.signInFirst": "Sign in to ROBot first.",
  "error.auth.signInRequired": "Sign in is required.",
  "error.auth.accountChangedDuringRegister": "The signed-in account changed while this server was being registered.",
  "error.auth.hostCredentialUnavailable": "The remote host credential is unavailable. Register the host again.",
  "error.auth.codeNotVerified": "The sign-in code could not be verified.",
  "error.auth.serviceError": "The account service returned an error.",
  "error.auth.serviceUnreachable": "ROBot could not reach the account service. Check your connection, then try again.",
  "error.auth.serviceTimeout": "The account service did not answer in time. Try again.",
  "error.auth.serviceStatus": "The account service returned an error ({status}). Try again later.",
  "error.auth.invalidHostedServer": "The account service returned an invalid hosted server.",
  "error.auth.codeNotSent": "ROBot could not send the sign-in code.",
  "error.auth.deliveryTimeout":
    "ROBot could not confirm delivery in time. The code may still arrive; check delivery before sending again.",
  "error.auth.deliveryInterrupted":
    "The connection ended before ROBot confirmed delivery. Check delivery to avoid sending another code.",
  "error.auth.deliveryUnknown":
    "ROBot could not confirm whether the sign-in code was sent. Check delivery before sending again.",
});
