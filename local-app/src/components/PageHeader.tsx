import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { Pressable } from 'react-native';
import { Text } from '@/components/ui/text';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  right?: React.ReactNode;
}

export function PageHeader({ title, subtitle, showBack = true, right }: PageHeaderProps) {
  const router = useRouter();
  return (
    <View className="flex-row items-center px-4 pb-3 pt-2">
      {showBack && (
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 items-center justify-center rounded-full active:bg-muted mr-1"
          hitSlop={8}
        >
          <ChevronLeft size={26} color="#242220" />
        </Pressable>
      )}
      <View className="flex-1">
        <Text className="text-xl font-bold text-foreground">{title}</Text>
        {subtitle ? (
          <Text className="text-xs text-muted-foreground">{subtitle}</Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}