import { useState } from 'react';
import {
  View,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { UtensilsCrossed, Eye, EyeOff, Check } from 'lucide-react-native';
import { supabase, isLocalBackend } from '@/client/supabase';
import { Text } from '@/components/ui/text';

type Mode = 'login' | 'register';

function authErrorMessage(error: { message: string; code?: string; status?: number }): string {
  if (error.code === 'invalid_credentials' || /invalid login credentials/i.test(error.message)) {
    return '用户名或密码错误';
  }
  if (error.status === 0 || /failed to fetch|network request failed|fetch failed/i.test(error.message)) {
    return isLocalBackend ? '无法连接本地数据库服务，请先启动本地服务后重试' : '网络连接失败，请稍后重试';
  }
  if (/already|user_already_exists/i.test(`${error.code || ''} ${error.message}`)) return '该用户名已被注册';
  return error.message || '暂时无法登录，请稍后重试';
}

export default function SignIn() {
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [agree, setAgree] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const email = `${username.trim().toLowerCase()}@miaoda.com`;

  const validate = (): boolean => {
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username.trim())) {
      setError('用户名需为3-20位字母、数字或下划线');
      return false;
    }
    if (password.length < 6) {
      setError('密码至少6位');
      return false;
    }
    if (!agree) {
      setError('请先阅读并同意用户协议与隐私政策');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    setError('');
    if (!validate()) return;
    setLoading(true);
    try {
      if (mode === 'register') {
        const { data, error: signUpErr } = await supabase.auth.signUp({
          email,
          password,
        });
        if (signUpErr) {
          setError(authErrorMessage(signUpErr));
          return;
        }
        if (!data.session) {
          setError('账号已创建，请完成账号验证后再登录');
          return;
        }
      } else {
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInErr) {
          setError(authErrorMessage(signInErr));
          return;
        }
      }
      // Stack.Protected switches to the signed-in routes when the session changes.
    } catch (e) {
      setError(String((e as Error).message || e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-background"
    >
      <ScrollView
        contentContainerClassName="flex-grow justify-center px-6 py-10"
        keyboardShouldPersistTaps="handled"
      >
        <View className="items-center mb-8">
          <View className="w-16 h-16 rounded-2xl bg-primary items-center justify-center mb-3">
            <UtensilsCrossed size={34} color="#fff" />
          </View>
          <Text className="text-2xl font-bold text-foreground">
            {mode === 'login' ? '欢迎回到食光' : '创建食光账号'}
          </Text>
          <Text className="text-sm text-muted-foreground mt-1">
            {mode === 'login' ? '登录以继续你的营养之旅' : '注册开启智能膳食管理'}
          </Text>
          {isLocalBackend ? (
            <Text className="text-xs text-muted-foreground mt-3 text-center">本地账号独立保存。首次使用请注册；迁移账号的本地密码见工程内本地账号文件。</Text>
          ) : null}
        </View>

        <View className="gap-4">
          <View>
            <Text className="text-sm font-medium text-foreground mb-2">用户名</Text>
            <TextInput
              className="border border-input bg-card rounded-xl px-4 h-12 text-base text-foreground"
              placeholder="字母、数字或下划线"
              placeholderTextColor="#a8a29e"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View>
            <Text className="text-sm font-medium text-foreground mb-2">密码</Text>
            <View className="flex-row items-center border border-input bg-card rounded-xl px-4 h-12">
              <TextInput
                className="flex-1 text-base text-foreground"
                placeholder="至少6位"
                placeholderTextColor="#a8a29e"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPwd}
                autoCapitalize="none"
              />
              <Pressable onPress={() => setShowPwd((v) => !v)} hitSlop={8}>
                {showPwd ? <EyeOff size={20} color="#686461" /> : <Eye size={20} color="#686461" />}
              </Pressable>
            </View>
          </View>

          <Pressable
            className="flex-row items-center gap-2 mt-1"
            onPress={() => setAgree((v) => !v)}
          >
            <View
              className={`w-5 h-5 rounded-md border items-center justify-center ${
                agree ? 'bg-primary border-primary' : 'border-input bg-card'
              }`}
            >
              {agree ? <Check size={14} color="#fff" /> : null}
            </View>
            <Text className="text-xs text-muted-foreground flex-1">
              我已阅读并同意
              <Text className="text-primary">《用户协议》</Text>
              与
              <Text className="text-primary">《隐私政策》</Text>
            </Text>
          </Pressable>

          {error ? <Text className="text-destructive text-sm">{error}</Text> : null}

          <Pressable
            onPress={handleSubmit}
            disabled={loading}
            className="bg-primary rounded-xl h-12 items-center justify-center active:opacity-90 mt-2"
            style={{ borderCurve: 'continuous' }}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-primary-foreground text-base font-semibold">
                {mode === 'login' ? '登 录' : '注 册'}
              </Text>
            )}
          </Pressable>

          <View className="flex-row items-center justify-center mt-2">
            <Text className="text-sm text-muted-foreground">
              {mode === 'login' ? '还没有账号？' : '已有账号？'}
            </Text>
            <Pressable onPress={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
              <Text className="text-sm text-primary font-medium">
                {mode === 'login' ? '立即注册' : '去登录'}
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
