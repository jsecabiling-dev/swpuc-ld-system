import React, { useContext, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import BrandHeader from '../components/BrandHeader';
import SiteFooter from '../components/SiteFooter';
import { formatShortDate } from '../utils/dateFormat';
import { printCertificate } from '../utils/printCertificate';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/+$/, '');
const PROFILE_IMAGE_BASE_URL = (import.meta.env.VITE_PROFILE_IMAGE_BASE_URL || `${API_BASE_URL}/api/profile-pictures`).replace(/\/+$/, '');

function getProfileImageUrl(value) {
  const image = value?.trim();
  if (!image) return '';
  if (/^https?:\/\//i.test(image)) return image;
  const filename = image.split(/[\\/]/).pop();
  return filename ? `${PROFILE_IMAGE_BASE_URL}/${encodeURIComponent(filename)}` : '';
}

function formatLabel(value = '') {
  return value.replaceAll('_', ' ');
}

function formatCourseLevel(value) {
  const level = String(value ?? '').trim();
  if (!level || /^level\s*0+$/i.test(level) || /^0+(?:\.0+)?$/.test(level)) return '';
  return /^level\b/i.test(level) ? level : `Level ${level}`;
}

function fullName(person) {
  const middleInitial = person.middle_name?.trim().charAt(0);
  return [person.first_name, middleInitial ? `${middleInitial.toUpperCase()}.` : '', person.last_name, person.suffix]
    .filter(Boolean)
    .join(' ');
}

function ParticipantAvatar({ participant }) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = getProfileImageUrl(participant.profilepict);
  const style = { width: '2.5rem', height: '2.5rem', flex: '0 0 2.5rem', objectFit: 'cover' };

  if (!imageUrl || imageFailed) {
    return (
      <span className="rounded-circle border bg-secondary-subtle text-secondary d-inline-flex justify-content-center align-items-center" role="img" aria-label={`${fullName(participant)} profile picture unavailable`} style={style}>
        <i className="bi bi-person-fill" aria-hidden="true" />
      </span>
    );
  }

  return <img src={imageUrl} alt={`${fullName(participant)} profile`} className="rounded-circle border" style={style} onError={() => setImageFailed(true)} />;
}

function LearningEventView() {
  const { eventId } = useParams();
  const { user } = useContext(AuthContext);
  const canAddProgress = Boolean(user?.canAddProgress);
  const canEditProgress = Boolean(user?.canEditProgress);
  const canDeleteProgress = Boolean(user?.canDeleteProgress);
  const [event, setEvent] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  const [participantForm, setParticipantForm] = useState({ user_id: '' });
  const [registrationError, setRegistrationError] = useState('');
  const [registering, setRegistering] = useState(false);
  const [statusEditParticipant, setStatusEditParticipant] = useState(null);
  const [progressForm, setProgressForm] = useState({ attended: false, completed: false, certified: false });
  const [savingStatus, setSavingStatus] = useState(false);
  const [selectedParticipantIds, setSelectedParticipantIds] = useState([]);
  const [showBulkStatusModal, setShowBulkStatusModal] = useState(false);
  const [bulkStatusAction, setBulkStatusAction] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  useEffect(() => {
    if (!success) return undefined;
    const timeoutId = window.setTimeout(() => setSuccess(''), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [success]);
  useEffect(() => {
    if (!error) return undefined;
    const timeoutId = window.setTimeout(() => setError(''), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [error]);
  useEffect(() => {
    if (!registrationError) return undefined;
    const timeoutId = window.setTimeout(() => setRegistrationError(''), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [registrationError]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    const loadEvent = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`${API_BASE_URL}/api/learning-events/${eventId}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('ld_cert_token') || ''}` },
          signal: controller.signal,
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) {
          throw new Error(result.message || 'Could not load the learning event.');
        }
        setEvent(result.data.event);
        setParticipants(result.data.participants || []);
        setSelectedParticipantIds([]);
      } catch (loadError) {
        if (loadError.name !== 'AbortError') setError(loadError.message || 'Could not load the learning event.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    loadEvent();
    return () => controller.abort();
  }, [eventId, user]);

  useEffect(() => {
    if (!canAddProgress) return undefined;

    const controller = new AbortController();
    const loadPeople = async () => {
      setLoadingPeople(true);
      try {
        const response = await fetch(`${API_BASE_URL}/api/users`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('ld_cert_token') || ''}` },
          signal: controller.signal,
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) {
          throw new Error(result.message || 'Could not load user options.');
        }
        setPeople(result.data || []);
      } catch (loadError) {
        if (loadError.name !== 'AbortError') setError(loadError.message || 'Could not load user options.');
      } finally {
        if (!controller.signal.aborted) setLoadingPeople(false);
      }
    };

    loadPeople();
    return () => controller.abort();
  }, [canAddProgress, user]);

  const openStatusEditor = (participant) => {
    const attended = Boolean(participant.attended);
    const completed = attended && Boolean(participant.completed);
    const certified = completed && Boolean(participant.certified);
    setStatusEditParticipant(participant);
    setProgressForm({ attended, completed, certified });
    setError('');
    setSuccess('');
  };

  const closeStatusEditor = () => {
    if (savingStatus) return;
    setStatusEditParticipant(null);
    setProgressForm({ attended: false, completed: false, certified: false });
  };

  const saveParticipantStatus = async (submitEvent) => {
    submitEvent.preventDefault();
    setError('');
    setSuccess('');
    setSavingStatus(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/learning-participations/${statusEditParticipant.participation_id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('ld_cert_token') || ''}`,
        },
        body: JSON.stringify(progressForm),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Could not update participant status.');
      }
      setParticipants((current) => current.map((item) => (
        item.participation_id === statusEditParticipant.participation_id
          ? {
            ...item,
            ...progressForm,
            certificate_number: result.certificate_number,
            certificate_verification_code: result.certificate_verification_code,
            certification_date: progressForm.certified ? (item.certification_date || new Date().toISOString().slice(0, 10)) : null,
          }
          : item
      )));
      setStatusEditParticipant(null);
      setSuccess(`Status updated for ${fullName(statusEditParticipant)}.`);
    } catch (updateError) {
      setError(updateError.message || 'Could not update participant status.');
    } finally {
      setSavingStatus(false);
    }
  };

  const openBulkStatusEditor = () => {
    setBulkStatusAction('');
    setError('');
    setSuccess('');
    setShowBulkStatusModal(true);
  };

  const closeBulkStatusEditor = () => {
    if (savingStatus) return;
    setShowBulkStatusModal(false);
    setBulkStatusAction('');
    setSelectedParticipantIds([]);
  };

  const saveBulkParticipantStatus = async (submitEvent) => {
    submitEvent.preventDefault();
    const selectedIds = new Set(selectedParticipantIds.map(String));
    const selected = participants.filter((participant) => selectedIds.has(String(participant.participation_id)));
    if (!selected.length) return;
    if (!bulkStatusAction) {
      setError('Choose a status update.');
      return;
    }

    setError('');
    setSuccess('');
    setSavingStatus(true);
    try {
      const token = localStorage.getItem('ld_cert_token') || '';
      const results = [];
      for (const participant of selected) {
        let attended = Boolean(participant.attended);
        let completed = Boolean(participant.completed);
        let certified = Boolean(participant.certified);

        if (bulkStatusAction === 'mark_attended') attended = true;
        if (bulkStatusAction === 'mark_completed') {
          if (!attended) {
            results.push({ ineligible: true, participant });
            continue;
          }
          completed = true;
        }
        if (bulkStatusAction === 'mark_certified') {
          if (!completed) {
            results.push({ ineligible: true, participant });
            continue;
          }
          certified = true;
        }
        if (bulkStatusAction === 'unmark_attended') {
          attended = false;
          completed = false;
          certified = false;
        }
        if (bulkStatusAction === 'unmark_completed') {
          completed = false;
          certified = false;
        }
        if (bulkStatusAction === 'unmark_certified') certified = false;

        if ((completed && !attended) || (certified && !completed)) {
          results.push({ ineligible: true, participant });
          continue;
        }

        const status = { attended, completed, certified };
        try {
          const response = await fetch(`${API_BASE_URL}/api/learning-participations/${participant.participation_id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(status),
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok || !result.success) throw new Error(result.message || `Status update failed (HTTP ${response.status}).`);
          results.push({ success: true, participant, status, result });
        } catch (updateError) {
          results.push({ success: false, participant, message: updateError.message || 'Status update failed.' });
        }
      }

      const successful = results.filter((result) => result.success);
      const ineligible = results.filter((result) => result.ineligible);
      const failed = results.filter((result) => !result.success && !result.ineligible);
      if (successful.length) {
        setParticipants((current) => current.map((participant) => {
          const update = successful.find((result) => result.participant.participation_id === participant.participation_id);
          return update ? {
            ...participant,
            ...update.status,
            certificate_number: update.result.certificate_number,
            certificate_verification_code: update.result.certificate_verification_code,
            certification_date: update.status.certified ? (participant.certification_date || new Date().toISOString().slice(0, 10)) : null,
          } : participant;
        }));
      }
      setSelectedParticipantIds([]);
      setShowBulkStatusModal(false);
      setBulkStatusAction('');
      setSuccess(`${successful.length} updated successfully; ${ineligible.length} not updated due to ineligibility; ${failed.length} failed due to an error.`);
      if (failed.length) {
        setError(failed.map((result) => `${fullName(result.participant)}: ${result.message}`).join(' | '));
      }
    } catch (updateError) {
      setError(updateError.message || 'Could not update participant statuses.');
    } finally {
      setSavingStatus(false);
    }
  };

  const renderStatusMark = (participant, field, label) => {
    const marked = Boolean(participant[field]);
    const mark = <i className={`bi ${marked ? 'bi-check-lg text-success' : 'bi-x-lg text-danger'}`} aria-hidden="true" />;
    return <span role="img" aria-label={`${label}: ${marked ? 'Yes' : 'No'}`}>{mark}</span>;
  };

  const openRegistrationModal = () => {
    setParticipantForm({ user_id: '' });
    setRegistrationError('');
    setShowRegistrationModal(true);
  };

  const closeRegistrationModal = () => {
    if (registering) return;
    setShowRegistrationModal(false);
    setRegistrationError('');
  };

  const registerParticipant = async (submitEvent) => {
    submitEvent.preventDefault();
    setRegistrationError('');
    setRegistering(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/learning-participations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('ld_cert_token') || ''}`,
        },
        body: JSON.stringify({ ...participantForm, event_id: eventId }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Could not register this participant.');
      }

      const selectedPerson = people.find((person) => String(person.user_id) === String(participantForm.user_id));
      if (selectedPerson) {
        setParticipants((current) => [...current, {
          ...selectedPerson,
          participation_id: result.participation_id,
          event_id: Number(eventId),
          attended: 0,
          completed: 0,
          certified: 0,
          unit_name: selectedPerson.unit_name,
        }]);
      }
      setShowRegistrationModal(false);
      setSuccess(selectedPerson ? `${fullName(selectedPerson)} registered for this event.` : 'Participant registered for this event.');
    } catch (registerError) {
      setRegistrationError(registerError.message || 'Could not register this participant.');
    } finally {
      setRegistering(false);
    }
  };

  const deleteParticipantRecord = async (participant) => {
    if (!canDeleteProgress || !window.confirm(`Delete ${fullName(participant)}'s learning record from this event?`)) return;
    setError('');
    setSuccess('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/learning-participations/${participant.participation_id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('ld_cert_token') || ''}` },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || 'Could not delete the learning record.');
      setParticipants((current) => current.filter((item) => item.participation_id !== participant.participation_id));
      setSelectedParticipantIds((current) => current.filter((id) => id !== participant.participation_id));
      setSuccess(`Learning record for ${fullName(participant)} deleted.`);
    } catch (deleteError) {
      setError(deleteError.message || 'Could not delete the learning record.');
    }
  };

  const printParticipantCertificate = (participant) => printCertificate({
    ...participant,
    event_name: event?.title,
    course_title: event?.course_title,
    course_level: event?.course_level,
    learning_level: event?.learning_level,
    start_date: event?.start_date,
    end_date: event?.end_date,
    offering_institution: event?.institution_name,
  }, fullName(participant), () => setError('Allow pop-ups to print this certificate.'));

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <BrandHeader />
      <main className="container py-4 flex-grow-1">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
          <div>
            <p className="text-success text-uppercase fw-bold small mb-1">Learning Management</p>
            <div className="d-flex flex-wrap align-items-center gap-2">
              <h1 className="h2 mb-0" style={{ fontFamily: "'DM Serif Display', serif", color: '#1a202c' }}>
                {event?.title || 'Learning Event Details'}{formatCourseLevel(event?.course_level || event?.learning_level) && ` ${formatCourseLevel(event?.course_level || event?.learning_level)}`}
              </h1>
              {event && <span className={`badge ${event.status === 'Approved' ? 'text-bg-secondary' : event.status === 'Rejected' ? 'text-bg-danger' : event.status === 'For evaluation' ? 'text-bg-warning' : 'text-bg-secondary'}`}>{event.status || 'Submitted'}</span>}
            </div>
            {event && canAddProgress && event.status === 'Approved' && (
              <button className="btn btn-success btn-sm mt-2" type="button" onClick={openRegistrationModal} disabled={loadingPeople || !people.length}>
                <i className="bi bi-person-plus me-1" aria-hidden="true" /> {loadingPeople ? 'Loading users...' : 'Register New Learner'}
              </button>
            )}
          </div>
          <Link className="btn btn-outline-secondary" to="/learning/events">
            <i className="bi bi-arrow-left me-1" aria-hidden="true" /> Back to Learning Event List
          </Link>
        </div>

        {error && <div className="alert alert-danger" role="alert">{error}</div>}
        {success && <div className="alert alert-success" role="status">{success}</div>}
        {loading ? (
          <div className="text-center text-secondary py-5" role="status">
            <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" /> Loading event details...
          </div>
        ) : event ? (
          <>
            <section className="card border-0 shadow-sm mb-4 bg-body-secondary" aria-label="Event details">
              <div className="card-body p-4">
                <div className="row row-cols-1 row-cols-md-4 g-3">
                  <div className="col d-flex flex-column gap-3">
                    <div>
                      <div className="small text-muted">Offering institution</div>
                      <div>{event.institution_name}</div>
                    </div>
                    <div>
                      <div className="small text-muted">Department</div>
                      <div>{event.department_name || '—'}</div>
                    </div>
                  </div>

                  <div className="col d-flex flex-column gap-3">
                    <div>
                      <div className="small text-muted">Venue</div>
                      <div>{event.venue || '—'}</div>
                    </div>
                    <div>
                      <div className="small text-muted">Delivery mode</div>
                      <div>{formatLabel(event.delivery_mode)}</div>
                    </div>
                  </div>

                  <div className="col d-flex flex-column gap-3">
                    <div>
                      <div className="small text-muted">{event.status === 'Approved' ? 'Approved mentor/s' : 'Proposed mentors'}</div>
                      {event.mentors?.length ? event.mentors.map((person) => <div key={person.user_id}>{fullName(person)}</div>) : <div>—</div>}
                    </div>
                    <div>
                      <div className="small text-muted">{event.status === 'Approved' ? 'Approved certifier/s' : 'Proposed certifiers'}</div>
                      {event.certifiers?.length ? event.certifiers.map((person) => <div key={person.user_id}>{fullName(person)}</div>) : <div>—</div>}
                    </div>
                  </div>

                  <div className="col d-flex flex-column gap-3">
                    <div>
                      <div className="small text-muted">Schedule</div>
                      <div>{formatShortDate(event.start_date)}</div>
                      {event.end_date && event.end_date !== event.start_date && <small className="text-muted d-block">Through {formatShortDate(event.end_date)}</small>}
                    </div>
                    {event.description && (
                      <div>
                        <div className="small text-muted">Description</div>
                        <div className="text-break">{event.description}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className="card border-0 shadow-sm event-participants-card" aria-labelledby="event-participants-title">
              <div className="card-body event-participants-card-body">
                <div className="d-flex align-items-center justify-content-between mb-3">
                  <h2 id="event-participants-title" className="h5 fw-bold mb-0">Registered Participants</h2>
                  <div className="d-flex align-items-center gap-2">
                    {canEditProgress && selectedParticipantIds.length > 0 && (
                      <button className="btn btn-sm btn-outline-success" type="button" onClick={openBulkStatusEditor}>
                        Update selected ({selectedParticipantIds.length})
                      </button>
                    )}
                    <span className="badge text-bg-light border text-secondary fw-normal">Total participants: {participants.length}</span>
                  </div>
                </div>
                {participants.length === 0 ? (
                  <div className="text-center text-secondary py-5">No participants have been registered for this event yet.</div>
                ) : (
                  <div className="table-responsive event-participants-scroll">
                    <table className="table table-hover align-middle mb-0 event-participants-table">
                      <caption className="visually-hidden">People registered for this learning event</caption>
                      <thead className="table-light">
                        <tr>
                          {canEditProgress && (
                            <th scope="col" className="text-center participant-select-column">
                              <input
                                className="form-check-input"
                                type="checkbox"
                                aria-label="Select all participants"
                                checked={participants.length > 0 && selectedParticipantIds.length === participants.length}
                                onChange={(changeEvent) => setSelectedParticipantIds(
                                  changeEvent.target.checked ? participants.map((participant) => participant.participation_id) : []
                                )}
                              />
                            </th>
                          )}
                          <th scope="col" className="text-nowrap text-center participant-id-column">ID No</th>
                          <th scope="col">Name</th>
                          <th scope="col">Affiliation</th>
                          <th scope="col" className="text-center">Attended</th>
                          <th scope="col" className="text-center">Completed</th>
                          <th scope="col" className="text-center">Certified</th>
                          {(canEditProgress || canDeleteProgress) && <th scope="col" className="text-center">Actions</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {[...participants].sort((a, b) => Number(b.participation_id) - Number(a.participation_id)).map((participant) => (
                          <tr key={participant.participation_id}>
                            {canEditProgress && (
                              <td className="text-center participant-select-column">
                                <input
                                  className="form-check-input"
                                  type="checkbox"
                                  aria-label={`Select ${fullName(participant)}`}
                                  checked={selectedParticipantIds.some((id) => String(id) === String(participant.participation_id))}
                                  onChange={(changeEvent) => setSelectedParticipantIds((current) => (
                                    changeEvent.target.checked
                                      ? [...current, participant.participation_id]
                                      : current.filter((id) => id !== participant.participation_id)
                                  ))}
                                />
                              </td>
                            )}
                            <td className="text-nowrap text-center participant-id-column">{participant.participation_id}</td>
                            <td>
                              <div className="d-flex align-items-center gap-2">
                                <ParticipantAvatar participant={participant} />
                                <div>
                                  <div className="fw-semibold">{fullName(participant)}</div>
                                  <small className="text-muted">User ID: {participant.user_id}</small>
                                </div>
                              </div>
                            </td>
                            <td>{participant.unit_name || '—'}</td>
                            <td className="text-center">{renderStatusMark(participant, 'attended', 'Attended')}</td>
                            <td className="text-center">{renderStatusMark(participant, 'completed', 'Completed')}</td>
                            <td className="text-center text-nowrap">
                              {participant.certified ? (
                                <button className="btn btn-sm btn-outline-success" type="button" onClick={() => printParticipantCertificate(participant)} aria-label={`Print certificate for ${fullName(participant)}`} title="Print certificate">
                                  <i className="bi bi-printer" aria-hidden="true" />
                                </button>
                              ) : (
                                <span role="img" aria-label="Not certified">
                                  <i className="bi bi-x-lg text-danger" aria-hidden="true" />
                                </span>
                              )}
                            </td>
                            {(canEditProgress || canDeleteProgress) && (
                              <td className="text-center">
                                {canEditProgress && <button
                                  className="btn btn-sm user-action-button"
                                  type="button"
                                  onClick={() => openStatusEditor(participant)}
                                  aria-label={`Update status for ${fullName(participant)}`}
                                  title="Update participant status"
                                >
                                  <i className="bi bi-pencil-square fs-6" aria-hidden="true" />
                                </button>}
                                {canDeleteProgress && <button className="btn btn-sm user-action-button ms-1" type="button" onClick={() => deleteParticipantRecord(participant)} aria-label={`Delete learning record for ${fullName(participant)}`} title="Delete learning record"><i className="bi bi-trash fs-6" aria-hidden="true" /></button>}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          </>
        ) : null}

        {showRegistrationModal && (
          <>
            <div
              className="modal fade show d-block"
              role="dialog"
              aria-modal="true"
              aria-labelledby="register-participant-title"
              tabIndex="-1"
              onMouseDown={(event) => { if (event.target === event.currentTarget) closeRegistrationModal(); }}
            >
              <div className="modal-dialog modal-dialog-centered">
                <div className="modal-content border-0 shadow">
                  <div className="modal-header bg-light">
                    <h2 id="register-participant-title" className="modal-title h5 fw-bold">Register New Participant</h2>
                    <button className="btn-close" type="button" onClick={closeRegistrationModal} aria-label="Close" disabled={registering} />
                  </div>
                  <form onSubmit={registerParticipant}>
                    <div className="modal-body">
                      <p className="text-secondary">Choose a user to register for <strong>{event?.title}</strong>.</p>
                      {registrationError && <div className="alert alert-danger" role="alert">{registrationError}</div>}
                      <div className="mb-3">
                        <label htmlFor="register-participant-user" className="form-label">User <span className="text-danger">*</span></label>
                        <select
                          id="register-participant-user"
                          className="form-select"
                          value={participantForm.user_id}
                          onChange={(submitEvent) => setParticipantForm((current) => ({ ...current, user_id: submitEvent.target.value }))}
                          required
                          disabled={registering || !people.length}
                        >
                          <option value="">{people.length ? 'Choose a user *' : 'No users available'}</option>
                          {people.map((person) => (
                            <option key={person.user_id} value={person.user_id}>
                              {[person.first_name, person.middle_name?.trim().charAt(0) ? `${person.middle_name.trim().charAt(0)}.` : '', person.last_name, person.suffix].filter(Boolean).join(' ')} (ID: {person.user_id}){person.is_active ? '' : ' — Inactive'}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="modal-footer">
                      <button className="btn btn-outline-secondary" type="button" onClick={closeRegistrationModal} disabled={registering}>Cancel</button>
                      <button className="btn btn-success" type="submit" disabled={registering || !people.length}>
                        {registering ? <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />Registering...</> : 'Register Participant'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
            <div className="modal-backdrop fade show" onClick={closeRegistrationModal} />
          </>
        )}

        {statusEditParticipant && (
          <>
            <div
              className="modal fade show d-block"
              role="dialog"
              aria-modal="true"
              aria-labelledby="participant-status-title"
              tabIndex="-1"
              onMouseDown={(event) => { if (event.target === event.currentTarget) closeStatusEditor(); }}
            >
              <div className="modal-dialog modal-dialog-centered">
                <div className="modal-content border-0 shadow">
                  <div className="modal-header bg-light">
                    <h2 id="participant-status-title" className="modal-title h5 fw-bold">Update Participant Status</h2>
                    <button className="btn-close" type="button" onClick={closeStatusEditor} aria-label="Close" disabled={savingStatus} />
                  </div>
                  <form onSubmit={saveParticipantStatus}>
                    <div className="modal-body">
                      <p className="mb-3"><strong>{fullName(statusEditParticipant)}</strong></p>
                      {error && <div className="alert alert-danger" role="alert">{error}</div>}
                      <div className="alert alert-info" role="note">
                        Mark each step in order. Clearing an earlier step also clears the later steps.
                      </div>
                      <div className="form-check mb-3">
                        <input
                          id="status-attended"
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
                        <label className="form-check-label" htmlFor="status-attended">Attended</label>
                      </div>
                      <div className="form-check mb-3">
                        <input
                          id="status-completed"
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
                        <label className="form-check-label" htmlFor="status-completed">Completed</label>
                        {!progressForm.attended && <div className="form-text">Mark attendance first.</div>}
                      </div>
                      <div className="form-check">
                        <input
                          id="status-certified"
                          className="form-check-input"
                          type="checkbox"
                          checked={progressForm.certified}
                          onChange={(event) => setProgressForm((current) => ({ ...current, certified: event.target.checked }))}
                          disabled={savingStatus || !progressForm.completed}
                        />
                        <label className="form-check-label" htmlFor="status-certified">Certified</label>
                        {!progressForm.completed && <div className="form-text">Mark completion first.</div>}
                      </div>
                    </div>
                    <div className="modal-footer">
                      <button className="btn btn-outline-secondary" type="button" onClick={closeStatusEditor} disabled={savingStatus}>Cancel</button>
                      <button className="btn btn-success" type="submit" disabled={savingStatus}>
                        {savingStatus ? <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />Saving...</> : 'Save Status'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
            <div className="modal-backdrop fade show" onClick={closeStatusEditor} />
          </>
        )}

        {showBulkStatusModal && (
          <>
            <div
              className="modal fade show d-block"
              role="dialog"
              aria-modal="true"
              aria-labelledby="bulk-participant-status-title"
              tabIndex="-1"
              onMouseDown={(event) => { if (event.target === event.currentTarget) closeBulkStatusEditor(); }}
            >
              <div className="modal-dialog modal-dialog-centered">
                <div className="modal-content border-0 shadow">
                  <div className="modal-header bg-light">
                    <h2 id="bulk-participant-status-title" className="modal-title h5 fw-bold">Update Selected Participants</h2>
                    <button className="btn-close" type="button" onClick={closeBulkStatusEditor} aria-label="Close" disabled={savingStatus} />
                  </div>
                  <form onSubmit={saveBulkParticipantStatus}>
                    <div className="modal-body">
                      <p className="mb-3">Applying one action to <strong>{selectedParticipantIds.length}</strong> selected participant(s).</p>
                      {error && <div className="alert alert-danger" role="alert">{error}</div>}
                      <label className="form-label" htmlFor="bulk-status-action">Status update *</label>
                      <select id="bulk-status-action" className="form-select" value={bulkStatusAction} onChange={(event) => setBulkStatusAction(event.target.value)} disabled={savingStatus} required>
                        <option value="" disabled>Select an action *</option>
                        <option value="mark_attended">Mark attended</option>
                        <option value="mark_completed">Mark completed</option>
                        <option value="mark_certified">Mark certified</option>
                        <option value="unmark_attended">Unmark attended</option>
                        <option value="unmark_completed">Unmark completed</option>
                        <option value="unmark_certified">Unmark certified</option>
                      </select>
                      <div className="form-text mt-2">Participants must meet the prior status requirements to advance. Ineligible records are skipped. Unmarking an earlier status also clears later statuses. Marking certified issues a certificate.</div>
                    </div>
                    <div className="modal-footer">
                      <button className="btn btn-outline-secondary" type="button" onClick={closeBulkStatusEditor} disabled={savingStatus}>Cancel</button>
                      <button className="btn btn-success" type="submit" disabled={savingStatus || selectedParticipantIds.length === 0 || !bulkStatusAction}>
                        {savingStatus ? <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />Saving...</> : 'Apply Updates'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
            <div className="modal-backdrop fade show" onClick={closeBulkStatusEditor} />
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

export default LearningEventView;
