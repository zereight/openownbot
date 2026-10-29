import { Pressable, View } from "react-native";
import Animated from "react-native-reanimated";
import Svg, { Circle, Ellipse, G, Path, Rect } from "react-native-svg";
import { useCSSVariable } from "uniwind";

import { type AppLogoAnimation, useAppLogoMotion } from "@/features/auth/components/use-app-logo-motion";
import { useText } from "@/shared/lib/text";

export interface AppLogoProps {
  animation?: AppLogoAnimation;
  interactive?: boolean;
  size?: number;
}

const VIEWBOX_SIZE = 240;
/** The face is drawn in a 64-unit square: `FACE_SCALE` maps it to the viewBox. */
const FACE_SCALE = VIEWBOX_SIZE / 64;
const LEFT_EYE_CENTER_X = 18.5 * FACE_SCALE;
const RIGHT_EYE_CENTER_X = 45.5 * FACE_SCALE;
const EYE_CENTER_Y = 31 * FACE_SCALE;
const LOCK_Y = 27.5 * FACE_SCALE;
const SHACKLE = "M-4 0V-4.5A4 4 0 0 1 4 -4.5V0";
const BODY = "M-4.5 -1.5H4.5A3.5 3.5 0 0 1 8 2V5A6 6 0 0 1 2 11H-2A6 6 0 0 1 -8 5V2A3.5 3.5 0 0 1 -4.5 -1.5Z";
const CHEEK_COLOR = "#ee8e78";

function Padlock({ centerX, ink, hole }: { centerX: number; ink: string; hole: string }) {
  return (
    <G transform={`translate(${centerX} ${LOCK_Y}) scale(${FACE_SCALE})`}>
      <Path d={SHACKLE} fill="none" stroke={ink} strokeLinecap="round" strokeWidth={3.4} />
      <Path d={BODY} fill={ink} />
      <Circle cx={0} cy={4.4} r={1.9} fill={hole} />
    </G>
  );
}

function resolveColor(value: string | number | undefined, fallback: string): string {
  return String(value ?? fallback);
}

export function AppLogo({ animation = "none", interactive = false, size = VIEWBOX_SIZE }: AppLogoProps) {
  const { t } = useText();
  const backgroundColor = resolveColor(useCSSVariable("--openownbot-logo-production"), "#d6adf2");
  const eyeColor = resolveColor(useCSSVariable("--openownbot-logo-eye"), "#040007");
  const { handlePressIn, leftEyeAnimatedStyle, rightEyeAnimatedStyle } = useAppLogoMotion({ animation, size });
  const eyeLayerStyle = {
    height: size,
    left: 0,
    position: "absolute" as const,
    top: 0,
    width: size,
  };

  const logo = (
    <View
      style={{ height: size, width: size }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width={size} height={size} viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}>
        <Rect width={VIEWBOX_SIZE} height={VIEWBOX_SIZE} rx={50} ry={50} fill={backgroundColor} />
        <G transform={`scale(${FACE_SCALE})`}>
          <Ellipse cx={10.5} cy={41.5} rx={3.8} ry={2.2} fill={CHEEK_COLOR} opacity={0.75} />
          <Ellipse cx={53.5} cy={41.5} rx={3.8} ry={2.2} fill={CHEEK_COLOR} opacity={0.75} />
          <Path d="M28 44.5Q32 48.7 36 44.5" fill="none" stroke={eyeColor} strokeLinecap="round" strokeWidth={2.6} />
        </G>
      </Svg>

      <Animated.View
        pointerEvents="none"
        style={[
          eyeLayerStyle,
          { transformOrigin: [(LEFT_EYE_CENTER_X * size) / VIEWBOX_SIZE, (EYE_CENTER_Y * size) / VIEWBOX_SIZE, 0] },
          leftEyeAnimatedStyle,
        ]}
      >
        <Svg width={size} height={size} viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}>
          <Padlock centerX={LEFT_EYE_CENTER_X} ink={eyeColor} hole={backgroundColor} />
        </Svg>
      </Animated.View>

      <Animated.View
        pointerEvents="none"
        style={[
          eyeLayerStyle,
          { transformOrigin: [(RIGHT_EYE_CENTER_X * size) / VIEWBOX_SIZE, (EYE_CENTER_Y * size) / VIEWBOX_SIZE, 0] },
          rightEyeAnimatedStyle,
        ]}
      >
        <Svg width={size} height={size} viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}>
          <Padlock centerX={RIGHT_EYE_CENTER_X} ink={eyeColor} hole={backgroundColor} />
        </Svg>
      </Animated.View>
    </View>
  );

  if (!interactive) return logo;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("mobile.auth.logo.animate")}
      accessibilityHint={t("mobile.auth.logo.animateHint")}
      onPressIn={handlePressIn}
      pressRetentionOffset={12}
    >
      {logo}
    </Pressable>
  );
}
