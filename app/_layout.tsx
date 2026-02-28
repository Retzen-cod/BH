import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import { ShareIntentProvider } from 'expo-share-intent';

export default function RootLayout() {

  return (
    <ShareIntentProvider>
    <GestureHandlerRootView style={styles.root}>
      <Stack>
        <Stack.Screen
          name="index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="patient/[id]"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="templates"
          options={{ headerShown: false }}
        />
      </Stack>
    </GestureHandlerRootView>
    </ShareIntentProvider>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
