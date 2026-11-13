import React, { useState } from 'react';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/+$/, '');
const PROFILE_IMAGE_BASE_URL = (import.meta.env.VITE_PROFILE_IMAGE_BASE_URL || `${API_BASE_URL}/api/profile-pictures`).replace(/\/+$/, '');

function profileImageUrl(value) {
  const image = value?.trim();
  if (!image) return '';
  if (/^(?:https?:|data:|blob:)/i.test(image)) return image;
  const filename = image.split(/[\\/]/).pop();
  return filename ? `${PROFILE_IMAGE_BASE_URL}/${encodeURIComponent(filename)}` : '';
}

function CommunityProfileAvatar({ person, size = '2.75rem' }) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = profileImageUrl(person.profilepict);
  const style = { width: size, height: size, flex: `0 0 ${size}`, objectFit: 'cover' };

  if (!imageUrl || imageFailed) {
    return <span className="rounded-circle border bg-secondary-subtle text-secondary d-inline-flex justify-content-center align-items-center" role="img" aria-label={`${person.first_name || ''} ${person.last_name || ''} profile picture unavailable`} style={style}><i className="bi bi-person-fill" aria-hidden="true" /></span>;
  }

  return <img src={imageUrl} alt={`${person.first_name || ''} ${person.last_name || ''} profile`} className="rounded-circle border" style={style} onError={() => setImageFailed(true)} />;
}

export default CommunityProfileAvatar;
