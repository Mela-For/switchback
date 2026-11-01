import './src/config/sentry';
import * as Sentry from '@sentry/react-native';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useFonts, Bitter_600SemiBold } from '@expo-google-fonts/bitter';
import {
  Karla_400Regular,
  Karla_500Medium,
  Karla_600SemiBold,
  Karla_700Bold,
} from '@expo-google-fonts/karla';
import { IBMPlexMono_400Regular } from '@expo-google-fonts/ibm-plex-mono';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthProvider, useAuthContext } from './src/context/AuthContext';
import { TripsProvider } from './src/context/TripsContext';
import { TripHistoryProvider } from './src/context/TripHistoryContext';
import SignInScreen from './src/screens/SignInScreen';
import SignUpScreen from './src/screens/SignUpScreen';
import TripsListScreen from './src/screens/TripsListScreen';
import NewTripScreen from './src/screens/NewTripScreen';
import MyHistoryScreen from './src/screens/MyHistoryScreen';
import TripDetailScreen from './src/screens/TripDetailScreen';
import EditPackingListScreen from './src/screens/EditPackingListScreen';
import PlacesSearchScreen from './src/screens/PlacesSearchScreen';
import BrowseTrailsScreen from './src/screens/BrowseTrailsScreen';
import TripMapScreen from './src/screens/TripMapScreen';
import MyAssignmentsScreen from './src/screens/MyAssignmentsScreen';
import TripItineraryScreen from './src/screens/TripItineraryScreen';
import TripSleepingScreen from './src/screens/TripSleepingScreen';
import TripChatScreen from './src/screens/TripChatScreen';
import type { AuthStackParamList, TripsStackParamList, TabParamList } from './src/types/navigation';
import { colors, fontFamily } from './src/constants/theme';
import { Icon, IconButton, type IconName } from './src/components/ui';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const TripsStack = createNativeStackNavigator<TripsStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const headerScreenOptions = {
  headerStyle: { backgroundColor: colors.primary },
  headerTintColor: colors.textInverse,
  headerTitleStyle: { fontFamily: fontFamily.bodySemiBold, fontSize: 18 },
  headerBackTitleStyle: { fontFamily: fontFamily.body },
} as const;

/** Shared "open trip chat" header-right button, used by every trip-detail-flow screen. */
function ChatHeaderButton({
  navigation,
  tripId,
}: {
  navigation: NativeStackNavigationProp<TripsStackParamList>;
  tripId: string;
}) {
  return (
    <IconButton
      icon="message-circle"
      label="Trip chat"
      variant="ghost"
      size="sm"
      onPress={() => navigation.navigate('TripChat', { tripId })}
    />
  );
}

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="SignIn" component={SignInScreen} />
      <AuthStack.Screen name="SignUp" component={SignUpScreen} />
    </AuthStack.Navigator>
  );
}

/** Header CTA shown on the (public) Browse Places tab when signed out. */
function LoginHeaderButton({ navigation }: { navigation: BottomTabNavigationProp<TabParamList> }) {
  return (
    <Pressable
      onPress={() => navigation.navigate('TripsTab')}
      style={styles.loginButton}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Log in or sign up"
    >
      <Icon name="log-in" size={16} color={colors.textInverse} />
      <Text style={styles.loginButtonText}>Log in / Sign up</Text>
    </Pressable>
  );
}

/** My Trips tab: requires sign-in — shows the auth flow instead of the trips stack until signed in. */
function TripsTabNavigator() {
  const { currentUser } = useAuthContext();
  return currentUser ? <TripsStackNavigator /> : <AuthNavigator />;
}

function TripsStackNavigator() {
  return (
    <TripsStack.Navigator initialRouteName="TripsList" screenOptions={headerScreenOptions}>
      <TripsStack.Screen name="TripsList" component={TripsListScreen} options={{ title: 'My Trips' }} />
      <TripsStack.Screen name="NewTrip" component={NewTripScreen} options={{ title: 'New Trip' }} />
      <TripsStack.Screen name="MyHistory" component={MyHistoryScreen} options={{ title: 'My History' }} />
      <TripsStack.Screen
        name="TripDetail"
        component={TripDetailScreen}
        options={({ navigation, route }) => ({
          headerBackTitle: 'Back',
          headerBackButtonMenuEnabled: false,
          headerRight: () => <ChatHeaderButton navigation={navigation} tripId={route.params.tripId} />,
        })}
      />
      <TripsStack.Screen
        name="EditPackingList"
        component={EditPackingListScreen}
        options={({ navigation, route }) => ({
          title: 'Packing list',
          headerBackTitle: 'Back',
          headerRight: () => <ChatHeaderButton navigation={navigation} tripId={route.params.tripId} />,
        })}
      />
      <TripsStack.Screen
        name="TripMap"
        component={TripMapScreen}
        options={({ navigation, route }) => ({
          title: 'Trip Map',
          headerBackTitle: 'Back',
          headerRight: () => <ChatHeaderButton navigation={navigation} tripId={route.params.tripId} />,
        })}
      />
      <TripsStack.Screen
        name="MyAssignments"
        component={MyAssignmentsScreen}
        options={({ navigation, route }) => ({
          title: 'Assignments',
          headerBackTitle: 'Back',
          headerRight: () => <ChatHeaderButton navigation={navigation} tripId={route.params.tripId} />,
        })}
      />
      <TripsStack.Screen
        name="TripItinerary"
        component={TripItineraryScreen}
        options={({ navigation, route }) => ({
          title: 'Itinerary',
          headerBackTitle: 'Back',
          headerRight: () => <ChatHeaderButton navigation={navigation} tripId={route.params.tripId} />,
        })}
      />
      <TripsStack.Screen
        name="TripSleeping"
        component={TripSleepingScreen}
        options={({ navigation, route }) => ({
          title: "Where We're Sleeping",
          headerBackTitle: 'Back',
          headerRight: () => <ChatHeaderButton navigation={navigation} tripId={route.params.tripId} />,
        })}
      />
      <TripsStack.Screen name="TripChat" component={TripChatScreen} options={{ title: 'Trip Chat', headerBackTitle: 'Back' }} />
    </TripsStack.Navigator>
  );
}

const TAB_ICONS: Record<keyof TabParamList, IconName> = {
  PlacesTab: 'search',
  TrailsTab: 'signpost',
  TripsTab: 'map',
};

function MainTabs() {
  const { currentUser } = useAuthContext();

  return (
    <TripsProvider>
      <TripHistoryProvider>
        <Tab.Navigator
          initialRouteName="PlacesTab"
          screenOptions={({ route }) => ({
            tabBarIcon: ({ color, size }) => (
              <Icon name={TAB_ICONS[route.name as keyof TabParamList]} color={color} size={size} />
            ),
            tabBarActiveTintColor: colors.primary,
            tabBarInactiveTintColor: colors.textTertiary,
            tabBarStyle: { backgroundColor: colors.surfacePage, borderTopColor: colors.borderSubtle },
            tabBarLabelStyle: { fontFamily: fontFamily.bodySemiBold, fontSize: 11 },
            headerShown: false,
          })}
        >
          <Tab.Screen
            name="PlacesTab"
            component={PlacesSearchScreen}
            options={({ navigation }) => ({
              title: 'Browse Places',
              headerShown: true,
              ...headerScreenOptions,
              headerRight: currentUser ? undefined : () => <LoginHeaderButton navigation={navigation} />,
            })}
          />
          <Tab.Screen
            name="TrailsTab"
            component={BrowseTrailsScreen}
            options={{ title: 'Browse Trails', headerShown: true, ...headerScreenOptions }}
          />
          <Tab.Screen name="TripsTab" component={TripsTabNavigator} options={{ title: 'My Trips' }} />
        </Tab.Navigator>
      </TripHistoryProvider>
    </TripsProvider>
  );
}

function RootNavigator() {
  const { loading } = useAuthContext();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.surfaceApp }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return <MainTabs />;
}

function App() {
  const [fontsLoaded] = useFonts({
    Bitter_600SemiBold,
    Karla_400Regular,
    Karla_500Medium,
    Karla_600SemiBold,
    Karla_700Bold,
    IBMPlexMono_400Regular,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.surfaceApp }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <AuthProvider>
      <NavigationContainer>
        <RootNavigator />
        <StatusBar style="dark" />
      </NavigationContainer>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  loginButtonText: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 13,
    color: colors.textInverse,
  },
});

export default Sentry.wrap(App);
