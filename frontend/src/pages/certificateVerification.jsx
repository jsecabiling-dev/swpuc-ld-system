import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import SiteFooter from '../components/SiteFooter';
import sdaLogoGreen from './thumbnails/sda_logo_green.png';
import { formatCertificateLevel } from '../utils/certificateVerification';
import { formatShortDate } from '../utils/dateFormat';

const apiBase = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/+$/, '');
const photoBase = (import.meta.env.VITE_PROFILE_IMAGE_BASE_URL || `${apiBase}/api/profile-pictures`).replace(/\/+$/, '');
const displayDate = (date) => formatShortDate(date && `${date}T00:00:00`);

function RecipientPhoto({ name, photo }) {
  const [failed, setFailed] = useState(false);
  const filename = photo?.trim().split(/[\\/]/).pop();
  const initials = name.trim().split(/\s+/).filter(Boolean);
  const avatarSize = { width: '7rem', height: '7rem' };

  if (filename && !failed) {
    return <img src={`${photoBase}/${encodeURIComponent(filename)}`} alt={`${name} profile photo`} className="rounded-circle border object-fit-cover" style={avatarSize} onError={() => setFailed(true)} />;
  }

  return <span className="rounded-circle bg-success-subtle text-success-emphasis d-inline-grid align-items-center text-center fs-4" style={avatarSize} aria-hidden="true">{initials.length ? `${initials[0][0]}${initials.length > 1 ? initials.at(-1)[0] : ''}`.toUpperCase() : ''}</span>;
}

function CertificateResult({ code }) {
  const [result, setResult] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${apiBase}/api/certificates/${encodeURIComponent(code)}`, { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 404) return { message: 'No valid certificate was found for this link.' };
        if (!response.ok) throw new Error('Verification is temporarily unavailable. Try again later.');
        return { certificate: await response.json() };
      })
      .then((data) => { if (!controller.signal.aborted) setResult(data); })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ message: 'Verification is temporarily unavailable. Try again later.' });
      });
    return () => controller.abort();
  }, [code]);

  if (!result) return <p className="mb-0" role="status">Checking certificate…</p>;
  if (!result.certificate) return <p className="alert alert-warning mb-0" role="alert">{result.message}</p>;

  const { certificate } = result;
  const dates = certificate.start_date && [certificate.start_date, certificate.end_date]
    .filter((date, index, values) => date && values.indexOf(date) === index).map(displayDate).join(' – ');
  const details = [
    ['Certificate Number', certificate.certificate_number],
    ['Recipient', certificate.recipient_name],
    ['Learning Program', certificate.course_title],
    ['Learning Level', formatCertificateLevel(certificate.learning_level)],
    ['Facilitating Institution', certificate.offering_institution],
    ['Event Dates', dates],
    ['Issued On', displayDate(certificate.certification_date)],
  ];

  return (
    <>
      <p className="text-success fw-semibold"><i className="bi bi-check-circle-fill me-2" aria-hidden="true" />Certificate Verified</p>
      <div className="mb-4">
        <div className="d-inline-flex rounded-circle border border-success-subtle p-1">
          <RecipientPhoto name={certificate.recipient_name} photo={certificate.recipient_photo} />
        </div>
      </div>
      <dl className="list-group list-group-flush border rounded-3 mb-0">
        {details.filter(([, value]) => value).map(([label, value]) => (
          <div className="list-group-item d-sm-flex align-items-baseline px-3 py-2" key={label}>
            <dt className="col-sm-5 pe-sm-3 small text-secondary fw-semibold">{label}</dt>
            <dd className="col-sm-7 text-break mb-0">{value}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

export default function CertificateVerification() {
  const { code } = useParams();
  return (
    <div className="min-vh-100 d-flex flex-column">
      <main className="container py-4 py-md-5" style={{ maxWidth: 700 }}>
        <section className="card border-0 rounded-4 shadow-sm p-4 p-md-5">
          <header className="border-bottom pb-3 mb-4">
            <img src={sdaLogoGreen} width="64" height="64" className="object-fit-contain mb-3" alt="" />
            <p className="small text-secondary mb-1">Southwestern Philippine Union Conference</p>
            <h1 className="mb-0" style={{ fontFamily: "'DM Serif Display', serif", fontSize: 'clamp(1.25rem, 3.25vw, 1.625rem)', lineHeight: 1.2 }}>
              Learning &amp; Development Certification Management Service
            </h1>
          </header>
          <CertificateResult key={code} code={code} />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
