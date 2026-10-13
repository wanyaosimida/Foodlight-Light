import { Stack } from 'expo-router';

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="meal-generator" />
      <Stack.Screen name="meal-record" />
      <Stack.Screen name="recipe" />
      <Stack.Screen name="cooking" />
      <Stack.Screen name="fridge-clearance" />
      <Stack.Screen name="takeout-advisor" />
      <Stack.Screen name="glycemic-advisor" />
      <Stack.Screen name="body-avatar" />
    </Stack>
  );
}