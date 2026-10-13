import { useState } from 'react';
import {
  View,
  Pressable,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import {
  Camera,
  ImagePlus,
  Sparkles,
  Check,
  Trash2,
  Plus,
  BadgeCheck,
  RefreshCw,
  Zap,
} from 'lucide-react-native';
import { pickImageFromGallery, takePhoto, compressImage, uploadImage, assetToBase64 } from '@/lib/imageUpload';
import { callFoodRecognition, createMealLog, todayStr } from '@/db/api';
import { useSession } from '@/ctx';
import type { RecognizedFood, MealType } from '@/types/types';
import { MEAL_TYPE_LABELS } from '@/types/types';
import { PageHeader } from '@/components/PageHeader';
import { Text } from '@/components/ui/text';

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export default function MealRecordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const userId = session?.user?.id;

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [recognizing, setRecognizing] = useState(false);
  const [items, setItems] = useState<RecognizedFood[]>([]);
  const [mealType, setMealType] = useState<MealType>('breakfast');
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const handlePick = async (fromCamera: boolean) => {
    setError('');
    setPermissionDenied(false);
    try {
      const asset = fromCamera ? await takePhoto() : await pickImageFromGallery();
      if (!asset) return;
      setImageUri(asset.uri);
      setItems([]);
      // 自动识别
      setRecognizing(true);
      try {
        const b64 = await assetToBase64(asset.uri, 1024);
        const res = await callFoodRecognition(b64);
        const list: RecognizedFood[] = res?.items || [];
        if (list.length === 0) {
          setError('未识别出有效食物，请手动添加');
          setItems([{ name: '', portion: '', calories: 0, protein: 0, carbs: 0, fat: 0, verified: false }]);
        } else {
          setItems(list);
        }
      } catch (e) {
        setError(`${(e as Error).message || '识别失败'}，可继续手动填写并保存`);
        setItems([{ name: '', portion: '', calories: 0, protein: 0, carbs: 0, fat: 0, verified: false }]);
      } finally {
        setRecognizing(false);
      }
    } catch (e) {
      const msg = String((e as Error).message || e);
      if (msg.includes('PERMISSION_DENIED')) {
        setPermissionDenied(true);
      } else {
        setError(msg);
      }
    }
  };

  const updateItem = (idx: number, field: keyof RecognizedFood, value: string | number) => {
    setItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const addItem = () => {
    setItems((prev) => [...prev, { name: '', portion: '', calories: 0, protein: 0, carbs: 0, fat: 0, verified: false }]);
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!userId) return;
    const valid = items.filter((i) => i.name.trim() && i.calories > 0);
    if (valid.length === 0) {
      setError('请至少填写一项有效的食物名称与热量');
      return;
    }
    setSaving(true);
    setError('');
    try {
      let imageUrl: string | null = null;
      if (imageUri) {
        const { uri: compressedUri } = await compressImage(imageUri, 'image/jpeg', 1080);
        const path = await uploadImage(compressedUri, 'image/jpeg');
        imageUrl = path;
      }
      for (const item of valid) {
        await createMealLog({
          log_date: todayStr(),
          meal_type: mealType,
          food_name: item.name.trim(),
          portion: item.portion?.trim() || null,
          calories: Number(item.calories) || 0,
          protein: Number(item.protein) || 0,
          carbs: Number(item.carbs) || 0,
          fat: Number(item.fat) || 0,
          image_url: imageUrl,
          recipe_id: null,
        });
      }
      setSaved(true);
      setTimeout(() => router.back(), 800);
    } catch (e) {
      setError(String((e as Error).message || e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="flex-1 bg-background">
      <PageHeader title="记录餐食" subtitle="拍照或上传，AI 自动识别营养" />
      <KeyboardAvoidingView
        behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
          <View className="px-5">
            {/* 餐次选择 */}
            <Text className="text-sm font-semibold text-foreground mb-2">餐次</Text>
            <View className="flex-row flex-wrap gap-2 mb-5">
              {MEAL_TYPES.map((mt) => (
                <Pressable
                  key={mt}
                  onPress={() => setMealType(mt)}
                  className={`px-4 py-2 rounded-xl border ${
                    mealType === mt ? 'bg-primary border-primary' : 'bg-card border-border'
                  }`}
                  style={{ borderCurve: 'continuous' }}
                >
                  <Text
                    className={`text-sm font-medium ${
                      mealType === mt ? 'text-primary-foreground' : 'text-foreground'
                    }`}
                  >
                    {MEAL_TYPE_LABELS[mt]}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* 图片选择 */}
            {imageUri ? (
              <View className="relative mb-4">
                <Image
                  source={{ uri: imageUri }}
                  className="w-full h-52 rounded-2xl"
                  contentFit="cover"
                />
                <Pressable
                  onPress={() => { setImageUri(null); setItems([]); }}
                  className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 items-center justify-center"
                >
                  <Trash2 size={16} color="#fff" />
                </Pressable>
                {recognizing && (
                  <View className="absolute inset-0 bg-black/40 rounded-2xl items-center justify-center">
                    <ActivityIndicator color="#fff" />
                    <Text className="text-white text-sm mt-2">AI 识别中...</Text>
                  </View>
                )}
              </View>
            ) : (
              <View className="flex-row gap-3 mb-5">
                <Pressable
                  onPress={() => handlePick(true)}
                  className="flex-1 bg-card rounded-2xl p-5 items-center border border-dashed border-primary active:bg-muted"
                  style={{ borderCurve: 'continuous' }}
                >
                  <Camera size={28} color="#38764A" />
                  <Text className="text-sm text-foreground font-medium mt-2">拍照</Text>
                </Pressable>
                <Pressable
                  onPress={() => handlePick(false)}
                  className="flex-1 bg-card rounded-2xl p-5 items-center border border-dashed border-primary active:bg-muted"
                  style={{ borderCurve: 'continuous' }}
                >
                  <ImagePlus size={28} color="#38764A" />
                  <Text className="text-sm text-foreground font-medium mt-2">相册</Text>
                </Pressable>
              </View>
            )}

            {permissionDenied && (
              <Text className="text-destructive text-sm mb-3">
                需要相机/相册权限，请在系统设置中开启
              </Text>
            )}

            {/* 食物列表 */}
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-sm font-semibold text-foreground">食物明细</Text>
              <Pressable onPress={addItem} className="flex-row items-center active:opacity-70">
                <Plus size={16} color="#38764A" />
                <Text className="text-sm text-primary ml-1">添加</Text>
              </Pressable>
            </View>

            <View className="gap-3">
              {items.map((item, idx) => (
                <View
                  key={idx}
                  className="bg-card rounded-2xl p-3 border border-border"
                  style={{ borderCurve: 'continuous' }}
                >
                  <View className="flex-row items-center gap-2 mb-2">
                    <TextInput
                      className="flex-1 border border-input bg-background rounded-lg px-3 h-10 text-sm text-foreground"
                      placeholder="食物名称"
                      placeholderTextColor="#a8a29e"
                      value={item.name}
                      onChangeText={(v) => updateItem(idx, 'name', v)}
                    />
                    {item.verified ? (
                      <View className="flex-row items-center bg-primary/10 rounded-md px-2 h-6">
                        <BadgeCheck size={13} color="#38764A" />
                        <Text className="text-[10px] text-primary ml-0.5">已核验</Text>
                      </View>
                    ) : null}
                    <Pressable
                      onPress={() => removeItem(idx)}
                      className="w-10 h-10 items-center justify-center rounded-lg active:bg-muted"
                    >
                      <Trash2 size={16} color="#D97724" />
                    </Pressable>
                  </View>
                  <TextInput
                    className="border border-input bg-background rounded-lg px-3 h-10 text-sm text-foreground mb-2"
                    placeholder="分量（如：1碗、200g）"
                    placeholderTextColor="#a8a29e"
                    value={item.portion}
                    onChangeText={(v) => updateItem(idx, 'portion', v)}
                  />
                  {item.weight_g ? (
                    <View className="flex-row items-center mb-2">
                      <Text className="text-[11px] text-muted-foreground">AI估算净重约 </Text>
                      <Text className="text-[11px] font-semibold text-foreground">{item.weight_g}g</Text>
                    </View>
                  ) : null}
                  <View className="flex-row gap-2">
                    <NutInput label="热量" value={String(item.calories)} onChange={(v) => updateItem(idx, 'calories', Number(v) || 0)} />
                    <NutInput label="蛋白g" value={String(item.protein)} onChange={(v) => updateItem(idx, 'protein', Number(v) || 0)} />
                    <NutInput label="碳水g" value={String(item.carbs)} onChange={(v) => updateItem(idx, 'carbs', Number(v) || 0)} />
                    <NutInput label="脂肪g" value={String(item.fat)} onChange={(v) => updateItem(idx, 'fat', Number(v) || 0)} />
                  </View>
                  {item.name.trim() ? (
                    <Pressable
                      onPress={() =>
                        router.push({
                          pathname: '/(app)/food-substitute',
                          params: {
                            name: item.name,
                            portion: item.portion || '100g',
                            calories: String(item.calories),
                            protein: String(item.protein),
                            carbs: String(item.carbs),
                            fat: String(item.fat),
                            sugar: '0',
                            sodium: '0',
                          },
                        })
                      }
                      className="flex-row items-center justify-center gap-1.5 mt-3 bg-accent/10 rounded-xl py-2.5 active:opacity-70"
                    >
                      <RefreshCw size={15} color="#D97724" />
                      <Text className="text-sm text-accent font-medium">AI 健康替代</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </View>

            {/* 动态GL与困倦预警快捷卡片 */}
            {items.length > 0 && items.some((i) => i.carbs > 0) ? (
              <Pressable
                onPress={() => router.push('/(app)/glycemic-advisor')}
                className="mt-4 bg-[#F7F6F2] border border-[#E3E1DC] rounded-xl p-3 flex-row items-center justify-between active:bg-muted"
              >
                <View className="flex-row items-center gap-2">
                  <View className="w-7 h-7 rounded-full bg-[#0284C7]/15 items-center justify-center">
                    <Zap size={14} color="#0284C7" />
                  </View>
                  <View>
                    <Text className="text-xs font-bold text-[#1A1918]">
                      动态GL与餐后困倦预警已就绪
                    </Text>
                    <Text className="text-[11px] text-[#706E6B]">
                      点击测算本餐血糖波动与黄金进食顺序
                    </Text>
                  </View>
                </View>
                <Text className="text-xs font-bold text-[#0284C7]">去查看 &gt;</Text>
              </Pressable>
            ) : null}

            {error ? <Text className="text-destructive text-sm mt-3">{error}</Text> : null}
            {saved ? <Text className="text-primary text-sm mt-3">已保存，正在返回...</Text> : null}

            <Pressable
              onPress={handleSave}
              disabled={saving}
              className="bg-primary rounded-2xl h-14 items-center justify-center active:opacity-90 mt-6"
              style={{ borderCurve: 'continuous' }}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <View className="flex-row items-center">
                  <Check size={20} color="#fff" />
                  <Text className="text-primary-foreground text-lg font-semibold ml-2">保存记录</Text>
                </View>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function NutInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View className="flex-1">
      <Text className="text-[10px] text-muted-foreground mb-0.5">{label}</Text>
      <TextInput
        className="border border-input bg-background rounded-lg px-2 h-9 text-xs text-foreground"
        keyboardType="number-pad"
        value={value}
        onChangeText={onChange}
      />
    </View>
  );
}
