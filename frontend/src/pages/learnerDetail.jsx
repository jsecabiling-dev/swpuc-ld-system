import React, { useContext, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import BrandHeader from '../components/BrandHeader';
import SiteFooter from '../components/SiteFooter';
import { formatShortDate } from '../utils/dateFormat';
import { printCertificate as printCertificateDocument } from '../utils/printCertificate';
import './learnerDetail.css';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/+$/, '');
const PROFILE_IMAGE_BASE_URL = (
  import.meta.env.VITE_PROFILE_IMAGE_BASE_URL || `${API_BASE_URL}/api/profile-pictures`
).replace(/\/+$/, '');

function getProfileImageUrl(value) {
  const image = value?.trim();
  if (!image) return '';
  if (/^https?:\/\//i.test(image)) return image;
  const filename = image.split(/[\\/]/).pop();
  return filename ? `${PROFILE_IMAGE_BASE_URL}/${encodeURIComponent(filename)}` : '';
}

function fullName(person) {
  const middleInitial = person.middle_name?.trim().charAt(0);
  return [person.first_name, middleInitial ? `${middleInitial.toUpperCase()}.` : '', person.last_name, person.suffix]
    .filter(Boolean)
    .join(' ');
}

function LearnerProfilePicture({ learner }) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = getProfileImageUrl(learner.profilepict);
  const style = { width: '5rem', height: '5rem', flex: '0 0 5rem', objectFit: 'cover' };

  if (!imageUrl || imageFailed) {
    return (
      <span className="learner-detail-avatar rounded-circle border bg-secondary-subtle text-secondary d-inline-flex justify-content-center align-items-center" role="img" aria-label={`${fullName(learner)} profile picture unavailable`} style={style}>
        <i className="bi bi-person-fill fs-3" aria-hidden="true" />
      </span>
    );
  }

  return <img src={imageUrl} alt={`${fullName(learner)} profile`} className="learner-detail-avatar rounded-circle border" style={style} onError={() => setImageFailed(true)} />;
}

function renderStatusMark(participant, field, label) {
  const marked = Boolean(participant[field]);
  return (
    <span role="img" aria-label={`${label}: ${marked ? 'Yes' : 'No'}`}>
      <i className={`bi ${marked ? 'bi-check-lg text-success' : 'bi-x-lg text-danger'}`} aria-hidden="true" />
    </span>
  );
}

function formatLabel(value = '') {
  return value.replaceAll('_', ' ');
}

function formatCertificateLevel(value) {
  const level = String(value || '').trim();
  if (!level) return '';
  const numericLevel = level.match(/^(?:level\s*)?(\d+)$/i);
  if (numericLevel) {
    const number = Number(numericLevel[1]);
    return number > 0 ? `Level ${number}` : '';
  }
  return level;
}

function LearnerDetail() {
  const { userId } = useParams();
  const { user } = useContext(AuthContext);
  const canEditProgress = Boolean(user?.canEditProgress);
  const [learner, setLearner] = useState(null);
  const [journey, setJourney] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [certificateRecord, setCertificateRecord] = useState(null);
  const [certificateForm, setCertificateForm] = useState({ certification_date: new Date().toISOString().slice(0, 10) });
  const [savingCertificate, setSavingCertificate] = useState(false);
  const [statusEditRecord, setStatusEditRecord] = useState(null);
  const [progressForm, setProgressForm] = useState({ attended: false, completed: false, certified: false });
  const [savingStatus, setSavingStatus] = useState(false);
  const [statusError, setStatusError] = useState('');

  const openCertificateForm = (record) => {
    setCertificateRecord(record);
    setCertificateForm({
      certification_date: record.certification_date ? String(record.certification_date).slice(0, 10) : new Date().toISOString().slice(0, 10),
    });
    setError('');
  };

  const issueCertificate = async (submitEvent) => {
    submitEvent.preventDefault();
    setSavingCertificate(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/learning-participations/${certificateRecord.participation_id}/certificate`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('ld_cert_token') || ''}` },
        body: JSON.stringify(certificateForm),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || 'Could not issue the certificate.');
      setJourney((current) => current.map((record) => record.participation_id === certificateRecord.participation_id
        ? { ...record, certified: 1, ...certificateForm, certificate_number: result.certificate_number, certificate_verification_code: result.certificate_verification_code } : record));
      setCertificateRecord(null);
    } catch (issueError) {
      setError(issueError.message || 'Could not issue the certificate.');
    } finally {
      setSavingCertificate(false);
    }
  };

  const openStatusEditor = (record) => {
    const attended = Boolean(record.attended);
    const completed = attended && Boolean(record.completed);
    setStatusEditRecord(record);
    setProgressForm({ attended, completed, certified: completed && Boolean(record.certified) });
    setStatusError('');
  };

  const closeStatusEditor = () => {
    if (savingStatus) return;
    setStatusEditRecord(null);
    setProgressForm({ attended: false, completed: false, certified: false });
    setStatusError('');
  };

  const saveJourneyStatus = async (submitEvent) => {
    submitEvent.preventDefault();
    setSavingStatus(true);
    setStatusError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/learning-participations/${statusEditRecord.participation_id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('ld_cert_token') || ''}` },
        body: JSON.stringify(progressForm),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || 'Could not update learning journey status.');
      const issueDate = new Date().toISOString().slice(0, 10);
      setJourney((current) => current.map((record) => record.participation_id === statusEditRecord.participation_id
        ? {
          ...record,
          ...progressForm,
          certificate_number: result.certificate_number,
          certificate_verification_code: result.certificate_verification_code,
          certification_date: progressForm.certified ? (record.certification_date || issueDate) : null,
        }
        : record));
      setStatusEditRecord(null);
    } catch (updateError) {
      setStatusError(updateError.message || 'Could not update learning journey status.');
    } finally {
      setSavingStatus(false);
    }
  };

  const printCertificate = (record) => printCertificateDocument(record, fullName(learner), () => setError('Allow pop-ups to print this certificate.'));

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    const loadJourney = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`${API_BASE_URL}/api/learning-participations`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('ld_cert_token') || ''}` },
          signal: controller.signal,
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) {
          throw new Error(result.message || 'Could not load this learner’s learning journey.');
        }

        const records = (result.data || []).filter((record) => String(record.user_id) === String(userId));
        if (!records.length) {
          setLearner(null);
          setJourney([]);
          throw new Error('Learner not found or no learning records are available.');
        }

        setLearner(records[0]);
        setJourney(records.sort((first, second) => (
          new Date(first.start_date || first.created_at) - new Date(second.start_date || second.created_at)
        )));
      } catch (loadError) {
        if (loadError.name !== 'AbortError') setError(loadError.message || 'Could not load this learner’s learning journey.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    loadJourney();
    return () => controller.abort();
  }, [user, userId]);

  return (
    <div className="learner-detail-page min-vh-100 bg-light d-flex flex-column">
      <BrandHeader />
      <main className="container py-4 flex-grow-1">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
          <div>
            <p className="text-success text-uppercase fw-bold small mb-1">Community</p>
            <h1 className="h2 mb-0" style={{ fontFamily: "'DM Serif Display', serif", color: '#1a202c' }}>
              {learner ? fullName(learner) : 'Learner Details'}
            </h1>
          </div>
          <Link className="btn btn-outline-secondary" to="/community/learners">
            <i className="bi bi-arrow-left me-1" aria-hidden="true" /> Back to Learner List
          </Link>
        </div>

        {error && <div className="alert alert-danger" role="alert">{error}</div>}
        {loading ? (
          <div className="text-center text-secondary py-5" role="status">
            <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" /> Loading learner journey...
          </div>
        ) : learner ? (
          <>
            <section className="card border-0 shadow-sm mb-4" aria-labelledby="learner-profile-title">
              <div className="card-body d-flex flex-wrap align-items-center gap-3">
                <LearnerProfilePicture learner={learner} />
                <div>
                  <h2 id="learner-profile-title" className="h5 fw-bold mb-1">Learner Profile</h2>
                  <div>{learner.unit_name || 'No affiliation listed'}</div>
                  {learner.email && <small className="text-muted">{learner.email}</small>}
                </div>
              </div>
            </section>

            <section className="card border-0 shadow-sm" aria-labelledby="learner-journey-title">
              <div className="card-body">
                <div className="d-flex align-items-center justify-content-between mb-3">
                  <h2 id="learner-journey-title" className="h5 fw-bold mb-0">Learning Journey</h2>
                  <span className="badge text-bg-light border text-secondary fw-normal">Learning records: {journey.length}</span>
                </div>
                <div className="table-responsive user-list-scroll">
                  <table className="table table-hover align-middle mb-0">
                    <caption className="visually-hidden">Learning events and progress for {fullName(learner)}</caption>
                    <thead className="table-light">
                      <tr>
                        <th scope="col" className="text-center">ID No</th>
                        <th scope="col">Event</th>
                        <th scope="col">Offering Institution</th>
                        <th scope="col">Schedule</th>
                        <th scope="col">Delivery Mode</th>
                        <th scope="col" className="text-center">Attended</th>
                        <th scope="col" className="text-center">Completed</th>
                        <th scope="col" className="text-center">Certificate</th>
                        {canEditProgress && <th scope="col" className="text-center">Update Status</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {[...journey].sort((a, b) => Number(b.participation_id) - Number(a.participation_id)).map((record) => (
                        <tr key={record.participation_id}>
                          <td>{record.event_id || '—'}</td>
                          <td>
                            <div className="fw-semibold">{record.event_name || record.course_title || 'Learning event'}</div>
                            {formatCertificateLevel(record.learning_level) && <small className="text-muted d-block">{formatCertificateLevel(record.learning_level)}</small>}
                          </td>
                          <td>{record.offering_institution || '—'}</td>
                          <td className="small">
                            {record.start_date ? formatShortDate(record.start_date) : '—'}
                            {record.end_date && record.end_date !== record.start_date && <span className="text-muted d-block"> {formatShortDate(record.end_date)}</span>}
                          </td>
                          <td>{record.delivery_mode ? formatLabel(record.delivery_mode) : '—'}</td>
                          <td className="text-center">{renderStatusMark(record, 'attended', 'Attended')}</td>
                          <td className="text-center">{renderStatusMark(record, 'completed', 'Completed')}</td>
                          <td className="text-center text-nowrap">
                            {record.certified ? (
                              <button className="btn btn-sm btn-outline-success" type="button" onClick={() => printCertificate(record)}>
                                <i className="bi bi-printer me-1" aria-hidden="true" />Print
                              </button>
                            ) : (
                              <span role="img" aria-label="Certificate not issued">
                                <i className="bi bi-x-lg text-danger" aria-hidden="true" />
                              </span>
                            )}
                          </td>
                          {canEditProgress && (
                            <td className="text-center">
                              <button
                                className="btn btn-sm user-action-button"
                                type="button"
                                onClick={() => openStatusEditor(record)}
                                aria-label={`Update status for ${record.event_name || record.course_title || 'learning event'}`}
                                title="Update learning journey status"
                              >
                                <i className="bi bi-pencil-square" aria-hidden="true" />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </>
        ) : null}
        {statusEditRecord && (
          <div className="modal d-block" role="dialog" aria-modal="true" aria-labelledby="journey-status-title" style={{ background: 'rgba(0,0,0,.5)' }}>
            <div className="modal-dialog modal-dialog-centered">
              <form className="modal-content" onSubmit={saveJourneyStatus}>
                <div className="modal-header">
                  <h2 id="journey-status-title" className="modal-title fs-5">Update Learning Journey Status</h2>
                  <button type="button" className="btn-close" aria-label="Close" disabled={savingStatus} onClick={closeStatusEditor} />
                </div>
                <div className="modal-body">
                  <p className="text-muted">{fullName(learner)} — {statusEditRecord.event_name || statusEditRecord.course_title || 'Learning event'}</p>
                  {statusError && <div className="alert alert-danger" role="alert">{statusError}</div>}
                  <div className="alert alert-info" role="note">Update each step in order. Clearing an earlier step also clears later steps.</div>
                  <div className="form-check mb-3">
                    <input
                      id="journey-status-attended"
                      className="form-check-input"
                      type="checkbox"
                      checked={progressForm.attended}
                      onChange={(event) => setProgressForm((current) => ({
                        attended: event.target.checked,
                        completed: event.target.checked ? current.completed : false,
                        certified: event.target.checked ? current.certified : false,
                      }))}
                      disabled={savingStatus}
                    />
                    <label className="form-check-label" htmlFor="journey-status-attended">Attended</label>
                  </div>
                  <div className="form-check mb-3">
                    <input
                      id="journey-status-completed"
                      className="form-check-input"
                      type="checkbox"
                      checked={progressForm.completed}
                      onChange={(event) => setProgressForm((current) => ({
                        ...current,
                        completed: event.target.checked,
                        certified: event.target.checked ? current.certified : false,
                      }))}
                      disabled={savingStatus || !progressForm.attended}
                    />
                    <label className="form-check-label" htmlFor="journey-status-completed">Completed</label>
                    {!progressForm.attended && <div className="form-text">Mark attendance first.</div>}
                  </div>
                  <div className="form-check">
                    <input
                      id="journey-status-certified"
                      className="form-check-input"
                      type="checkbox"
                      checked={progressForm.certified}
                      onChange={(event) => setProgressForm((current) => ({ ...current, certified: event.target.checked }))}
                      disabled={savingStatus || !progressForm.completed}
                    />
                    <label className="form-check-label" htmlFor="journey-status-certified">Certified</label>
                    {!progressForm.completed && <div className="form-text">Mark completion first.</div>}
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-outline-secondary" disabled={savingStatus} onClick={closeStatusEditor}>Cancel</button>
                  <button type="submit" className="btn btn-success" disabled={savingStatus}>
                    {savingStatus ? <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />Saving...</> : 'Save Status'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        {certificateRecord && (
          <div className="modal d-block" role="dialog" aria-modal="true" aria-labelledby="issue-certificate-title" style={{ background: 'rgba(0,0,0,.5)' }}>
            <div className="modal-dialog modal-dialog-centered">
              <form className="modal-content" onSubmit={issueCertificate}>
                <div className="modal-header">
                  <h2 id="issue-certificate-title" className="modal-title fs-5">Issue Certificate</h2>
                  <button type="button" className="btn-close" aria-label="Close" disabled={savingCertificate} onClick={() => setCertificateRecord(null)} />
                </div>
                <div className="modal-body">
                  <p className="text-muted">For {fullName(learner)} — {certificateRecord.event_name || certificateRecord.course_title || 'Learning event'}</p>
                  <p className="mb-3"><span className="fw-semibold">Certificate title:</span> {certificateRecord.event_name || certificateRecord.course_title || 'Learning event'}{formatCertificateLevel(certificateRecord.learning_level) ? ` ${formatCertificateLevel(certificateRecord.learning_level)}` : ''}</p>
                  <label className="form-label" htmlFor="certification-date">Issue date *</label>
                  <input id="certification-date" type="date" className="form-control" required value={certificateForm.certification_date} onChange={(event) => setCertificateForm((current) => ({ ...current, certification_date: event.target.value }))} />
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-outline-secondary" disabled={savingCertificate} onClick={() => setCertificateRecord(null)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={savingCertificate}>
                    {savingCertificate ? <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />Issuing...</> : 'Issue certificate'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

export default LearnerDetail;
