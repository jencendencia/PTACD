// User Manual viewer modal — opens the bundled PDF manual in an embedded viewer.
import { useEffect, useState } from 'react';
import { api, isElectron } from '../lib/api';
import { Modal } from './shared';

export function UserManualModal({ onClose }: { onClose: () => void }) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (isElectron) {
          // In Electron, use the custom pta-manual:// protocol served by the main process.
          const _path = await api.getUserManualPath(); // triggers the IPC, path validates the file exists
          void _path; // we don't need the path — the iframe loads via the protocol
          if (!cancelled) setPdfUrl('pta-manual://manual/PTA_CD_User_Manual.pdf');
        } else {
          // Browser mock mode: serve the PDF from the public directory.
          if (!cancelled) setPdfUrl('PTA_CD_User_Manual.pdf');
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the user manual.');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <Modal title="User Manual" onClose={onClose} wide>
      {error ? (
        <div style={{ padding: 24, textAlign: 'center' }}>
          <p style={{ color: '#dc2626', marginBottom: 12 }}>{error}</p>
          <p style={{ color: '#6b7280', fontSize: 14 }}>
            The user manual PDF could not be loaded. Make sure the file is present in the app resources.
          </p>
        </div>
      ) : !pdfUrl ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>
          Loading user manual...
        </div>
      ) : (
        <iframe
          src={pdfUrl}
          title="PTA CD User Manual"
          style={{
            width: '100%',
            height: '70vh',
            border: 'none',
            borderRadius: 8,
          }}
        />
      )}
    </Modal>
  );
}
