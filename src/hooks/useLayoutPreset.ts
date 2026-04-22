/**
 * useLayoutPreset hook
 *
 * Returns the appropriate Dagre layout preset for the current view type.
 */

import { useMemo } from 'react';
import { useAppStore } from '../store/store';
import { getLayoutPreset, type LayoutPreset } from '../utils/layout';

export function useLayoutPreset(): LayoutPreset {
  const activeView = useAppStore((s) => s.activeView);

  return useMemo(() => getLayoutPreset(activeView), [activeView]);
}
