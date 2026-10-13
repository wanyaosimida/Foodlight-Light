import { useState } from 'react';
import { View, Pressable, Modal, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { X } from 'lucide-react-native';
import { AVATARS, getAvatarById, type AvatarOption } from '@/constants/avatars';
import { Text } from '@/components/ui/text';

interface AvatarPickerProps {
  visible: boolean;
  selectedId?: string | null;
  onSelect: (avatar: AvatarOption) => void;
  onClose: () => void;
}

export function AvatarPicker({ visible, selectedId, onSelect, onClose }: AvatarPickerProps) {
  const [filter, setFilter] = useState<'all' | 'male' | 'female'>('all');
  const selected = getAvatarById(selectedId);

  const filtered = AVATARS.filter((a) => filter === 'all' || a.gender === filter);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-black/40 justify-end">
        <View className="bg-background rounded-t-3xl max-h-[85%]" style={{ borderCurve: 'continuous' }}>
          {/* 头部 */}
          <View className="flex-row items-center justify-between px-5 pt-5 pb-3">
            <View>
              <Text className="text-lg font-bold text-foreground">选择运动头像</Text>
              <Text className="text-xs text-muted-foreground mt-0.5">选一个你喜欢的卡通形象</Text>
            </View>
            <Pressable onPress={onClose} className="w-9 h-9 rounded-full bg-muted items-center justify-center active:opacity-70">
              <X size={18} color="#78716c" />
            </Pressable>
          </View>

          {/* 筛选 */}
          <View className="flex-row gap-2 px-5 mb-3">
            {[
              { key: 'all', label: '全部' },
              { key: 'male', label: '男生' },
              { key: 'female', label: '女生' },
            ].map((f) => (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key as typeof filter)}
                className={`px-4 py-1.5 rounded-full border ${
                  filter === f.key ? 'bg-primary border-primary' : 'bg-card border-border'
                }`}
              >
                <Text className={`text-xs font-medium ${filter === f.key ? 'text-primary-foreground' : 'text-foreground'}`}>
                  {f.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* 头像网格 */}
          <ScrollView contentContainerClassName="px-5 pb-8" contentInsetAdjustmentBehavior="automatic">
            <View className="flex-row flex-wrap gap-3">
              {filtered.map((avatar) => {
                const isSelected = selected?.id === avatar.id;
                return (
                  <Pressable
                    key={avatar.id}
                    onPress={() => { onSelect(avatar); onClose(); }}
                    className={`w-[30%] aspect-square rounded-2xl items-center justify-center border-2 active:opacity-80 ${
                      isSelected ? 'border-primary bg-primary/5' : 'border-border bg-card'
                    }`}
                    style={{ borderCurve: 'continuous' }}
                  >
                    <Image
                      source={avatar.source}
                      className="w-16 h-16 rounded-full"
                      contentFit="cover"
                      transition={150}
                    />
                    <Text className="text-[10px] text-muted-foreground mt-1.5" numberOfLines={1}>
                      {avatar.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}