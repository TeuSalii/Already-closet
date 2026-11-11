import Svg, { Circle, Line, Path } from "react-native-svg";

// The app's icons, all drawn the Lucide way (24 × 24, 2 px stroke, round
// ends) so they look alike. Kept here instead of imported from
// lucide-react-native: a development build would load all of its 2,000
// icon files, half of the app's code, for the few used.

export type IconProps = { size?: number; color?: string };

// Restart: an arrow turning back to the start. From restart.svg.
export function RestartIcon({ size = 24, color = "black" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6.58557 16.0609C7.43789 17.1973 8.62616 18.0368 9.98207 18.4603C11.338 18.8839 12.7928 18.8701 14.1404 18.4209C15.488 17.9717 16.6602 17.1098 17.4908 15.9574C18.3214 14.805 18.7683 13.4205 18.7683 12C18.7683 10.3845 18.1265 8.83511 16.9842 7.69275C15.8418 6.5504 14.2925 5.90863 12.6769 5.90863C10.8766 5.90863 9.2387 6.63959 8.06104 7.81726L5.23193 10.6464"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M5.23193 5.23181V10.6464H10.6465" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// The two below are copied from Lucide (ISC licence, © Lucide Icons and
// Contributors).

export function ScissorsLineDashedIcon({ size = 24, color = "black" }: IconProps) {
  const line = { stroke: color, strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5.42 9.42 8 12" {...line} />
      <Circle cx="4" cy="8" r="2" {...line} />
      <Path d="m14 6-8.58 8.58" {...line} />
      <Circle cx="4" cy="16" r="2" {...line} />
      <Path d="M10.8 14.8 14 18" {...line} />
      <Path d="M16 12h-2" {...line} />
      <Path d="M22 12h-2" {...line} />
    </Svg>
  );
}

export function FrameIcon({ size = 24, color = "black" }: IconProps) {
  const line = { stroke: color, strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1="22" x2="2" y1="6" y2="6" {...line} />
      <Line x1="22" x2="2" y1="18" y2="18" {...line} />
      <Line x1="6" x2="6" y1="2" y2="22" {...line} />
      <Line x1="18" x2="18" y1="2" y2="22" {...line} />
    </Svg>
  );
}
