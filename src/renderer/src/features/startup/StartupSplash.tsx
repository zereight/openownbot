import { AppLogo, type AppLogoVariant } from "@robot/brand";
import { useText } from "@robot/ui/text";
import { createEffect, createSignal, onSettled } from "solid-js";

// The fade takes the overlay duration. If no `animationend` comes, the splash ends this time after the
// app is ready, so it cannot cover the app.
const EXIT_LIMIT_MS = 1500;
const EXIT_ANIMATION = "startup-splash-exit";
// The splash does not fade before the eyes have popped in, so a fast start does not show a half-drawn logo.
const INTRO_ANIMATION = "startup-splash-eye-draw";

interface StartupSplashProps {
  variant: AppLogoVariant;
  /** The app is ready: the splash fades out. Remove it in `onExited`. */
  ready: boolean;
  onExited?: () => void;
}

/**
 * The desktop window's first screen: the logo shows its padlock eyes and blinks until the app is ready. The
 * fade starts when the app is ready and the eyes have popped in.
 */
export function StartupSplash(props: StartupSplashProps) {
  const { t } = useText();
  let root: HTMLElement | undefined;
  let exitTimer: ReturnType<typeof setTimeout> | undefined;
  let exited = false;
  const [introDone, setIntroDone] = createSignal(false);
  const exiting = () => props.ready && introDone();

  function finishExit(): void {
    if (exited) return;
    exited = true;
    clearTimeout(exitTimer);
    props.onExited?.();
  }

  // With reduced motion, without the stylesheet, or in a test DOM, the eyes do not animate: no wait.
  onSettled(() => {
    const eye = root?.querySelector(".app-logo-eye");
    if (!eye || !getComputedStyle(eye).animationName.includes(INTRO_ANIMATION)) setIntroDone(true);
  });

  createEffect(
    () => props.ready,
    (ready) => {
      if (!ready) return;
      exitTimer ??= setTimeout(finishExit, EXIT_LIMIT_MS);
      return () => clearTimeout(exitTimer);
    },
  );

  createEffect(exiting, (exit) => {
    // Without the stylesheet, or in a test DOM, the exit does not animate: end the splash now.
    if (exit && root && !getComputedStyle(root).animationName.includes(EXIT_ANIMATION)) queueMicrotask(finishExit);
  });

  function handleAnimationEnd(event: AnimationEvent): void {
    if (event.animationName === INTRO_ANIMATION) setIntroDone(true);
    else if (event.animationName === EXIT_ANIMATION && event.target === event.currentTarget) finishExit();
  }

  return (
    <main
      ref={(element) => {
        root = element;
      }}
      class="startup-splash"
      data-phase={exiting() ? "exit" : "loading"}
      role="status"
      aria-label={t("app.loading")}
      aria-busy={exiting() ? "false" : "true"}
      onAnimationEnd={handleAnimationEnd}
      // Reduce motion turned on during the intro cancels it: the eyes are then shown in full.
      onAnimationCancel={(event) => {
        if (event.animationName === INTRO_ANIMATION) setIntroDone(true);
      }}
    >
      <AppLogo variant={props.variant} class="startup-splash-logo" />
    </main>
  );
}
