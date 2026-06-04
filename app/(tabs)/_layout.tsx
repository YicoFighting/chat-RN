import { Tabs } from 'expo-router';
import { MessageSquare, Settings } from 'lucide-react-native';
import { useColorScheme } from 'react-native';

export default function TabsLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <Tabs
      screenOptions={{
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: isDark ? '#0D0D0D' : '#FFFFFF',
          borderTopWidth: 0.5,
          borderTopColor: isDark ? '#262626' : '#E5E5E5',
          elevation: 0,
          shadowOpacity: 0,
          height: 60,
        },
        tabBarActiveTintColor: isDark ? '#FFFFFF' : '#000000',
        tabBarInactiveTintColor: isDark ? '#525252' : '#A3A3A3',
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ color, size }) => (
            <MessageSquare color={color} size={22} />
          ),
        }}
      />
      <Tabs.Screen
        name="setting"
        options={{
          tabBarIcon: ({ color, size }) => (
            <Settings color={color} size={22} />
          ),
        }}
      />
    </Tabs>
  );
}
