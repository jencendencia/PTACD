import type { ReactNode } from 'react';
import type { AdvanceStatus, DisbursementStatus } from '../../shared/types';

/** Today's date as YYYY-MM-DD in the LOCAL timezone (toISOString is UTC and
 *  can return yesterday before 8 AM in PH time). */
export function todayIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function fmtMoney(n: number): string {
  const v = Number(n) || 0;
  return `₱${v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtDateTime(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="spin-wrap">
      <div className="spinner" />
      {label && <span className="text-dim">{label}</span>}
    </div>
  );
}

export function Toast({ message, tone = 'success' }: { message: string; tone?: 'success' | 'error' }) {
  return <div className={`toast ${tone === 'success' ? 'toast-success' : 'toast-error'}`}>{message}</div>;
}

export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn-icon" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

const DISB_CLS: Record<DisbursementStatus, string> = {
  DRAFT: 'pill-dim',
  APPROVED: 'pill-warn',
  PAID: 'pill-success',
};
export const DISB_LABEL: Record<DisbursementStatus, string> = { DRAFT: 'DRAFT', APPROVED: 'APPROVED', PAID: 'PAID' };

export function DisbStatusPill({ status }: { status: DisbursementStatus }) {
  return <span className={`pill ${DISB_CLS[status]}`}>{DISB_LABEL[status]}</span>;
}

const ADV_CLS: Record<AdvanceStatus, string> = {
  ISSUED: 'pill-info',
  PARTIALLY_LIQUIDATED: 'pill-warn',
  LIQUIDATED: 'pill-success',
  RETURNED: 'pill-dim',
};
const ADV_LABEL: Record<AdvanceStatus, string> = {
  ISSUED: 'ISSUED',
  PARTIALLY_LIQUIDATED: 'PARTIAL LIQUIDATION',
  LIQUIDATED: 'LIQUIDATED',
  RETURNED: 'RETURNED',
};

export function AdvStatusPill({ status }: { status: AdvanceStatus }) {
  return <span className={`pill ${ADV_CLS[status]}`}>{ADV_LABEL[status]}</span>;
}
