import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { AdvanceStatus, DisbursementStatus, SchoolInfo } from '../../shared/types';
import { api } from '../lib/api';

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

/** Letterhead for printed statements/receipts: school logo image + text.
 *  The text is the custom header from Settings when provided, otherwise the
 *  school name. Self-fetches its data. */
export function PrintHeader() {
  const [school, setSchool] = useState<SchoolInfo | null>(null);
  const [custom, setCustom] = useState<string | null>(null);

  useEffect(() => {
    void api.getSchoolInfo().then(setSchool).catch(() => undefined);
    void api
      .getPtaSettings()
      .then((s) => setCustom((s.print_header ?? '').trim() || null))
      .catch(() => undefined);
  }, []);

  return (
    <div className="print-header">
      {school?.logo_url && <img className="print-header-logo" src={school.logo_url} alt="School logo" />}
      <div className="print-header-text">
        {custom ? (
          <div className="print-header-custom">{custom}</div>
        ) : (
          <div className="print-header-name">{school?.school_name || 'PTA CD'}</div>
        )}
      </div>
    </div>
  );
}

/** Print only the open modal: expands it to full height (no clipped scrollbar)
 *  and hides the page content behind it. window.print() blocks while the dialog
 *  is open, so the class is active for the whole print.
 *  Pass `title` to make the Save-as-PDF dialog suggest a matching filename
 *  (Chromium uses document.title for the default file name). */
export function printModal(title?: string): void {
  const prevTitle = document.title;
  if (title) document.title = title;
  document.body.classList.add('print-modal');
  window.print();
  document.body.classList.remove('print-modal');
  if (title) document.title = prevTitle;
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
