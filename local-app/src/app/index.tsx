import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { UtensilsCrossed, Sparkles, Camera, BarChart3 } from 'lucide-react-native';
import { Pressable } from 'react-native';
import { Text } from '@/components/ui/text';

const FEATURES = [
  { icon: Sparkles, title: 'AI智能膳食', desc: 'DeepSeek定制一日三餐' },
  { icon: Camera, title: '拍照记餐', desc: 'AI识别估算营养' },
  { icon: BarChart3, title: '数据看板', desc: '热量营养趋势追踪' },
];

export default function LandingScreen() {
  const router = useRouter();
  return (
    <View className="flex-1 bg-background">
      <LinearGradient
        colors={['#38764A', '#4a9263']}
        style={{ paddingTop: 80, paddingBottom: 40, paddingHorizontal: 24 }}
      >
        <View className="flex-row items-center gap-3">
          <View className="w-14 h-14 rounded-2xl bg-white/20 items-center justify-center">
            <UtensilsCrossed size={30} color="#fff" />
          </View>
          <View>
            <Text className="text-3xl font-bold text-white">食光</Text>
            <Text className="text-sm text-white/80">让每一餐都营养有光</Text>
          </View>
        </View>
        <Text className="text-white/90 text-base mt-6 leading-6">
          个性化食谱 · AI生图配图 · 烹饪动图 · 拟真音效{'\n'}全方位营养膳食管理，吃得更科学
        </Text>
      </LinearGradient>

      <View className="flex-1 px-6 pt-8 gap-4">
        {FEATURES.map((f) => (
          <View
            key={f.title}
            className="flex-row items-center gap-4 bg-card rounded-2xl p-4 border border-border"
            style={{ borderCurve: 'continuous' }}
          >
            <View className="w-12 h-12 rounded-xl bg-secondary items-center justify-center">
              <f.icon size={24} color="#38764A" />
            </View>
            <View className="flex-1">
              <Text className="text-base font-semibold text-foreground">{f.title}</Text>
              <Text className="text-sm text-muted-foreground">{f.desc}</Text>
            </View>
          </View>
        ))}
      </View>

      <View className="px-6 pb-10 gap-3">
        <Pressable
          onPress={() => router.push('/(auth)/sign-in')}
          className="bg-primary rounded-2xl h-14 items-center justify-center active:opacity-90"
          style={{ borderCurve: 'continuous' }}
        >
          <Text className="text-primary-foreground text-lg font-semibold">开始使用</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/(auth)/sign-in')}
          className="items-center py-2"
        >
          <Text className="text-muted-foreground text-sm">已有账号？立即登录</Text>
        </Pressable>
      </View>
    </View>
  );
}