import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';

function PhotoTransfer({ apiBaseUrl, userId, onPhoto }) {
  const [qr, setQr] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let stopped = false;
    let timer;
    let uploadUrl;
    const headers = { Authorization: `Bearer ${localStorage.getItem('ld_cert_token') || ''}` };
    const endpoint = `${apiBaseUrl}/api/users/${userId}/profile-photo-uploads`;
    const revoke = () => {
      if (!uploadUrl) return;
      fetch(uploadUrl, { method: 'DELETE', headers, keepalive: true }).catch(() => {});
      uploadUrl = undefined;
    };
    const fail = (failure) => {
      revoke();
      if (!stopped) setError(failure.message);
    };

    const poll = async () => {
      try {
        const response = await fetch(uploadUrl, { headers });
        if (stopped) return;
        if (response.status === 204) {
          timer = setTimeout(poll, 2000);
          return;
        }
        if (!response.ok) throw new Error('This photo link is no longer active. Close it and generate a new QR code.');
        const photo = await response.blob();
        if (!stopped) onPhoto(photo);
      } catch (failure) {
        fail(failure);
      }
    };

    const start = async () => {
      const phoneUrl = new URL('/profile-photo-upload', window.location.origin);
      const loopback = ['localhost', '127.0.0.1', '[::1]'];
      if (loopback.includes(phoneUrl.hostname)) {
        const apiHost = new URL(apiBaseUrl, window.location.origin).hostname;
        if (loopback.includes(apiHost)) throw new Error('Open the app using its Wi-Fi address to generate a QR code your phone can reach.');
        phoneUrl.hostname = apiHost;
      }
      const response = await fetch(endpoint, { method: 'POST', headers });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Could not generate a photo upload link.');
      uploadUrl = `${endpoint}/${result.id}`;
      if (stopped) { revoke(); return; }
      phoneUrl.hash = result.token;
      const image = await QRCode.toDataURL(phoneUrl.href, { width: 192 });
      if (stopped) return;
      setQr(image);
      poll();
    };
    start().catch(fail);
    return () => {
      stopped = true;
      clearTimeout(timer);
      revoke();
    };
  }, [apiBaseUrl, userId, onPhoto]);

  if (error) return <p className="small text-danger mb-0" role="alert">{error}</p>;
  if (!qr) return <p className="small mb-0" role="status">Generating QR code…</p>;
  return (
    <div className="text-center">
      <img src={qr} width="192" height="192" alt="Scan to upload a profile photo" />
      <p className="small mb-0">Scan with your phone’s camera. The link expires in 5 minutes.</p>
    </div>
  );
}

export default function ProfilePhotoQr({ apiBaseUrl, userId, onPhoto }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef(null);
  const trigger = useRef(null);

  useEffect(() => {
    if (open && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [open]);

  const receivePhoto = React.useCallback((photo) => {
    onPhoto(photo);
    dialog.current?.close();
  }, [onPhoto]);

  return (
    <div>
      <button ref={trigger} type="button" className="btn btn-outline-secondary rounded-circle profile-photo-action" title="Upload photo from phone" aria-label="Upload photo from phone" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <i className="bi bi-qr-code" aria-hidden="true" />
      </button>
      {open && (
        <dialog ref={dialog} className="profile-photo-dialog border-0 rounded-3 shadow p-4" aria-labelledby="profile-photo-dialog-title" onClose={() => { setOpen(false); trigger.current?.focus(); }}>
          <div className="d-flex align-items-center justify-content-between gap-3 mb-2">
            <h2 id="profile-photo-dialog-title" className="h5 mb-0">Upload photo from phone</h2>
            <button type="button" className="profile-photo-dialog-close border-0 bg-transparent p-1" aria-label="Close QR code" onClick={() => dialog.current?.close()}>
              <i className="bi bi-x-lg" aria-hidden="true" />
            </button>
          </div>
          <PhotoTransfer apiBaseUrl={apiBaseUrl} userId={userId} onPhoto={receivePhoto} />
        </dialog>
      )}
    </div>
  );
}
