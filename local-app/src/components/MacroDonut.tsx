import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Text } from '@/components/ui/text';

interface MacroDonutProps {
  // 0-100 进度
  progress: number;
  // 已摄入 / 目标
  consumed: number;
  target: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  overColor?: string;
  label?: string;
}

const PRIMARY = '#38764A';
const ACCENT = '#D97724';
const TRACK = '#EAE6E1';

export function MacroDonut({
  progress,
  consumed,
  target,
  size = 160,
  strokeWidth = 10,
  color = PRIMARY,
  trackColor = TRACK,
  overColor = ACCENT,
  label = '剩余热量',
}: MacroDonutProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(progress, 100);
  const strokeDashoffset = circumference - (clamped / 100) * circumference;
  const isOver = progress > 100;
  const remaining = Math.max(0, target - consumed);
  const center = size / 2;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={isOver ? overColor : color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>
      <View className="absolute inset-0 items-center justify-center">
        <Text className="text-3xl font-bold text-foreground">
          {isOver ? consumed : remaining}
        </Text>
        <Text className="text-xs text-muted-foreground mt-0.5">{label}</Text>
      </View>
    </View>
  );
}