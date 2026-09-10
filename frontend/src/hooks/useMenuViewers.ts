import { useEffect, useState } from 'react';
import { REALTIME_CHANNELS } from '../constants/realtime';
import { openRealtimeChannel } from '../lib/realtime';

interface ViewerPresence {
  viewer_id: string;
  joined_at: string;
}

function createViewerId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // randomUUID requires HTTPS; getRandomValues also works on a local HTTP LAN.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function useMenuViewers(trackViewer = false): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let active = true;
    const close = openRealtimeChannel(REALTIME_CHANNELS.menuViewers, { config: {} }, (channel) => {
      // Never persist this ID: duplicated tabs must count as separate visitors.
      const presence: ViewerPresence | null = trackViewer
        ? { viewer_id: createViewerId(), joined_at: new Date().toISOString() }
        : null;

      const sync = () => {
        if (!active) return;
        const viewers = Object.values(channel.presenceState<ViewerPresence>())
          .flat()
          .map((entry) => entry.viewer_id)
          .filter((id) => typeof id === 'string' && id.length > 0);
        setCount(new Set(viewers).size);
      };

      channel
        .on('presence', { event: 'sync' }, sync)
        .on('presence', { event: 'join' }, sync)
        .on('presence', { event: 'leave' }, sync)
        .subscribe((status) => {
          if (!active) return;
          if (status === 'SUBSCRIBED') {
            // SUBSCRIBED also fires after reconnecting; track this tab again.
            if (presence) void channel.track(presence).catch(() => {});
          } else {
            setCount(0);
          }
        });
    });

    return () => {
      active = false;
      close(); // Leaving the channel removes its tracked presence as well.
    };
  }, [trackViewer]);

  return count;
}
