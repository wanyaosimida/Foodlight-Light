import { useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';
import { Text } from '@/components/ui/text';

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  decimals?: number;
  suffix?: string;
  className?: string;
}

export function AnimatedNumber({
  value,
  duration = 350,
  decimals = 0,
  suffix = '',
  className,
}: AnimatedNumberProps) {
  const [display, setDisplay] = useState('0');
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const listener = anim.addListener(({ value: v }) => {
      setDisplay(v.toFixed(decimals));
    });
    Animated.timing(anim, {
      toValue: value,
      duration,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
    return () => anim.removeListener(listener);
  }, [value, duration, decimals, anim]);

  return (
    <Text className={className}>
      {display}
      {suffix}
    </Text>
  );
}