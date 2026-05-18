import { useRef, useState } from 'react';
import {
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { COLORS } from '../../constants';
import { useCriteriaStore } from '../../store/criteriaStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CriteriaId, ScreenerCriteria } from '../../types';

export default function CriteriaScreen() {
  const { criteria, matchMode, setMatchMode, toggleCriteria, setThreshold, setThreshold2, reorderCriteria } = useCriteriaStore();
  const { minScore, save: saveSettings } = useSettingsStore();
  const scrollRef = useRef<ScrollView>(null);
  const [editMode, setEditMode] = useState(false);

  const buyCriteria = criteria.filter((c) => c.signal === 'buy');
  const sellCriteria = criteria.filter((c) => c.signal === 'sell');

  function toggleEditMode() {
    setEditMode((prev) => !prev);
    // Scroll stays enabled — it's only paused while a handle is actively held
  }

  function makeHandlers(c: ScreenerCriteria) {
    return {
      onToggle: () => toggleCriteria(c.id),
      onDecrement: () => {
        const next = Math.max(c.thresholdMin, +(c.threshold - c.thresholdStep).toFixed(2));
        setThreshold(c.id, next);
      },
      onIncrement: () => {
        const next = Math.min(c.thresholdMax, +(c.threshold + c.thresholdStep).toFixed(2));
        setThreshold(c.id, next);
      },
      onDecrement2: c.threshold2 != null ? () => {
        const next = Math.max(c.threshold2Min ?? 1, +((c.threshold2 ?? 0) - (c.threshold2Step ?? 1)).toFixed(2));
        setThreshold2(c.id, next);
      } : undefined,
      onIncrement2: c.threshold2 != null ? () => {
        const next = Math.min(c.threshold2Max ?? 100, +((c.threshold2 ?? 0) + (c.threshold2Step ?? 1)).toFixed(2));
        setThreshold2(c.id, next);
      } : undefined,
    };
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      {/* Match mode toggle */}
      <View style={styles.matchModeCard}>
        <View style={styles.matchModeText}>
          <Text style={styles.matchModeTitle}>Match Mode</Text>
          <Text style={styles.matchModeDesc}>
            {matchMode === 'any'
              ? 'Stock matches if ANY enabled criteria triggers'
              : 'Stock matches only if ALL enabled criteria trigger'}
          </Text>
        </View>
        <View style={styles.matchModeBtns}>
          <TouchableOpacity
            style={[styles.matchModeBtn, matchMode === 'any' && styles.matchModeBtnActive]}
            onPress={() => setMatchMode('any')}
          >
            <Text style={[styles.matchModeBtnText, matchMode === 'any' && styles.matchModeBtnTextActive]}>ANY</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.matchModeBtn, matchMode === 'all' && styles.matchModeBtnActive]}
            onPress={() => setMatchMode('all')}
          >
            <Text style={[styles.matchModeBtnText, matchMode === 'all' && styles.matchModeBtnTextActive]}>ALL</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Min Score */}
      <View style={styles.minScoreCard}>
        <View style={styles.minScoreLeft}>
          <Text style={styles.minScoreTitle}>Minimum Buy Score</Text>
          <Text style={styles.minScoreDesc}>Hide buy signals with a score below this</Text>
        </View>
        <View style={styles.stepper}>
          <TouchableOpacity style={styles.stepperBtn} onPress={() => saveSettings({ minScore: Math.max(0, minScore - 1) })}>
            <Text style={styles.stepperBtnText}>−</Text>
          </TouchableOpacity>
          <Text style={styles.stepperValue}>{minScore}</Text>
          <TouchableOpacity style={styles.stepperBtn} onPress={() => saveSettings({ minScore: minScore + 1 })}>
            <Text style={styles.stepperBtnText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Section header with edit toggle */}
      <View style={styles.sectionRow}>
        <Text style={styles.sectionLabel}>BUY CRITERIA — scans all NASDAQ stocks</Text>
        <TouchableOpacity style={[styles.editBtn, editMode && styles.editBtnActive]} onPress={toggleEditMode}>
          <Text style={[styles.editBtnText, editMode && styles.editBtnTextActive]}>
            {editMode ? 'Done' : 'Reorder'}
          </Text>
        </TouchableOpacity>
      </View>
      <DraggableSection
        items={buyCriteria}
        editMode={editMode}
        onReorder={reorderCriteria}
        onDragStateChange={(dragging) => scrollRef.current?.setNativeProps({ scrollEnabled: !dragging })}
        renderItem={(c) => <CriteriaCard criteria={c} editMode={editMode} {...makeHandlers(c)} />}
      />

      <View style={[styles.sectionRow, { marginTop: 24 }]}>
        <Text style={styles.sectionLabel}>SELL CRITERIA — scans your portfolio only</Text>
      </View>
      <DraggableSection
        items={sellCriteria}
        editMode={editMode}
        onReorder={reorderCriteria}
        onDragStateChange={(dragging) => scrollRef.current?.setNativeProps({ scrollEnabled: !dragging })}
        renderItem={(c) => <CriteriaCard criteria={c} editMode={editMode} {...makeHandlers(c)} />}
      />

      <Text style={styles.note}>
        {editMode ? 'Drag ⠿ handles to reorder. Tap Done when finished.' : 'Tap Reorder to change the order of criteria.'}
      </Text>
    </ScrollView>
  );
}

// ── Draggable section ──────────────────────────────────────────────────────

function DraggableSection({
  items,
  editMode,
  onReorder,
  onDragStateChange,
  renderItem,
}: {
  items: ScreenerCriteria[];
  editMode: boolean;
  onReorder: (fromId: CriteriaId, toId: CriteriaId) => void;
  onDragStateChange: (dragging: boolean) => void;
  renderItem: (item: ScreenerCriteria) => React.ReactNode;
}) {
  const [order, setOrder] = useState<CriteriaId[]>(() => items.map((i) => i.id));
  const [draggingId, setDraggingId] = useState<CriteriaId | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const heights = useRef<Partial<Record<CriteriaId, number>>>({});
  const sectionRef = useRef<View>(null);
  const sectionPageY = useRef(0);
  const hoverIndexRef = useRef<number | null>(null);

  // Keep order in sync when new criteria are added
  const allIds = items.map((i) => i.id);
  const syncedOrder = [
    ...order.filter((id) => allIds.includes(id)),
    ...allIds.filter((id) => !order.includes(id)),
  ];

  const orderedItems = syncedOrder
    .map((id) => items.find((i) => i.id === id))
    .filter(Boolean) as ScreenerCriteria[];

  const orderedItemsRef = useRef(orderedItems);
  orderedItemsRef.current = orderedItems;

  function getIndexForY(pageY: number) {
    const localY = pageY - sectionPageY.current;
    const list = orderedItemsRef.current;
    let acc = 0;
    for (let i = 0; i < list.length; i++) {
      const h = heights.current[list[i].id as CriteriaId] ?? 80;
      if (localY < acc + h / 2) return i;
      acc += h;
    }
    return list.length - 1;
  }

  function handleDragStart(id: CriteriaId) {
    sectionRef.current?.measure((_x, _y, _w, _h, _px, py) => {
      sectionPageY.current = py;
    });
    const startIdx = orderedItemsRef.current.findIndex((i) => i.id === id);
    hoverIndexRef.current = startIdx;
    setDraggingId(id);
    setHoverIndex(startIdx);
    onDragStateChange(true);
  }

  function handleDragMove(pageY: number) {
    const idx = getIndexForY(pageY);
    hoverIndexRef.current = idx;
    setHoverIndex(idx);
  }

  function handleDragEnd(id: CriteriaId) {
    const list = orderedItemsRef.current;
    const fromIdx = list.findIndex((i) => i.id === id);
    const toIdx = hoverIndexRef.current ?? fromIdx;
    if (fromIdx !== toIdx) {
      const newOrder = [...syncedOrder];
      const [moved] = newOrder.splice(fromIdx, 1);
      newOrder.splice(toIdx, 0, moved);
      setOrder(newOrder);
      onReorder(id, list[toIdx].id);
    }
    hoverIndexRef.current = null;
    setDraggingId(null);
    setHoverIndex(null);
    onDragStateChange(false);
  }

  return (
    <View ref={sectionRef}>
      {orderedItems.map((item, index) => (
        <DraggableItem
          key={item.id}
          id={item.id}
          editMode={editMode}
          isDragging={draggingId === item.id}
          isHoverTarget={hoverIndex === index && draggingId !== null && draggingId !== item.id}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
          onLayout={(h) => { heights.current[item.id as CriteriaId] = h; }}
        >
          {renderItem(item)}
        </DraggableItem>
      ))}
    </View>
  );
}

// ── Draggable item ─────────────────────────────────────────────────────────

function DraggableItem({
  id, editMode, isDragging, isHoverTarget,
  onDragStart, onDragMove, onDragEnd, onLayout, children,
}: {
  id: CriteriaId;
  editMode: boolean;
  isDragging: boolean;
  isHoverTarget: boolean;
  onDragStart: (id: CriteriaId) => void;
  onDragMove: (pageY: number) => void;
  onDragEnd: (id: CriteriaId) => void;
  onLayout: (height: number) => void;
  children: React.ReactNode;
}) {
  const isDraggingRef = useRef(false);
  // Keep latest callbacks in refs so the PanResponder (created once) always
  // calls the current version — prevents stale-closure reorder bugs.
  const onDragStartRef = useRef(onDragStart);
  const onDragMoveRef  = useRef(onDragMove);
  const onDragEndRef   = useRef(onDragEnd);
  onDragStartRef.current = onDragStart;
  onDragMoveRef.current  = onDragMove;
  onDragEndRef.current   = onDragEnd;

  // PanResponder lives on the handle only. Scroll is already disabled in edit
  // mode so we can claim touch immediately with no conflict.
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,

      onPanResponderGrant: () => {
        isDraggingRef.current = true;
        onDragStartRef.current(id);
      },

      onPanResponderMove: (e) => {
        onDragMoveRef.current(e.nativeEvent.pageY);
      },

      onPanResponderRelease: () => {
        isDraggingRef.current = false;
        onDragEndRef.current(id);
      },

      onPanResponderTerminate: () => {
        isDraggingRef.current = false;
        onDragEndRef.current(id);
      },
    })
  ).current;

  return (
    <View
      onLayout={(e) => onLayout(e.nativeEvent.layout.height)}
      style={[
        styles.draggableRow,
        isDragging && styles.draggingItem,
        isHoverTarget && styles.hoverTarget,
      ]}
    >
      {/* Card content */}
      <View style={styles.draggableContent}>
        {children}
      </View>

      {/* Drag handle — visible in edit mode only, PanResponder attached here */}
      {editMode && (
        <View style={styles.handleArea} {...panResponder.panHandlers}>
          <Text style={styles.handleIcon}>⠿</Text>
        </View>
      )}
    </View>
  );
}

// ── Criteria card ──────────────────────────────────────────────────────────

function CriteriaCard({
  criteria, editMode, onToggle, onDecrement, onIncrement, onDecrement2, onIncrement2,
}: {
  criteria: ScreenerCriteria;
  editMode: boolean;
  onToggle: () => void;
  onDecrement: () => void;
  onIncrement: () => void;
  onDecrement2?: () => void;
  onIncrement2?: () => void;
}) {
  const isBuy = criteria.signal === 'buy';
  const accentColor = isBuy ? COLORS.buy : COLORS.sell;

  return (
    <View style={[styles.card, criteria.enabled && { borderColor: accentColor + '55' }]}>
      <View style={[styles.accent, { backgroundColor: accentColor }]} />
      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <View style={styles.cardTitles}>
            <Text style={styles.cardName}>{criteria.name}</Text>
            {!editMode && <Text style={styles.cardDesc}>{criteria.description}</Text>}
          </View>
          {!editMode && (
            <TouchableOpacity
              style={[styles.toggle, criteria.enabled && { backgroundColor: accentColor }]}
              onPress={onToggle}
            >
              <Text style={[styles.toggleText, criteria.enabled && { color: '#000' }]}>
                {criteria.enabled ? 'ON' : 'OFF'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {!editMode && criteria.enabled && (
          <View style={styles.thresholdGroup}>
            <View style={styles.threshold}>
              <Text style={styles.thresholdLabel}>{criteria.thresholdLabel}</Text>
              <View style={styles.stepper}>
                <TouchableOpacity style={styles.stepBtn} onPress={onDecrement} disabled={criteria.threshold <= criteria.thresholdMin}>
                  <Text style={styles.stepBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.thresholdValue}>
                  {criteria.thresholdStep < 1 ? criteria.threshold.toFixed(1) : criteria.threshold}
                  {criteria.thresholdSuffix ?? ''}
                </Text>
                <TouchableOpacity style={styles.stepBtn} onPress={onIncrement} disabled={criteria.threshold >= criteria.thresholdMax}>
                  <Text style={styles.stepBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            {criteria.threshold2 != null && onDecrement2 && onIncrement2 && (
              <View style={[styles.threshold, styles.threshold2]}>
                <Text style={styles.thresholdLabel}>{criteria.threshold2Label}</Text>
                <View style={styles.stepper}>
                  <TouchableOpacity style={styles.stepBtn} onPress={onDecrement2} disabled={(criteria.threshold2 ?? 0) <= (criteria.threshold2Min ?? 1)}>
                    <Text style={styles.stepBtnText}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.thresholdValue}>
                    {(criteria.threshold2Step ?? 1) < 1 ? (criteria.threshold2 ?? 0).toFixed(1) : criteria.threshold2}
                    {criteria.threshold2Suffix ?? ''}
                  </Text>
                  <TouchableOpacity style={styles.stepBtn} onPress={onIncrement2} disabled={(criteria.threshold2 ?? 0) >= (criteria.threshold2Max ?? 100)}>
                    <Text style={styles.stepBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 40 },
  minScoreCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: 12,
    padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: COLORS.border,
  },
  minScoreLeft: { flex: 1 },
  minScoreTitle: { color: COLORS.text, fontWeight: '700', fontSize: 14 },
  minScoreDesc: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepperBtn: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: COLORS.surfaceAlt, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  stepperBtnText: { color: COLORS.text, fontSize: 18, fontWeight: '700', lineHeight: 22 },
  stepperValue: { color: COLORS.primary, fontSize: 20, fontWeight: '800', minWidth: 28, textAlign: 'center' },
  sectionRow: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 10,
  },
  sectionLabel: {
    flex: 1,
    color: COLORS.textMuted, fontSize: 10, fontWeight: '700',
    letterSpacing: 1.5,
  },
  editBtn: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6,
    backgroundColor: COLORS.surfaceAlt, borderWidth: 1, borderColor: COLORS.border,
  },
  editBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  editBtnText: { color: COLORS.textMuted, fontSize: 12, fontWeight: '700' },
  editBtnTextActive: { color: '#000' },
  draggableRow: { flexDirection: 'row', alignItems: 'center' },
  draggableContent: { flex: 1 },
  handleArea: {
    width: 44, alignItems: 'center', justifyContent: 'center',
    alignSelf: 'stretch',
  },
  handleIcon: { color: COLORS.textMuted, fontSize: 22 },
  matchModeCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 20, gap: 12,
  },
  matchModeText: { flex: 1 },
  matchModeTitle: { color: COLORS.text, fontWeight: '700', fontSize: 14 },
  matchModeDesc: { color: COLORS.textSecondary, fontSize: 12, marginTop: 3, lineHeight: 17 },
  matchModeBtns: { flexDirection: 'row', gap: 6 },
  matchModeBtn: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8,
    backgroundColor: COLORS.surfaceAlt, borderWidth: 1, borderColor: COLORS.border,
  },
  matchModeBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  matchModeBtnText: { color: COLORS.textMuted, fontWeight: '700', fontSize: 13 },
  matchModeBtnTextActive: { color: '#000' },
  draggingItem: { opacity: 0.45, transform: [{ scale: 1.02 }] },
  hoverTarget: { borderTopWidth: 2, borderTopColor: COLORS.primary },
  card: {
    flexDirection: 'row', backgroundColor: COLORS.surface,
    borderRadius: 12, marginBottom: 10, overflow: 'hidden',
    borderWidth: 1, borderColor: COLORS.border,
  },
  accent: { width: 4 },
  cardBody: { flex: 1, padding: 14 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardTitles: { flex: 1 },
  cardName: { color: COLORS.text, fontWeight: '700', fontSize: 14 },
  cardDesc: { color: COLORS.textSecondary, fontSize: 12, marginTop: 3, lineHeight: 17 },
  toggle: {
    borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: COLORS.surfaceAlt, borderWidth: 1, borderColor: COLORS.border,
    minWidth: 48, alignItems: 'center',
  },
  toggleText: { color: COLORS.textMuted, fontWeight: '700', fontSize: 12 },
  thresholdGroup: {
    marginTop: 14, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: COLORS.border, gap: 10,
  },
  threshold: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  threshold2: { paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border },
  thresholdLabel: { color: COLORS.textSecondary, fontSize: 12 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepBtn: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: COLORS.surfaceAlt, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  stepBtnText: { color: COLORS.text, fontSize: 18, lineHeight: 22 },
  thresholdValue: {
    color: COLORS.primary, fontWeight: '700', fontSize: 16, minWidth: 50, textAlign: 'center',
  },
  note: {
    color: COLORS.textMuted, fontSize: 12, textAlign: 'center',
    lineHeight: 18, marginTop: 20, paddingHorizontal: 8,
  },
});
