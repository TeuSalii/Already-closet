import Svg, { Path } from "react-native-svg";

// Icons that are not in Lucide, drawn the Lucide way (24 × 24, 2 px stroke,
// round ends) so they sit next to Lucide icons without looking different.

// Restart: an arrow turning back to the start. From restart.svg.
export function RestartIcon({ size = 24, color = "black" }: { size?: number; color?: string }) {
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
