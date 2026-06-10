import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FloorPlanUploadDialog } from '@/components/waymarks/FloorPlanUploadDialog';
import type * as UseFloorsModule from '@/hooks/useFloors';

// Regression guard for the "two entry points" bug: the Add-Floor modal used to
// upload plans raw, bypassing Plan Prep. Both entry points now funnel through
// FloorPlanUploadDialog's shared handler, which emits "[plan-prep] entry" as its
// very first line. The modal reaches that handler via the `initialFile` handoff;
// this test exercises that path and asserts the marker fires.

vi.mock('@/hooks/useFloors', async (importOriginal) => {
  const actual = await importOriginal<typeof UseFloorsModule>();
  return { ...actual, useFloor: () => ({ data: { id: 'f1', plan_metadata: null } }) };
});
vi.mock('@/hooks/useAssets', () => ({ useAssets: () => ({ data: [] }) }));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('Plan Prep entry points', () => {
  it('auto-runs the shared handler (emits "[plan-prep] entry") on the initialFile handoff', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    // An image file exercises the handoff without needing the PDF.js worker.
    const file = new File([new Uint8Array([1, 2, 3])], 'plan.png', { type: 'image/png' });

    wrap(
      <FloorPlanUploadDialog
        open
        onOpenChange={() => {}}
        floorId="f1"
        floorLabel="Ground"
        buildingName="Tower"
        existingPlanUrl={null}
        initialFile={file}
      />
    );

    // The handoff lands on the shared review step — same end state as the
    // on-page Replace flow.
    expect(await screen.findByText('plan.png')).toBeInTheDocument();
    // And the unmissable entry marker fired for this entry point.
    expect(logSpy).toHaveBeenCalledWith(
      '[plan-prep] entry',
      expect.objectContaining({ type: 'image/png', name: 'plan.png' })
    );

    logSpy.mockRestore();
  });
});
