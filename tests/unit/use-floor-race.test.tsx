import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { createElement } from 'react';
import type { Floor } from '@/types/database';

// Regression guard for the first-60-seconds signup bug: opening a just-created
// floor showed "Floor not found" because getFloor read back empty during the
// RLS grant-visibility / read-after-write window, and a null result was cached
// with no retry. useFloor now treats a transient empty read as retryable.

const getFloorMock = vi.fn();
vi.mock('@/lib/queries/floors', () => ({
  getFloor: (id: string) => getFloorMock(id),
  createFloor: vi.fn(),
  listFloorsByBuilding: vi.fn(),
  nextFloorSortOrder: vi.fn(),
  softDeleteFloor: vi.fn(),
}));

import { useFloor } from '@/hooks/useFloors';

const floor = { id: 'f1', label: 'Ground', building_id: 'b1', plan_url: null } as unknown as Floor;

function wrapper() {
  const qc = new QueryClient();
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

describe('useFloor RLS-race resilience', () => {
  beforeEach(() => getFloorMock.mockReset());

  it('retries a transient empty read and heals to the floor', async () => {
    getFloorMock.mockResolvedValueOnce(null).mockResolvedValue(floor);
    const { result } = renderHook(() => useFloor('f1'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toEqual(floor), { timeout: 2500 });
    expect(getFloorMock).toHaveBeenCalledTimes(2); // first miss, then heal
  });

  it('settles to an error (→ not-found) when the floor stays unreadable', async () => {
    getFloorMock.mockResolvedValue(null);
    const { result } = renderHook(() => useFloor('f1'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 4000 });
    // initial try + 3 retries
    expect(getFloorMock).toHaveBeenCalledTimes(4);
  });
});
