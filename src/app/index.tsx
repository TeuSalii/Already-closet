import { Redirect } from "expo-router";

// The (tabs) group now handles the root route.
export default function Root() {
  return <Redirect href="/(tabs)" />;
}
