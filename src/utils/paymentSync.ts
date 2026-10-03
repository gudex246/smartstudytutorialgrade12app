import { PaymentTransaction, User } from '../types';
import { syncServerTransactions, getTransactions, getStudents } from './storage';

export interface PaymentStreamPayload {
  transaction?: PaymentTransaction;
  student?: User;
  txId?: string;
  studentId?: string;
  studentName?: string;
  pendingCount?: number;
  timestamp: number;
}

export type PaymentEventType = 'new_payment' | 'payment_approved' | 'payment_rejected' | 'connected';

/**
 * Synthesizes a crisp, pleasant notification bell chime using Web Audio API.
 * Guaranteed zero external asset dependencies, works offline and in PWA mode.
 */
export function playReceiptNotificationChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    // First tone (E5 - 659.25 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, ctx.currentTime);
    gain1.gain.setValueAtTime(0.2, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start();
    osc1.stop(ctx.currentTime + 0.3);

    // Second tone (G#5 - 830.61 Hz) after 100ms
    setTimeout(() => {
      try {
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(830.61, ctx.currentTime);
        gain2.gain.setValueAtTime(0.22, ctx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start();
        osc2.stop(ctx.currentTime + 0.45);
      } catch {}
    }, 100);
  } catch (err) {
    // Browsers with strict autoplay policy will silence until user interaction
  }
}

/**
 * Subscribes to real-time payment events from the server SSE stream.
 * Automatically synchronizes store and notifies all open components instantly.
 */
export function subscribeToPaymentStream(
  onEvent: (type: PaymentEventType, payload: PaymentStreamPayload) => void
): () => void {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
    return () => {};
  }

  let eventSource: EventSource | null = null;
  let isClosed = false;
  let reconnectTimeout: any = null;

  const connect = () => {
    if (isClosed) return;
    try {
      eventSource = new EventSource('/api/payments/stream');

      eventSource.addEventListener('connected', () => {
        // Connected to server payment stream
      });

      eventSource.addEventListener('new_payment', (e) => {
        try {
          const payload = JSON.parse(e.data) as PaymentStreamPayload;
          syncServerTransactions().then(() => {
            playReceiptNotificationChime();
            onEvent('new_payment', payload);
            window.dispatchEvent(new CustomEvent('sst_new_payment_receipt', { detail: payload }));
          });
        } catch (err) {
          console.warn('Failed parsing new_payment event:', err);
        }
      });

      eventSource.addEventListener('payment_approved', (e) => {
        try {
          const payload = JSON.parse(e.data) as PaymentStreamPayload;
          syncServerTransactions().then(() => {
            onEvent('payment_approved', payload);
            window.dispatchEvent(new CustomEvent('sst_payment_approved', { detail: payload }));
          });
        } catch (err) {
          console.warn('Failed parsing payment_approved event:', err);
        }
      });

      eventSource.addEventListener('payment_rejected', (e) => {
        try {
          const payload = JSON.parse(e.data) as PaymentStreamPayload;
          syncServerTransactions().then(() => {
            onEvent('payment_rejected', payload);
            window.dispatchEvent(new CustomEvent('sst_payment_rejected', { detail: payload }));
          });
        } catch (err) {
          console.warn('Failed parsing payment_rejected event:', err);
        }
      });

      eventSource.onerror = () => {
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        if (!isClosed) {
          // Reconnect after 3.5s
          reconnectTimeout = setTimeout(connect, 3500);
        }
      };
    } catch (err) {
      if (!isClosed) {
        reconnectTimeout = setTimeout(connect, 5000);
      }
    }
  };

  connect();

  return () => {
    isClosed = true;
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
  };
}

export function getPendingReceiptCount(): number {
  const txs = getTransactions();
  const students = getStudents();
  const pendingTx = txs.filter((t) => t.status === 'pending');
  const seen = new Set<string>();
  pendingTx.forEach((t) => {
    if (t.id) seen.add(t.id.toLowerCase());
    if (t.referenceNo) seen.add(t.referenceNo.toLowerCase());
    if (t.userEmail) seen.add(t.userEmail.toLowerCase());
  });
  let count = pendingTx.length;
  students.forEach((s) => {
    if (s.subscription?.status === 'pending_verification') {
      const sRef = (s.subscription.transactionId || '').toLowerCase();
      const sEmail = (s.email || '').toLowerCase();
      if ((!sRef || !seen.has(sRef)) && (!sEmail || !seen.has(sEmail))) {
        count++;
        if (sRef) seen.add(sRef);
        if (sEmail) seen.add(sEmail);
      }
    }
  });
  return count;
}
