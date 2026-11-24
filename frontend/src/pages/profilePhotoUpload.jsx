import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import ProfilePhotoCrop from '../components/ProfilePhotoCrop';
import { processProfilePicture } from '../utils/processProfilePicture';

const apiUrl = new URL(import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000', window.location.origin);
if (['localhost', '127.0.0.1', '[::1]'].includes(apiUrl.hostname)) {
  apiUrl.hostname = window.location.hostname;
}
const uploadUrl = `${apiUrl.href.replace(/\/+$/, '')}/api/users/profile-photo-upload`;
const mobilePhotoOptions = { maxDimension: 1024, maxBytes: 256 * 1024, qualities: [0.94, 0.88, 0.82, 0.76, 0.68] };

function photoBlob(dataUrl) {
  const encoded = dataUrl.slice('data:image/jpeg;base64,'.length);
  return new Blob([Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))], { type: 'image/jpeg' });
}

export default function ProfilePhotoUpload() {
  const { hash } = useLocation();
  return <PhotoUploadForm key={hash} token={hash.slice(1)} />;
}

function PhotoUploadForm({ token }) {
  const draftKey = `profile-photo-draft:${token.split('.')[0]}`;
  const [photo, setPhoto] = useState(() => {
    try {
      return token ? sessionStorage.getItem(draftKey) : null;
    } catch {
      return null;
    }
  });
  const [preparing, setPreparing] = useState(false);
  const [cropping, setCropping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(() => !token && window.history.state?.profilePhotoSent === true);
  const [error, setError] = useState('');

  const choosePhoto = async (event) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    await preparePhoto(file);
    input.value = '';
  };

  const preparePhoto = async (file) => {
    setPreparing(true);
    setError('');
    try {
      const picture = await processProfilePicture(file, mobilePhotoOptions);
      const preview = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Could not prepare the photo preview.'));
        reader.readAsDataURL(picture);
      });
      try {
        sessionStorage.setItem(draftKey, preview);
      } catch {
        // The preview can still be used in this page when storage is unavailable.
      }
      setPhoto(preview);
      setCropping(false);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setPreparing(false);
    }
  };

  const upload = async () => {
    if (!photo || cropping || preparing || busy || sent) return;
    setBusy(true);
    setError('');
    try {
      const picture = photoBlob(photo);
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': picture.type, 'X-Photo-Upload': token },
        body: picture,
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.message || 'Could not send the photo. Try again.');
      }
      setSent(true);
      try {
        sessionStorage.removeItem(draftKey);
      } catch {
        // The upload is complete even when storage is unavailable.
      }
      window.history.replaceState(
        { ...window.history.state, profilePhotoSent: true },
        '',
        window.location.pathname + window.location.search,
      );
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <main className="container py-5 text-center" style={{ maxWidth: 480 }}>
        <div role="status">
          <i className="bi bi-check-circle-fill text-success fs-1" aria-hidden="true" />
          <h1 className="h3 mt-3">Thank you!</h1>
          <p className="mb-0">Your photo was sent successfully. You can now close this page.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="container py-4" style={{ maxWidth: 480 }}>
      <h1 className="h3">Upload profile photo</h1>
      {!token ? (
        <p role="alert">Scan the QR code from Edit User to upload a photo.</p>
      ) : cropping ? (
        <>
          <ProfilePhotoCrop photo={photo} busy={preparing} onApply={preparePhoto} onCancel={() => setCropping(false)} />
          {error && <p className="text-danger" role="alert">{error}</p>}
        </>
      ) : (
        <div>
          {photo && (
            <figure className="mb-3">
              <img src={photo} alt="Selected profile photo" className="img-fluid rounded border" style={{ maxHeight: '45dvh', objectFit: 'contain' }} />
              <figcaption className="small text-secondary mt-2">Preview your photo before sending it.</figcaption>
            </figure>
          )}
          <div className="d-flex flex-wrap gap-2 mb-3">
            {photo && <button type="button" className="btn btn-outline-secondary" onClick={() => { setError(''); setCropping(true); }} disabled={busy || preparing}>Crop photo</button>}
            <label className={`btn btn-outline-secondary${busy || preparing ? ' disabled' : ''}`}>
              {photo ? 'Retake photo' : 'Take photo'}
              <input type="file" accept="image/*" capture="environment" className="visually-hidden" onChange={choosePhoto} disabled={busy || preparing} />
            </label>
            <label className={`btn btn-outline-secondary${busy || preparing ? ' disabled' : ''}`}>
              {photo ? 'Choose another photo' : 'Choose photo'}
              <input type="file" accept="image/*" className="visually-hidden" onChange={choosePhoto} disabled={busy || preparing} />
            </label>
          </div>
          {error && <p className="text-danger" role="alert">{error}</p>}
          {preparing && <p className="small" role="status">Preparing preview…</p>}
          <button type="button" className="btn btn-success" onClick={upload} disabled={!photo || busy || preparing}>{busy ? 'Sending…' : 'Send photo'}</button>
        </div>
      )}
    </main>
  );
}
