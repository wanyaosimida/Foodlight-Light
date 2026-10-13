import { useState, useCallback } from 'react';
import { View, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Camera, Sparkles, AlertTriangle, CheckCircle2, BookmarkPlus, ScanLine, Lightbulb } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { callPackageScan, addToFoodLibrary } from '@/db/api';
import type { PackageResult } from '@/types/types';
import { Text } from '@/components/ui/text';

function levelStyle(level: string) {
  if (level.includes('推荐购买')) return { color: '#38764A', bg: 'bg-primary/15', icon: CheckCircle2 };
  if (level.includes('适量')) return { color: '#D97724', bg: 'bg-accent/15', icon: AlertTriangle };
  return { color: '#DC2626', bg: 'bg-destructive/15', icon: AlertTriangle };
}

export default function PackageScanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [result, setResult] = useState<PackageResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const pickImage = useCallback(async (camera: boolean) => {
    try {
      const perm = camera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setError('需要相机/相册权限才能拍照识别');
        return;
      }
      const res = camera
        ? await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: true })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsEditing: true });
      if (!res.canceled && res.assets?.[0]) {
        setImageUri(res.assets[0].uri);
        setResult(null);
        setError('');
        setSaved(false);
      }
    } catch (e) {
      setError(String((e as Error)?.message || e));
    }
  }, []);

  const scan = useCallback(async () => {
    if (!imageUri) return;
    setLoading(true);
    setError('');
    try {
      const { fetch } = await import('expo/fetch');
      const resp = await fetch(imageUri);
      const blob = await resp.arrayBuffer();
      let base64 = '';
      const bytes = new Uint8Array(blob);
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
      }
      base64 = btoa(binary);
      const res = await callPackageScan(base64);
      if (res.error) {
        setError(res.error);
        return;
      }
      setResult(res);
    } catch (e) {
      setError(String((e as Error)?.message || e));
    } finally {
      setLoading(false);
    }
  }, [imageUri]);

  const saveToLibrary = useCallback(async () => {
    if (!result) return;
    try {
      await addToFoodLibrary({
        name: result.product_name || '未知食品',
        brand: result.brand || null,
        net_content: result.net_content || null,
        nutrition: result.nutrition as unknown as Record<string, unknown>,
        ingredients: result.ingredients || null,
        advice: result.advice || null,
        level: result.level || null,
        category: '包装食品',
      });
      setSaved(true);
    } catch (e) {
      setError(String((e as Error)?.message || e));
    }
  }, [result]);

  const ls = result ? levelStyle(result.level) : null;

  return (
    <View className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} contentInsetAdjustmentBehavior="automatic">
        <View className="flex-row items-center px-4 pt-4 pb-2" style={{ paddingTop: insets.top + 8 }}>
          <Pressable onPress={() => router.back()} className="w-10 h-10 items-center justify-center rounded-full active:bg-muted">
            <ArrowLeft size={22} color="#3F3A33" />
          </Pressable>
          <View className="flex-1 items-center">
            <Text className="text-lg font-bold text-foreground">AI 食品包装解读</Text>
          </View>
          <View className="w-10" />
        </View>

        <View className="px-4">
          <Text className="text-xs text-muted-foreground leading-5 mb-3">
            拍摄或选择食品包装背面的「营养成分表」，AI 将自动识别热量、糖钠等数据，换算为千卡，并给出通俗解读与购买建议。
          </Text>

          {/* 图片预览 / 拍照区 */}
          <View className="bg-card rounded-2xl border border-border overflow-hidden" style={{ borderCurve: 'continuous' }}>
            {imageUri ? (
              <View>
                <Image source={{ uri: imageUri }} style={{ width: '100%', height: 240 }} contentFit="cover" />
                <View className="flex-row gap-3 p-3">
                  <Pressable onPress={() => pickImage(false)} className="flex-1 bg-secondary rounded-xl py-2.5 items-center active:bg-muted">
                    <Text className="text-sm font-medium text-secondary-foreground">重新选择</Text>
                  </Pressable>
                  <Pressable onPress={() => pickImage(true)} className="flex-1 bg-secondary rounded-xl py-2.5 items-center active:bg-muted">
                    <Text className="text-sm font-medium text-secondary-foreground">重新拍照</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View className="p-8 items-center">
                <View className="w-16 h-16 rounded-full bg-primary/10 items-center justify-center mb-3">
                  <ScanLine size={30} color="#38764A" />
                </View>
                <Text className="text-sm text-muted-foreground mb-4">请拍摄清晰的包装营养成分表</Text>
                <View className="flex-row gap-3 w-full">
                  <Pressable onPress={() => pickImage(true)} className="flex-1 bg-primary rounded-xl py-3 items-center flex-row justify-center gap-1.5 active:opacity-90">
                    <Camera size={18} color="#FFFCF7" />
                    <Text className="text-sm font-semibold text-primary-foreground">拍照</Text>
                  </Pressable>
                  <Pressable onPress={() => pickImage(false)} className="flex-1 bg-secondary rounded-xl py-3 items-center active:bg-muted">
                    <Text className="text-sm font-semibold text-secondary-foreground">从相册选择</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>

          {imageUri ? (
            <Pressable onPress={scan} disabled={loading} className="mt-3 bg-primary rounded-xl py-4 items-center flex-row justify-center gap-2 active:opacity-90">
              {loading ? <ActivityIndicator color="#FFFCF7" /> : <Sparkles size={18} color="#FFFCF7" />}
              <Text className="text-base font-semibold text-primary-foreground">{loading ? 'AI 解读中...' : '开始 AI 解读'}</Text>
            </Pressable>
          ) : null}
          {error ? <Text className="text-destructive text-sm mt-2 text-center">{error}</Text> : null}
        </View>

        {/* 结果 */}
        {result && ls ? (
          <View className="mt-5 px-4">
            {/* 产品信息 + 等级 */}
            <View className={`rounded-2xl p-4 border border-border ${ls.bg}`} style={{ borderCurve: 'continuous' }}>
              <View className="flex-row items-center gap-2">
                <ls.icon size={20} color={ls.color} />
                <Text className="text-base font-bold" style={{ color: ls.color }}>{result.level}</Text>
              </View>
              <Text className="text-lg font-bold text-foreground mt-2">{result.product_name}</Text>
              <View className="flex-row gap-4 mt-1">
                {result.brand ? <Text className="text-xs text-muted-foreground">{result.brand}</Text> : null}
                {result.net_content ? <Text className="text-xs text-muted-foreground">{result.net_content}</Text> : null}
              </View>
              <Text className="text-xs text-muted-foreground mt-2 leading-5">{result.advice}</Text>
            </View>

            {/* 营养成分 */}
            <Text className="text-base font-bold text-foreground mt-5 mb-2">营养成分（每 100g）</Text>
            <View className="bg-card rounded-2xl p-4 border border-border" style={{ borderCurve: 'continuous' }}>
              <View className="flex-row flex-wrap">
                <NutriCell label="热量" value={result.nutrition.calories} unit="kcal" highlight />
                <NutriCell label="蛋白质" value={result.nutrition.protein} unit="g" />
                <NutriCell label="脂肪" value={result.nutrition.fat} unit="g" />
                <NutriCell label="碳水" value={result.nutrition.carbs} unit="g" />
                <NutriCell label="糖" value={result.nutrition.sugar} unit="g" />
                <NutriCell label="钠" value={result.nutrition.sodium} unit="mg" />
                <NutriCell label="膳食纤维" value={result.nutrition.fiber} unit="g" />
              </View>
            </View>

            {/* 通俗解读 */}
            <Text className="text-base font-bold text-foreground mt-5 mb-2">通俗解读</Text>
            <View className="bg-accent/10 rounded-2xl p-4 border border-border" style={{ borderCurve: 'continuous' }}>
              {result.translations.map((t, i) => (
                <View key={i} className="flex-row gap-2 mb-2">
                  <Lightbulb size={14} color="#D97724" />
                  <Text className="text-xs text-foreground leading-5 flex-1">{t}</Text>
                </View>
              ))}
            </View>

            {/* 风险点 */}
            {result.risk_points.length > 0 ? (
              <>
                <Text className="text-base font-bold text-foreground mt-5 mb-2">配料风险提示</Text>
                <View className="bg-destructive/5 rounded-2xl p-4 border border-border" style={{ borderCurve: 'continuous' }}>
                  {result.risk_points.map((r, i) => (
                    <View key={i} className="flex-row gap-2 mb-2">
                      <AlertTriangle size={14} color="#DC2626" />
                      <Text className="text-xs text-foreground leading-5 flex-1">{r}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            {/* 更优替代 */}
            {result.alternatives.length > 0 ? (
              <>
                <Text className="text-base font-bold text-foreground mt-5 mb-2">更健康替代</Text>
                <View className="flex-row flex-wrap gap-2">
                  {result.alternatives.map((a, i) => (
                    <View key={i} className="bg-card rounded-xl px-3 py-2 border border-border">
                      <Text className="text-sm font-medium text-foreground">{a.name}</Text>
                      <Text className="text-xs text-muted-foreground">{a.calories} kcal/100g</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            {/* 入库 */}
            <Pressable onPress={saveToLibrary} disabled={saved} className={`mt-5 rounded-xl py-4 items-center flex-row justify-center gap-2 ${saved ? 'bg-primary/40' : 'bg-primary active:opacity-90'}`}>
              <BookmarkPlus size={18} color="#FFFCF7" />
              <Text className="text-base font-semibold text-primary-foreground">{saved ? '已加入我的食物库' : '加入我的食物库'}</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function NutriCell({ label, value, unit, highlight }: { label: string; value: number; unit: string; highlight?: boolean }) {
  return (
    <View className="w-1/3 py-2 items-center">
      <Text className="text-[10px] text-muted-foreground">{label}</Text>
      <View className="flex-row items-baseline gap-0.5">
        <Text className={`text-lg font-bold ${highlight ? 'text-accent' : 'text-foreground'}`}>{value}</Text>
        <Text className="text-[10px] text-muted-foreground">{unit}</Text>
      </View>
    </View>
  );
}