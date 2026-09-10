import type { RealtimeChannel, RealtimeChannelOptions } from '@supabase/supabase-js';
import { supabase } from './supabase';

const operations = new Map<string, Promise<void>>();

function enqueue(topic: string, operation: () => void | Promise<void>) {
  const pending = (operations.get(topic) ?? Promise.resolve())
    .then(operation)
    .catch(() => {
      // Connection errors must not affect the page or create unhandled rejections.
    });
  operations.set(topic, pending);
  void pending.then(() => {
    if (operations.get(topic) === pending) operations.delete(topic);
  });
}

/** One page owns each topic. Serialize teardown before reusing the same topic. */
export function openRealtimeChannel(
  topic: string,
  options: RealtimeChannelOptions,
  subscribe: (channel: RealtimeChannel) => void,
): () => void {
  const client = supabase;
  if (!client) return () => {};

  let disposed = false;
  let channel: RealtimeChannel | undefined;

  // Deferring creation avoids a throwaway connection in React StrictMode.
  enqueue(topic, () => {
    if (disposed) return;
    channel = client.channel(topic, options);
    subscribe(channel);
  });

  return () => {
    disposed = true;
    enqueue(topic, async () => {
      if (channel) await client.removeChannel(channel);
    });
  };
}
