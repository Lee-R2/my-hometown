'use client';

import { useState, useRef, useCallback } from 'react';

/**
 * 拖拽位置类型
 */
export interface DragPosition {
  x: number;
  y: number;
}

/**
 * 拖拽元素类型
 */
export type DragTarget = 'bubble' | 'dialog';

/**
 * 拖拽功能 Hook
 * 从 ai-assistant.tsx 提取，支持鼠标和触摸两种交互方式
 * @param position - 浮动按钮位置（影响默认坐标计算）
 */
export function useDraggable(position: 'bottom-right' | 'bottom-left' = 'bottom-right') {
  const [bubblePos, setBubblePos] = useState<DragPosition>({ x: -1, y: -1 }); // -1 表示使用默认位置
  const [dialogPos, setDialogPos] = useState<DragPosition>({ x: -1, y: -1 });

  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const isDraggingRef = useRef(false);
  const hasMovedRef = useRef(false);

  const handleDragStart = useCallback(
    (type: DragTarget, e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      isDraggingRef.current = true;
      hasMovedRef.current = false;

      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const currentPos = type === 'bubble' ? bubblePos : dialogPos;

      const posX =
        currentPos.x === -1
          ? position === 'bottom-left'
            ? 24
            : window.innerWidth - 72
          : currentPos.x;
      const posY = currentPos.y === -1 ? window.innerHeight - 88 : currentPos.y;

      dragStartRef.current = { x: clientX, y: clientY, posX, posY };

      const handleMove = (moveEvent: MouseEvent | TouchEvent) => {
        if (!isDraggingRef.current) return;
        // 阻止默认行为（触摸滚动）和事件冒泡，确保只移动智能体
        moveEvent.preventDefault();
        moveEvent.stopPropagation();
        const moveX =
          'touches' in moveEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;
        const moveY =
          'touches' in moveEvent ? moveEvent.touches[0].clientY : moveEvent.clientY;

        const dx = moveX - dragStartRef.current.x;
        const dy = moveY - dragStartRef.current.y;

        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          hasMovedRef.current = true;
        }

        const newX = Math.max(
          0,
          Math.min(window.innerWidth - 56, dragStartRef.current.posX + dx)
        );
        const newY = Math.max(
          0,
          Math.min(window.innerHeight - 56, dragStartRef.current.posY + dy)
        );

        if (type === 'bubble') {
          setBubblePos({ x: newX, y: newY });
        } else {
          setDialogPos({ x: newX, y: newY });
        }
      };

      const handleEnd = () => {
        isDraggingRef.current = false;
        document.removeEventListener('mousemove', handleMove);
        document.removeEventListener('mouseup', handleEnd);
        document.removeEventListener('touchmove', handleMove);
        document.removeEventListener('touchend', handleEnd);
      };

      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleEnd);
      document.addEventListener('touchmove', handleMove, { passive: false });
      document.addEventListener('touchend', handleEnd);
    },
    [bubblePos, dialogPos, position]
  );

  return {
    bubblePos,
    dialogPos,
    handleDragStart,
    hasMovedRef,
  };
}
