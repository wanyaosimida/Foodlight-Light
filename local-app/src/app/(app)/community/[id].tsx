import { useState, useCallback, useRef } from 'react';
import { View, Pressable, ScrollView, TextInput, KeyboardAvoidingView, ActivityIndicator, FlatList } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { ArrowLeft, Heart, Bookmark, Send, Sparkles, UserPlus, UserCheck, Trash2 } from 'lucide-react-native';
import { Image } from 'expo-image';
import {
  getCommunityPost,
  listComments,
  createComment,
  isLiked,
  isFavorited,
  toggleLike,
  toggleFavorite,
  isFollowing,
  toggleFollow,
  callCommunityAI,
  deleteCommunityPost,
  getProfile,
  getPublicUrl,
} from '@/db/api';
import type { CommunityPost, CommunityComment, PostType } from '@/types/types';
import { POST_TYPE_LABELS } from '@/types/types';
import { useSession } from '@/ctx';
import { Text } from '@/components/ui/text';
import { getAvatarById } from '@/constants/avatars';

const TYPE_COLOR: Record<PostType, string> = {
  meal: '#D97724',
  progress: '#38764A',
  recipe: '#7C3AED',
  workout: '#0EA5E9',
  talk: '#EC4899',
};

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const userId = session?.user?.id || '';

  const [post, setPost] = useState<CommunityPost | null>(null);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [liked, setLiked] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const [following, setFollowing] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [aiComments, setAiComments] = useState<string[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [error, setError] = useState('');
  const pendingActions = useRef(new Set<string>());

  const load = useCallback(async () => {
    if (!id) return;
    setError('');
    try {
      const p = await getCommunityPost(id);
      setPost(p);
      setIsOwner(p?.owner_id === userId);
      const cs = await listComments(id);
      setComments(cs);
      if (p && userId) {
        const [l, f, fo] = await Promise.all([isLiked(id, userId), isFavorited(id, userId), isFollowing(p.owner_id, userId)]);
        setLiked(l);
        setFavorited(f);
        setFollowing(fo);
      }
    } catch (e) {
      setError((e as Error).message || '动态加载失败，请重试');
    } finally {
      setLoading(false);
    }
  }, [id, userId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const saveInteraction = async (key: string, action: () => Promise<void>) => {
    if (pendingActions.current.has(key)) return;
    pendingActions.current.add(key);
    setError('');
    try {
      await action();
    } catch (e) {
      setError((e as Error).message || '操作保存失败，请重试');
    } finally {
      pendingActions.current.delete(key);
    }
  };

  const onLike = async () => {
    if (!post) return;
    await saveInteraction('like', async () => {
      const now = await toggleLike(post.id, userId);
      setLiked(now);
      setPost((p) => (p ? { ...p, like_count: Math.max(0, p.like_count + (now ? 1 : -1)) } : p));
    });
  };
  const onFav = async () => {
    if (!post) return;
    await saveInteraction('favorite', async () => {
      const now = await toggleFavorite(post.id, userId);
      setFavorited(now);
      setPost((p) => (p ? { ...p, favorite_count: Math.max(0, p.favorite_count + (now ? 1 : -1)) } : p));
    });
  };
  const onFollow = async () => {
    if (!post || post.owner_id === userId) return;
    await saveInteraction('follow', async () => {
      const now = await toggleFollow(post.owner_id, userId);
      setFollowing(now);
    });
  };

  const sendComment = async (text: string) => {
    const t = text.trim();
    if (!t || !post || sending) return;
    setSending(true);
    setError('');
    try {
      const prof = await getProfile(userId);
      await createComment(post.id, t, prof?.nickname || '健康达人', prof?.avatar_url || null);
      setCommentText('');
      setPost((p) => (p ? { ...p, comment_count: p.comment_count + 1 } : p));
      const cs = await listComments(post.id);
      setComments(cs);
    } catch (e) {
      setError((e as Error).message || '评论保存失败，请重试');
    } finally {
      setSending(false);
    }
  };

  const getAiComments = async () => {
    if (!post) return;
    setAiLoading(true);
    setError('');
    try {
      const res = await callCommunityAI({ action: 'comment', post_type: post.type, summary: post.content.slice(0, 60) });
      if (Array.isArray(res.comments)) setAiComments(res.comments);
    } catch (e) {
      setError((e as Error).message || 'AI 评论生成失败');
    } finally {
      setAiLoading(false);
    }
  };

  const onDelete = async () => {
    if (!post) return;
    try {
      await deleteCommunityPost(post.id);
      router.back();
    } catch (e) {
      setError((e as Error).message || '动态删除失败');
    }
  };

  if (loading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator color="#38764A" />
      </View>
    );
  }
  if (!post) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <Text className="text-muted-foreground">{error || '动态不存在或已被删除'}</Text>
        <Pressable onPress={() => router.back()} className="mt-4"><Text className="text-primary">返回</Text></Pressable>
      </View>
    );
  }

  const color = TYPE_COLOR[post.type] || '#EC4899';
  const images = Array.isArray(post.images) ? post.images : [];

  return (
    <View className="flex-1 bg-background">
      {/* 顶部 */}
      <View className="flex-row items-center px-4 pt-4 pb-2 bg-background" style={{ paddingTop: insets.top + 8 }}>
        <Pressable onPress={() => router.back()} className="w-10 h-10 items-center justify-center rounded-full active:bg-muted">
          <ArrowLeft size={22} color="#3F3A33" />
        </Pressable>
        <Text className="flex-1 text-center text-lg font-bold text-foreground">动态详情</Text>
        <View className="w-10">
          {isOwner ? (
            <Pressable onPress={onDelete} className="w-10 h-10 items-center justify-center rounded-full active:bg-muted">
              <Trash2 size={20} color="#DC2626" />
            </Pressable>
          ) : null}
        </View>
      </View>

      <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
          {/* 作者 */}
          <View className="flex-row items-center px-4 py-3">
            <View className="w-11 h-11 rounded-full bg-primary/15 items-center justify-center overflow-hidden">
              {post.author_avatar ? (
                <Image source={getAvatarById(post.author_avatar)?.source || { uri: getPublicUrl(post.author_avatar) }} style={{ width: 44, height: 44 }} contentFit="cover" />
              ) : (
                <Text className="text-base font-bold text-primary">{(post.author_name || '匿')[0]}</Text>
              )}
            </View>
            <View className="flex-1 ml-3">
              <Text className="text-base font-semibold text-foreground">{post.author_name || '健康达人'}</Text>
              <View className="flex-row items-center gap-1 mt-0.5">
                <View className="rounded px-1.5 py-0.5" style={{ backgroundColor: `${color}20` }}>
                  <Text className="text-[10px] font-medium" style={{ color }}>{POST_TYPE_LABELS[post.type]}</Text>
                </View>
              </View>
            </View>
            {!isOwner ? (
              <Pressable onPress={onFollow} className={`rounded-full px-4 py-2 flex-row items-center gap-1 ${following ? 'bg-secondary' : 'bg-primary'}`}>
                {following ? <UserCheck size={14} color="#38764A" /> : <UserPlus size={14} color="#FFFCF7" />}
                <Text className={`text-xs font-semibold ${following ? 'text-primary' : 'text-primary-foreground'}`}>{following ? '已关注' : '关注'}</Text>
              </Pressable>
            ) : null}
          </View>

          {/* 内容 */}
          {post.content ? <Text className="text-base text-foreground leading-6 px-4 mt-1">{post.content}</Text> : null}

          {/* 图片 */}
          {images.length > 0 ? (
            <View className="mt-3">
              {images.map((uri, i) => (
                <Image key={i} source={{ uri: getPublicUrl(uri) }} style={{ width: '100%', height: 300 }} contentFit="cover" />
              ))}
            </View>
          ) : null}

          {/* 标签 */}
          {post.tags?.length > 0 ? (
            <View className="flex-row flex-wrap gap-2 px-4 mt-3">
              {post.tags.map((t) => (
                <Text key={t} className="text-xs text-primary">#{t}</Text>
              ))}
            </View>
          ) : null}

          {/* 互动栏 */}
          <View className="flex-row items-center px-4 mt-4 pb-3 border-b border-border">
            <Pressable onPress={onLike} className="flex-row items-center gap-1.5 mr-6 active:opacity-60">
              <Heart size={20} color={liked ? '#DC2626' : '#8a8278'} fill={liked ? '#DC2626' : 'transparent'} />
              <Text className={`text-sm ${liked ? 'text-destructive' : 'text-muted-foreground'}`}>{post.like_count}</Text>
            </Pressable>
            <Pressable onPress={onFav} className="flex-row items-center gap-1.5 active:opacity-60">
              <Bookmark size={20} color={favorited ? '#D97724' : '#8a8278'} fill={favorited ? '#D97724' : 'transparent'} />
              <Text className={`text-sm ${favorited ? 'text-accent' : 'text-muted-foreground'}`}>{post.favorite_count}</Text>
            </Pressable>
          </View>

          {/* AI 智能评论 */}
          <View className="px-4 mt-4">
            <Pressable onPress={getAiComments} disabled={aiLoading} className="flex-row items-center gap-1.5 active:opacity-60">
              {aiLoading ? <ActivityIndicator size="small" color="#D97724" /> : <Sparkles size={15} color="#D97724" />}
              <Text className="text-sm text-accent font-medium">{aiLoading ? 'AI 智能评论生成中...' : 'AI 推荐快捷评论'}</Text>
            </Pressable>
            {aiComments.length > 0 ? (
              <View className="flex-row flex-wrap gap-2 mt-2">
                {aiComments.map((c, i) => (
                  <Pressable key={i} onPress={() => sendComment(c)} className="bg-secondary rounded-full px-3 py-1.5 active:bg-muted">
                    <Text className="text-xs text-secondary-foreground">{c}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>

          {/* 评论区 */}
          <View className="px-4 mt-4">
            <Text className="text-base font-bold text-foreground mb-2">评论 {comments.length}</Text>
            <FlatList
              data={comments}
              keyExtractor={(c) => c.id}
              scrollEnabled={false}
              ListEmptyComponent={<Text className="text-xs text-muted-foreground py-4">还没有评论，快来抢沙发</Text>}
              renderItem={({ item }) => (
                <View className="flex-row py-3">
                  <View className="w-8 h-8 rounded-full bg-primary/15 items-center justify-center overflow-hidden">
                    {item.author_avatar ? (
                      <Image source={getAvatarById(item.author_avatar)?.source || { uri: getPublicUrl(item.author_avatar) }} style={{ width: 32, height: 32 }} contentFit="cover" />
                    ) : (
                      <Text className="text-xs font-bold text-primary">{(item.author_name || '匿')[0]}</Text>
                    )}
                  </View>
                  <View className="flex-1 ml-2">
                    <Text className="text-xs font-medium text-foreground">{item.author_name}</Text>
                    <Text className="text-sm text-foreground mt-0.5">{item.content}</Text>
                  </View>
                </View>
              )}
            />
          </View>
        </ScrollView>

        {/* 评论输入 */}
        {error ? <Text className="text-sm text-destructive px-4 py-2">{error}</Text> : null}
        <View className="flex-row items-center px-4 py-3 bg-card border-t border-border" style={{ paddingBottom: insets.bottom + 8 }}>
          <TextInput
            value={commentText}
            onChangeText={setCommentText}
            placeholder="写下你的评论..."
            placeholderTextColor="#a8a29e"
            className="flex-1 bg-secondary rounded-full px-4 py-2.5 text-sm text-foreground"
            returnKeyType="send"
            onSubmitEditing={() => sendComment(commentText)}
          />
          <Pressable onPress={() => sendComment(commentText)} disabled={sending} className="w-11 h-11 ml-2 bg-primary rounded-full items-center justify-center active:opacity-90">
            {sending ? <ActivityIndicator size="small" color="#FFFCF7" /> : <Send size={18} color="#FFFCF7" />}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
