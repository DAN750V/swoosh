import 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import OnboardingScreen from './screens/OnboardingScreen';
import SwipeScreen from './screens/SwipeScreen';
import SummaryScreen from './screens/SummaryScreen';
import DeletionReviewScreen from './screens/DeletionReviewScreen';

export type AssetParam = { id: string; uri: string; localUri?: string };

export type RootStackParamList = {
  Onboarding: undefined;
  Swipe: { dailyLimit: number };
  Summary: { kept: number; deleted: number; deletedAssets: AssetParam[] };
  DeletionReview: { assets: AssetParam[] };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer>
          <Stack.Navigator
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: '#0a0a0a' },
            }}
          >
            <Stack.Screen name="Onboarding" component={OnboardingScreen} />
            <Stack.Screen
              name="Swipe"
              component={SwipeScreen}
              options={{ gestureEnabled: false, animation: 'fade' }}
            />
            <Stack.Screen
              name="Summary"
              component={SummaryScreen}
              options={{ animation: 'fade' }}
            />
            <Stack.Screen
              name="DeletionReview"
              component={DeletionReviewScreen}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
