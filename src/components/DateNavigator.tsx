import React, { useState, useMemo } from 'react';
import { format, startOfDay, endOfDay, parseISO } from 'date-fns';

interface DateNavigatorProps {
  onDateChange: (range: { startTime: number; endTime: number }) => void;
  availableDates: string[];
}

export function DateNavigator({ onDateChange, availableDates }: DateNavigatorProps) {
  // currentDateIndex 是在 availableDates 数组中的索引，-1 表示 'All'
  const [currentDateIndex, setCurrentDateIndex] = useState<number>(-1);
  // visibleStartIndex 表示当前显示的第一个日期在 availableDates 中的索引
  const [visibleStartIndex, setVisibleStartIndex] = useState<number>(0);
  
  const DATES_PER_PAGE = 7;

  const datePresets = useMemo(() => {
    const today = startOfDay(new Date());
    
    // 从 visibleStartIndex 开始显示 7 个日期
    const visibleDates = availableDates.slice(visibleStartIndex, visibleStartIndex + DATES_PER_PAGE);
    const availablePresets = visibleDates.map((dateStr, relativeIndex) => {
      const date = parseISO(dateStr);
      const diff = (today.getTime() - startOfDay(date).getTime()) / (1000 * 3600 * 24);
      let label = format(date, 'EEEE');
      if (diff === 0) label = 'Today';
      if (diff === 1) label = 'Yesterday';
      return {
        label: label,
        date: date,
        subLabel: format(date, 'MMM dd'),
        dateStr: dateStr,
        absoluteIndex: visibleStartIndex + relativeIndex, // 在 availableDates 中的绝对索引
      };
    });

    return [{ label: 'All', date: null, subLabel: 'Show all history', dateStr: null, absoluteIndex: -1 }, ...availablePresets];
  }, [availableDates, visibleStartIndex]);

  const handleDatePresetClick = (date: Date | null, absoluteIndex: number) => {
    setCurrentDateIndex(absoluteIndex);
    if (date) {
      const startTime = startOfDay(date).getTime();
      const endTime = endOfDay(date).getTime();
      onDateChange({ startTime, endTime });
    } else {
      // Handle 'All'
      onDateChange({ startTime: 0, endTime: Date.now() });
    }
  };

  const navigateDates = (direction: 'left' | 'right') => {
    if (availableDates.length === 0) return;
    
    if (direction === 'left') {
      // 左箭头：选中左边的日期（更晚/更新）
      if (currentDateIndex === -1) {
        // 当前在 All，不做任何操作
        return;
      } else if (currentDateIndex === 0) {
        // 当前是最新的日期，切换到 All
        setCurrentDateIndex(-1);
        setVisibleStartIndex(0);
        onDateChange({ startTime: 0, endTime: Date.now() });
      } else {
        // 选中前一个日期（更新的）
        const newIndex = currentDateIndex - 1;
        // 如果新索引不在当前可见范围内，调整可见窗口
        if (newIndex < visibleStartIndex) {
          setVisibleStartIndex(Math.max(0, newIndex));
        }
        setCurrentDateIndex(newIndex);
        const date = parseISO(availableDates[newIndex]);
        const startTime = startOfDay(date).getTime();
        const endTime = endOfDay(date).getTime();
        onDateChange({ startTime, endTime });
      }
    } else {
      // 右箭头：选中右边的日期（更早/更旧）
      if (currentDateIndex === -1) {
        // 从 All 切换到第一个可用日期
        setCurrentDateIndex(0);
        setVisibleStartIndex(0);
        const date = parseISO(availableDates[0]);
        const startTime = startOfDay(date).getTime();
        const endTime = endOfDay(date).getTime();
        onDateChange({ startTime, endTime });
      } else if (currentDateIndex < availableDates.length - 1) {
        // 选中下一个日期（更旧的）
        const newIndex = currentDateIndex + 1;
        // 如果新索引不在当前可见范围内，调整可见窗口
        if (newIndex >= visibleStartIndex + DATES_PER_PAGE) {
          setVisibleStartIndex(Math.min(availableDates.length - DATES_PER_PAGE, newIndex - DATES_PER_PAGE + 1));
        }
        setCurrentDateIndex(newIndex);
        const date = parseISO(availableDates[newIndex]);
        const startTime = startOfDay(date).getTime();
        const endTime = endOfDay(date).getTime();
        onDateChange({ startTime, endTime });
      }
      // 如果已经是最后一个日期，不做任何操作
    }
  };

  // 判断是否可以向左/向右导航
  const canNavigateLeft = currentDateIndex > -1;
  const canNavigateRight = currentDateIndex < availableDates.length - 1;

  return (
    <div className="flex items-center space-x-2 relative">
      <button 
        onClick={() => navigateDates('left')} 
        className="p-2 rounded-full hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
        disabled={!canNavigateLeft}
      >
        <span className="material-symbols-outlined">chevron_left</span>
      </button>

      <div className="flex items-center space-x-2">
        {datePresets.map((preset) => (
          <button
            key={preset.label + preset.subLabel + preset.absoluteIndex}
            onClick={() => handleDatePresetClick(preset.date, preset.absoluteIndex)}
            className={`px-3 py-2 rounded-lg text-sm transition-colors text-center ${
              currentDateIndex === preset.absoluteIndex
                ? 'bg-black text-white'
                : 'bg-gray-100 hover:bg-gray-200'
            }`}
          >
            <div className="font-semibold">{preset.label}</div>
            <div className="text-xs">{preset.subLabel}</div>
          </button>
        ))}
      </div>

      <button 
        onClick={() => navigateDates('right')} 
        className="p-2 rounded-full hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
        disabled={!canNavigateRight}
      >
        <span className="material-symbols-outlined">chevron_right</span>
      </button>
    </div>
  );
}
