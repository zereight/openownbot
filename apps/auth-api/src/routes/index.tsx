import { createFileRoute } from "@tanstack/solid-router";
import { LandingPage } from "../components/landing/LandingPage";
import { openOwnBotHomeHead } from "../lib/site-metadata";
import { OPENOWNBOT_SOFTWARE_APPLICATION } from "../lib/software-application";

export const Route = createFileRoute("/")({
  head: () => openOwnBotHomeHead(OPENOWNBOT_SOFTWARE_APPLICATION),
  component: LandingPage,
});
