import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { Text } from '@/components/ui/text';
import type { WeightLog } from '@/types/types';

// ==========================================
// 1. 热量摄入柱状图 (CalorieBarChart)
// ==========================================
interface DailyCalorieItem {
  date: string; // YYYY-MM-DD
  label: string; // e.g. "9/14", "周一"
  calories: number;
}

interface CalorieBarChartProps {
  data: DailyCalorieItem[];
  range: 'week' | 'month';
  targetCalories?: number;
}

export function CalorieBarChart({
  data,
  range,
  targetCalories = 1800,
}: CalorieBarChartProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <View className="h-44 items-center justify-center">
        <Text className="text-sm text-muted-foreground">暂无热量摄入数据</Text>
      </View>
    );
  }

  const maxCal = Math.max(
    targetCalories * 1.15,
    ...data.map((d) => d.calories),
    1000
  );

  const activeIndex =
    selectedIndex !== null && selectedIndex >= 0 && selectedIndex < data.length
      ? data[selectedIndex]
      : data[data.length - 1]; // 默认选中今天/最后一天
  const activeItemIndex = data.indexOf(activeIndex);
  const selectedItem = activeIndex;

  return (
    <View className="w-full">
      {/* 选中项提示浮层 */}
      <View className="flex-row items-center justify-between mb-3 px-1">
        <View className="flex-row items-baseline gap-1.5">
          <Text className="text-xs text-muted-foreground">
            {selectedItem?.date || ''}
          </Text>
          <Text className="text-lg font-bold text-primary">
            {selectedItem ? `${selectedItem.calories}` : '--'}
          </Text>
          <Text className="text-xs text-muted-foreground">千卡</Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          <View className="w-2 h-2 rounded-full bg-primary" />
          <Text className="text-xs text-muted-foreground">
            目标 {targetCalories} kcal
          </Text>
        </View>
      </View>

      {/* 柱状图展示区 */}
      {range === 'week' ? (
        // 7天视图：宽柱，带数值和星期/日期
        <View className="h-40 flex-row items-end justify-between px-1">
          {data.map((item, idx) => {
            const isSelected =
              activeItemIndex === idx;
            const heightPct = Math.max(
              4,
              Math.min(100, Math.round((item.calories / maxCal) * 100))
            );
            const isOverTarget = item.calories > targetCalories;

            return (
              <Pressable
                key={item.date}
                onPress={() => setSelectedIndex(idx)}
                className="flex-1 items-center justify-end h-full py-1 active:opacity-70"
              >
                {/* 顶部数值 */}
                <Text
                  className={`text-[10px] mb-1 font-medium ${
                    isSelected ? 'text-primary font-bold' : 'text-muted-foreground'
                  }`}
                  numberOfLines={1}
                >
                  {item.calories > 0 ? item.calories : '-'}
                </Text>

                {/* 柱体 */}
                <View className="w-full px-1.5 items-center justify-end flex-1">
                  <View
                    className="w-full rounded-t-lg transition-all"
                    style={{
                      height: `${heightPct}%`,
                      backgroundColor: isSelected
                        ? isOverTarget
                          ? '#D97724'
                          : '#38764A'
                        : isOverTarget
                        ? '#e89e5a'
                        : '#75a882',
                    }}
                  />
                </View>

                {/* 底部日期 */}
                <Text
                  className={`text-[11px] mt-2 ${
                    isSelected
                      ? 'text-foreground font-semibold'
                      : 'text-muted-foreground'
                  }`}
                >
                  {idx === data.length - 1 ? '今天' : item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        // 30天视图：紧凑30柱，带刻度线与选择交互
        <View>
          <View className="h-36 flex-row items-end justify-between px-0.5">
            {data.map((item, idx) => {
              const isSelected =
                activeItemIndex === idx;
              const heightPct = Math.max(
                4,
                Math.min(100, Math.round((item.calories / maxCal) * 100))
              );
              const isOverTarget = item.calories > targetCalories;

              return (
                <Pressable
                  key={item.date}
                  onPress={() => setSelectedIndex(idx)}
                  className="flex-1 items-center justify-end h-full px-[1px]"
                >
                  <View
                    className="w-full rounded-t-sm"
                    style={{
                      height: `${heightPct}%`,
                      backgroundColor: isSelected
                        ? '#38764A'
                        : isOverTarget
                        ? '#e89e5a'
                        : '#98c2a3',
                    }}
                  />
                </Pressable>
              );
            })}
          </View>
          {/* 30天X轴日期关键点 */}
          <View className="flex-row justify-between pt-2 px-1">
            <Text className="text-[10px] text-muted-foreground">
              {data[0]?.label || ''}
            </Text>
            <Text className="text-[10px] text-muted-foreground">
              {data[Math.floor(data.length / 3)]?.label || ''}
            </Text>
            <Text className="text-[10px] text-muted-foreground">
              {data[Math.floor((data.length * 2) / 3)]?.label || ''}
            </Text>
            <Text className="text-[10px] text-primary font-medium">今天</Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ==========================================
// 2. 三大营养素环形图 (MacroRatioDonut)
// ==========================================
interface MacroRatioDonutProps {
  proteinCal: number;
  carbsCal: number;
  fatCal: number;
  size?: number;
  strokeWidth?: number;
}

export function MacroRatioDonut({
  proteinCal,
  carbsCal,
  fatCal,
  size = 120,
  strokeWidth = 14,
}: MacroRatioDonutProps) {
  const total = proteinCal + carbsCal + fatCal;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  if (total <= 0) {
    return (
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke="#EAE6E1"
            strokeWidth={strokeWidth}
            fill="none"
          />
        </Svg>
        <View className="absolute inset-0 items-center justify-center">
          <Text className="text-xs text-muted-foreground">暂无数据</Text>
        </View>
      </View>
    );
  }

  const pPct = proteinCal / total;
  const cPct = carbsCal / total;
  const fPct = fatCal / total;

  const pLength = pPct * circumference;
  const cLength = cPct * circumference;
  const fLength = fPct * circumference;

  // 蛋白质：从0开始
  const pOffset = 0;
  // 碳水：紧随蛋白质
  const cOffset = -pLength;
  // 脂肪：紧随碳水
  const fOffset = -(pLength + cLength);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {/* 背景轻轨 */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke="#F1EFEA"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* 蛋白质 (暖杏黄 #D97724) */}
        {pPct > 0 && (
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke="#D97724"
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${pLength} ${circumference}`}
            strokeDashoffset={pOffset}
            transform={`rotate(-90 ${center} ${center})`}
          />
        )}
        {/* 碳水 (罗勒绿 #38764A) */}
        {cPct > 0 && (
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke="#38764A"
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${cLength} ${circumference}`}
            strokeDashoffset={cOffset}
            transform={`rotate(-90 ${center} ${center})`}
          />
        )}
        {/* 脂肪 (紫色 #7c5cbf) */}
        {fPct > 0 && (
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke="#7c5cbf"
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${fLength} ${circumference}`}
            strokeDashoffset={fOffset}
            transform={`rotate(-90 ${center} ${center})`}
          />
        )}
      </Svg>
      {/* 环心文案 */}
      <View className="absolute inset-0 items-center justify-center">
        <Text className="text-xs font-semibold text-foreground">三大营养</Text>
        <Text className="text-[10px] text-muted-foreground mt-0.5">供能配比</Text>
      </View>
    </View>
  );
}

// ==========================================
// 3. 体重变化趋势折线图 (WeightTrendChart)
// ==========================================
interface WeightTrendChartProps {
  weights: WeightLog[];
  periodStartDate: string;
  periodEndDate: string;
  height?: number;
}

export function WeightTrendChart({
  weights,
  periodStartDate,
  periodEndDate,
  height = 160,
}: WeightTrendChartProps) {
  if (weights.length === 0) {
    return (
      <View className="h-36 items-center justify-center">
        <Text className="text-sm text-muted-foreground">暂无体重记录，在下方记录今日体重</Text>
      </View>
    );
  }

  if (weights.length === 1) {
    const single = weights[0];
    return (
      <View className="h-36 items-center justify-center">
        <Text className="text-2xl font-bold text-primary">
          {Number(single.weight_kg).toFixed(1)} kg
        </Text>
        <Text className="text-xs text-muted-foreground mt-1">
          已记录 1 次（{single.log_date}），至少记录 2 次生成趋势曲线
        </Text>
      </View>
    );
  }

  // 计算趋势点
  const sorted = [...weights].sort((a, b) => a.log_date.localeCompare(b.log_date));
  const values = sorted.map((w) => Number(w.weight_kg));
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const margin = Math.max(0.4, (rawMax - rawMin) * 0.15);
  const minW = Math.floor((rawMin - margin) * 10) / 10;
  const maxW = Math.ceil((rawMax + margin) * 10) / 10;
  const rangeW = maxW - minW || 1;

  const svgWidth = 320;
  const svgHeight = height - 30; // 留出X轴文字空间
  const padX = 24;
  const padY = 16;
  const chartW = svgWidth - padX * 2;
  const chartH = svgHeight - padY * 2;
  const toDayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86_400_000;
  const startDay = toDayNumber(periodStartDate);
  const endDay = toDayNumber(periodEndDate);
  const daySpan = Math.max(1, endDay - startDay);

  const points = sorted.map((item) => {
    const dayOffset = Math.min(daySpan, Math.max(0, toDayNumber(item.log_date) - startDay));
    const x = padX + (dayOffset / daySpan) * chartW;
    const norm = (Number(item.weight_kg) - minW) / rangeW;
    const y = padY + (1 - norm) * chartH;
    return { x, y, weight: Number(item.weight_kg), date: item.log_date };
  });

  // 折线路径
  const linePath = points.reduce((acc, pt, idx) => {
    return idx === 0 ? `M ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}` : `${acc} L ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
  }, '');

  // 阴影区域路径
  const firstPt = points[0];
  const lastPt = points[points.length - 1];
  const bottomY = padY + chartH;
  const areaPath = `${linePath} L ${lastPt.x.toFixed(1)} ${bottomY} L ${firstPt.x.toFixed(1)} ${bottomY} Z`;

  const latestPt = points[points.length - 1];
  const initialPt = points[0];
  const diff = Number((latestPt.weight - initialPt.weight).toFixed(1));

  return (
    <View className="w-full">
      {/* 顶部起止体重对比 */}
      <View className="flex-row items-baseline justify-between mb-2 px-1">
        <View className="flex-row items-baseline gap-1.5">
          <Text className="text-xs text-muted-foreground">当前</Text>
          <Text className="text-xl font-bold text-foreground">
            {latestPt.weight.toFixed(1)}
          </Text>
          <Text className="text-xs text-muted-foreground">kg</Text>
        </View>
        <View className="flex-row items-center gap-1">
          <Text className="text-xs text-muted-foreground">期间变化</Text>
          <Text
            className={`text-sm font-semibold ${
              diff < 0
                ? 'text-emerald-600'
                : diff > 0
                ? 'text-amber-600'
                : 'text-foreground'
            }`}
          >
            {diff > 0 ? `+${diff}` : `${diff}`} kg
          </Text>
        </View>
      </View>

      {/* SVG 折线图 */}
      <View className="w-full items-center">
        <Svg
          width="100%"
          height={svgHeight}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        >
          <Defs>
            <LinearGradient id="weightAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#38764A" stopOpacity="0.28" />
              <Stop offset="1" stopColor="#38764A" stopOpacity="0.0" />
            </LinearGradient>
          </Defs>

          {/* 参考水平虚线：最高、中间、最低 */}
          <Line
            x1={padX}
            y1={padY}
            x2={svgWidth - padX}
            y2={padY}
            stroke="#EAE6E1"
            strokeDasharray="4 4"
            strokeWidth={1}
          />
          <Line
            x1={padX}
            y1={padY + chartH / 2}
            x2={svgWidth - padX}
            y2={padY + chartH / 2}
            stroke="#EAE6E1"
            strokeDasharray="4 4"
            strokeWidth={1}
          />
          <Line
            x1={padX}
            y1={padY + chartH}
            x2={svgWidth - padX}
            y2={padY + chartH}
            stroke="#EAE6E1"
            strokeDasharray="4 4"
            strokeWidth={1}
          />

          {/* 刻度文字 */}
          <SvgText
            x={padX - 4}
            y={padY + 4}
            fill="#a8a29e"
            fontSize="9"
            textAnchor="end"
          >
            {maxW.toFixed(1)}
          </SvgText>
          <SvgText
            x={padX - 4}
            y={padY + chartH + 4}
            fill="#a8a29e"
            fontSize="9"
            textAnchor="end"
          >
            {minW.toFixed(1)}
          </SvgText>

          {/* 渐变阴影填充 */}
          <Path d={areaPath} fill="url(#weightAreaGrad)" />

          {/* 折线 */}
          <Path
            d={linePath}
            stroke="#38764A"
            strokeWidth={3}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* 起始点与终点圆圈 */}
          <Circle
            cx={firstPt.x}
            cy={firstPt.y}
            r={3.5}
            fill="#FFFFFF"
            stroke="#38764A"
            strokeWidth={2}
          />
          <Circle
            cx={lastPt.x}
            cy={lastPt.y}
            r={5}
            fill="#38764A"
            stroke="#FFFFFF"
            strokeWidth={2}
          />
        </Svg>
      </View>

      {/* 底部日期刻度 */}
      <View className="flex-row justify-between px-3 mt-1">
        <Text className="text-[10px] text-muted-foreground">
          {periodStartDate.slice(5)}
        </Text>
        <Text className="text-[10px] text-muted-foreground">
          {new Date((startDay + Math.floor(daySpan / 2)) * 86_400_000)
            .toISOString()
            .slice(5, 10)}
        </Text>
        <Text className="text-[10px] text-primary font-medium">
          今天 ({periodEndDate.slice(5)})
        </Text>
      </View>
    </View>
  );
}
