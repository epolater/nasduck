import { useRef, useState } from 'react';
import { PanResponder, ScrollView, StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../constants';

interface Props<T> {
  data: T[];
  keyExtractor: (item: T) => string;
  renderItem: (item: T, index: number) => React.ReactNode;
  onReorder: (fromIndex: number, toIndex: number) => void;
  itemHeight: number; // fixed height per row (including margin)
  editMode: boolean;
  scrollRef?: React.RefObject<ScrollView>;
}

export function DraggableList<T>({
  data, keyExtractor, renderItem, onReorder, itemHeight, editMode, scrollRef,
}: Props<T>) {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const listRef = useRef<View>(null);
  const listPageY = useRef(0);
  const hoverIndexRef = useRef<number | null>(null);

  function refreshListPageY() {
    listRef.current?.measure((_x, _y, _w, _h, _px, py) => {
      listPageY.current = py;
    });
  }

  function getIndexForY(pageY: number) {
    const localY = pageY - listPageY.current;
    const idx = Math.round(localY / itemHeight);
    return Math.max(0, Math.min(data.length - 1, idx));
  }

  return (
    <View ref={listRef} onLayout={refreshListPageY}>
      {data.map((item, index) => (
        <DraggableRow
          key={keyExtractor(item)}
          editMode={editMode}
          isDragging={draggingIndex === index}
          isHoverTarget={hoverIndex === index && draggingIndex !== null && draggingIndex !== index}
          onDragStart={() => {
            setDraggingIndex(index);
            setHoverIndex(index);
            hoverIndexRef.current = index;
            scrollRef?.current?.setNativeProps({ scrollEnabled: false });
          }}
          onDragMove={(pageY) => {
            const idx = getIndexForY(pageY);
            hoverIndexRef.current = idx;
            setHoverIndex(idx);
          }}
          onDragEnd={() => {
            const toIdx = hoverIndexRef.current ?? index;
            if (toIdx !== index) onReorder(index, toIdx);
            setDraggingIndex(null);
            setHoverIndex(null);
            hoverIndexRef.current = null;
            scrollRef?.current?.setNativeProps({ scrollEnabled: true });
          }}
        >
          {renderItem(item, index)}
        </DraggableRow>
      ))}
    </View>
  );
}

function DraggableRow({
  editMode, isDragging, isHoverTarget, onDragStart, onDragMove, onDragEnd, children,
}: {
  editMode: boolean;
  isDragging: boolean;
  isHoverTarget: boolean;
  onDragStart: () => void;
  onDragMove: (pageY: number) => void;
  onDragEnd: () => void;
  children: React.ReactNode;
}) {
  const onDragStartRef = useRef(onDragStart);
  const onDragMoveRef  = useRef(onDragMove);
  const onDragEndRef   = useRef(onDragEnd);
  onDragStartRef.current = onDragStart;
  onDragMoveRef.current  = onDragMove;
  onDragEndRef.current   = onDragEnd;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => onDragStartRef.current(),
      onPanResponderMove: (e) => onDragMoveRef.current(e.nativeEvent.pageY),
      onPanResponderRelease: () => onDragEndRef.current(),
      onPanResponderTerminate: () => onDragEndRef.current(),
    })
  ).current;

  return (
    <View style={[
      styles.row,
      isDragging && styles.dragging,
      isHoverTarget && styles.hoverTarget,
    ]}>
      <View style={styles.content}>{children}</View>
      {editMode && (
        <View style={styles.handle} {...panResponder.panHandlers}>
          <Text style={styles.handleIcon}>⠿</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  dragging: { opacity: 0.5 },
  hoverTarget: { borderTopWidth: 2, borderTopColor: COLORS.primary },
  content: { flex: 1 },
  handle: {
    paddingHorizontal: 12, paddingVertical: 8,
    justifyContent: 'center', alignItems: 'center',
  },
  handleIcon: { color: COLORS.textMuted, fontSize: 18 },
});
