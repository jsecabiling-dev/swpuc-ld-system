import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import SortableTableHeader, { useTableSort } from '../components/SortableTableHeader';
import BrandHeader from '../components/BrandHeader';
import SiteFooter from '../components/SiteFooter';
import { formatShortDate } from '../utils/dateFormat';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/+$/, '');
const DELIVERY_MODES = ['In_Person', 'Online', 'Hybrid'];
const EMPTY_EVENT = {
  course_id: '',
  institution_id: '',
  department_id: '',
  start_date: '',
  end_date: '',
  venue: '',
  delivery_mode: '',
  description: '',
  mentor_ids: [],
  certifier_ids: [],
};

function SearchableSelect({ id, value, options, onChange, placeholder, disabled, required = false }) {
  const selected = options.find((option) => String(option.value) === String(value));
  const [query, setQuery] = useState(selected?.label || '');
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    setQuery(selected?.label || '');
  }, [selected?.label, value]);

  const filteredOptions = options.filter((option) => option.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="flex-grow-1 position-relative">
      <input
        ref={inputRef}
        id={id}
        type="text"
        className="form-control bg-light text-dark"
        style={{ borderColor: '#cbd5e1' }}
        value={query}
        placeholder={required && !disabled ? `${placeholder} *` : placeholder}
        disabled={disabled}
        required={required}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-options`}
        onFocus={() => { setQuery(''); setOpen(true); }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          if (required) inputRef.current?.setCustomValidity('Choose an option from the list.');
        }}
        onBlur={() => {
          setOpen(false);
          setQuery(selected?.label || '');
          inputRef.current?.setCustomValidity(value ? '' : (required ? 'Choose an option from the list.' : ''));
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
          if (event.key === 'ArrowDown' && filteredOptions.length) {
            event.preventDefault();
            document.getElementById(`${id}-option-0`)?.focus();
          }
        }}
      />
      {open && !disabled && (
        <div id={`${id}-options`} role="listbox" className="list-group position-absolute w-100 shadow" style={{ zIndex: 1060, maxHeight: '220px', overflowY: 'auto' }}>
          {filteredOptions.length ? filteredOptions.map((option, index) => (
            <button
              id={`${id}-option-${index}`}
              key={option.value}
              type="button"
              role="option"
              aria-selected={String(option.value) === String(value)}
              className="list-group-item list-group-item-action text-start"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => { onChange(option.value); setQuery(option.label); setOpen(false); inputRef.current?.setCustomValidity(''); }}
            >{option.label}</button>
          )) : <div className="list-group-item text-muted">No matching options</div>}
        </div>
      )}
    </div>
  );
}

function AccountMultiSelect({ id, label, accounts, value, onChange, disabled, loading }) {
  const selected = new Set(value.map(String));
  const personName = (person) => [person.first_name, person.middle_name, person.last_name, person.suffix].filter(Boolean).join(' ');
  return (
    <fieldset className="border rounded p-3" disabled={disabled}>
      <legend className="float-none w-auto px-1 fs-6 fw-semibold mb-1">{label}</legend>
      {loading ? <p className="small text-secondary mb-0">Loading eligible accounts...</p> : accounts.length ? <div id={id} className="d-flex flex-column gap-2" style={{ maxHeight: '180px', overflowY: 'auto' }}>
        {accounts.map((account) => (
          <label key={account.user_id} className="d-flex align-items-start gap-2 mb-0">
            <input className="form-check-input mt-1" type="checkbox" checked={selected.has(String(account.user_id))}
              onChange={(event) => onChange(event.target.checked
                ? [...value, String(account.user_id)]
                : value.filter((idValue) => String(idValue) !== String(account.user_id)))} />
            <span>{personName(account)}{account.email ? <small className="d-block text-secondary">{account.email}</small> : null}</span>
          </label>
        ))}
      </div> : <p className="small text-secondary mb-0">No active {label.toLowerCase()} accounts are available.</p>}
    </fieldset>
  );
}

function formatLabel(value = '') {
  return value.replaceAll('_', ' ');
}

function formatCourseLevel(value) {
  const level = String(value ?? '').trim();
  if (!level || /^level\s*0+$/i.test(level) || /^0+(?:\.0+)?$/.test(level)) return '';
  return /^level\b/i.test(level) ? level : `Level ${level}`;
}

function localTodayApiValue() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

function dateInputValue(value) {
  if (!value) return '';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  return formatShortDate(date).replace(/\u2014/g, '');
}

function dateApiValue(value) {
  if (!value) return '';
  const match = /^(\d{2})-([A-Za-z]{3})-(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const date = new Date(`${match[2]} ${match[1]}, ${match[3]} 00:00:00`);
  if (Number.isNaN(date.getTime()) || date.getDate() !== Number(match[1]) || date.getFullYear() !== Number(match[3])) return null;
  const month = date.getMonth() + 1;
  if (date.toLocaleString('en', { month: 'short' }).toLowerCase() !== match[2].toLowerCase()) return null;
  return `${match[3]}-${String(month).padStart(2, '0')}-${match[1]}`;
}

function LearningEventList() {
  const sort = useTableSort();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const canAddEvents = Boolean(user?.canAddEvents);
  const canEditEvents = Boolean(user?.canEditEvents);
  const canDeleteEvents = Boolean(user?.canDeleteEvents);
  const canLoadEventOptions = canAddEvents || canEditEvents;
  const [events, setEvents] = useState([]);
  const [courses, setCourses] = useState([]);
  const [institutions, setInstitutions] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [mentors, setMentors] = useState([]);
  const [certifiers, setCertifiers] = useState([]);
  const [loadingProposedPeople, setLoadingProposedPeople] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingStatusId, setUpdatingStatusId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(location.state?.success || '');
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
  const [search, setSearch] = useState('');
  const [showEventSuggestions, setShowEventSuggestions] = useState(false);
  const [activeEventSuggestionIndex, setActiveEventSuggestionIndex] = useState(0);
  const [deliveryFilter, setDeliveryFilter] = useState('all');
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [modalMode, setModalMode] = useState('');
  const [formData, setFormData] = useState(EMPTY_EVENT);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    const loadData = async () => {
      setLoading(true);
      setError('');
      const headers = { Authorization: `Bearer ${localStorage.getItem('ld_cert_token') || ''}` };
      try {
        const eventsResponse = await fetch(`${API_BASE_URL}/api/learning-events`, { headers, signal: controller.signal });
        const eventsResult = await eventsResponse.json().catch(() => ({}));
        if (!eventsResponse.ok || !eventsResult.success) {
          throw new Error(eventsResult.message || 'Could not load learning events.');
        }
        setEvents(eventsResult.data || []);

        if (canLoadEventOptions) {
          const optionsResponse = await fetch(`${API_BASE_URL}/api/learning-events/options`, { headers, signal: controller.signal });
          const optionsResult = await optionsResponse.json().catch(() => ({}));
          if (!optionsResponse.ok || !optionsResult.success) {
            throw new Error(optionsResult.message || 'Could not load event form options.');
          }
          setCourses(optionsResult.data.courses || []);
          setInstitutions(optionsResult.data.institutions || []);
          setDepartments(optionsResult.data.departments || []);
        }
      } catch (loadError) {
        if (loadError.name !== 'AbortError') setError(loadError.message || 'Could not load learning events.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    loadData();
    return () => controller.abort();
  }, [user, canLoadEventOptions, reloadKey]);

  useEffect(() => {
    if (!user || !canLoadEventOptions || !['add', 'edit'].includes(modalMode) || !formData.course_id) {
      setMentors([]);
      setCertifiers([]);
      setLoadingProposedPeople(false);
      return undefined;
    }
    const controller = new AbortController();
    const loadEligiblePeople = async () => {
      setLoadingProposedPeople(true);
      setMentors([]);
      setCertifiers([]);
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/learning-events/people?course_id=${encodeURIComponent(formData.course_id)}`,
          { headers: { Authorization: `Bearer ${localStorage.getItem('ld_cert_token') || ''}` }, signal: controller.signal }
        );
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) throw new Error(result.message || 'Could not load course-accredited mentors and certifiers.');
        setMentors(result.data.mentors || []);
        setCertifiers(result.data.certifiers || []);
      } catch (loadError) {
        if (loadError.name !== 'AbortError') setError(loadError.message || 'Could not load eligible accounts.');
      } finally {
        if (!controller.signal.aborted) setLoadingProposedPeople(false);
      }
    };
    loadEligiblePeople();
    return () => controller.abort();
  }, [user, canLoadEventOptions, modalMode, formData.course_id]);

  const filteredEvents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return events.filter((event) => {
      if (deliveryFilter !== 'all' && event.delivery_mode !== deliveryFilter) return false;
      if (!query) return true;
      return [event.course_title, event.course_level, event.title, event.institution_name, event.department_name, event.venue]
        .some((value) => String(value || '').toLowerCase().includes(query));
    }).sort((a, b) => Number(b.event_id) - Number(a.event_id));
  }, [events, search, deliveryFilter]);

  const chooseEventSuggestion = (event) => {
    setSearch(event.course_title || event.title || '');
    setShowEventSuggestions(false);
    setActiveEventSuggestionIndex(0);
  };

  const handleEventSearchKeyDown = (keyboardEvent) => {
    if (keyboardEvent.key === 'ArrowDown') {
      keyboardEvent.preventDefault();
      if (!filteredEvents.length) return;
      if (!showEventSuggestions) {
        setActiveEventSuggestionIndex(0);
        setShowEventSuggestions(true);
        return;
      }
      setActiveEventSuggestionIndex((current) => Math.min(current + 1, filteredEvents.length - 1));
    } else if (keyboardEvent.key === 'ArrowUp') {
      keyboardEvent.preventDefault();
      setActiveEventSuggestionIndex((current) => Math.max(current - 1, 0));
    } else if (keyboardEvent.key === 'Enter' && showEventSuggestions && filteredEvents.length) {
      keyboardEvent.preventDefault();
      chooseEventSuggestion(filteredEvents[activeEventSuggestionIndex] || filteredEvents[0]);
    } else if (keyboardEvent.key === 'Escape') {
      setShowEventSuggestions(false);
    }
  };

  const openAdd = () => {
    setFormData(EMPTY_EVENT);
    setSelectedEvent(null);
    setModalMode('add');
    setError('');
  };

  const openEdit = (event) => {
    setSelectedEvent(event);
    setFormData({
      course_id: event.course_id ? String(event.course_id) : '',
      institution_id: String(event.institution_id || ''),
      department_id: event.department_id ? String(event.department_id) : '',
      start_date: dateInputValue(event.start_date),
      end_date: dateInputValue(event.end_date),
      venue: event.venue || '',
      delivery_mode: event.delivery_mode || 'In_Person',
      description: event.description || '',
      mentor_ids: (event.mentors || []).map((person) => String(person.user_id)),
      certifier_ids: (event.certifiers || []).map((person) => String(person.user_id)),
    });
    setModalMode('edit');
    setError('');
  };

  const closeModal = () => {
    setSelectedEvent(null);
    setModalMode('');
    setFormData(EMPTY_EVENT);
  };

  const handleFormChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
    setError('');
  };

  const handleSelectChange = (name, value) => {
    setFormData((current) => name === 'course_id'
      ? { ...current, course_id: value, mentor_ids: [], certifier_ids: [] }
      : { ...current, [name]: value });
    setError('');
  };

  const handleCalendarChange = (name, value) => {
    if (name === 'end_date' && value && dateApiValue(formData.start_date) && value < dateApiValue(formData.start_date)) {
      setError('End date must be on or after the start date.');
      return;
    }
    setFormData((current) => ({ ...current, [name]: dateInputValue(value) }));
    setError('');
  };

  const saveEvent = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    const startDate = dateApiValue(formData.start_date);
    const endDate = dateApiValue(formData.end_date);
    if (!startDate || (formData.end_date && !endDate)) {
      setError('Enter dates in dd-Mmm-yyyy format, for example 09-Nov-2026.');
      return;
    }
    if (endDate && endDate < startDate) {
      setError('End date must be on or after the start date.');
      return;
    }
    setSaving(true);
    try {
      const isEditing = modalMode === 'edit';
      const response = await fetch(
        isEditing
          ? `${API_BASE_URL}/api/learning-events/${selectedEvent.event_id}`
          : `${API_BASE_URL}/api/learning-events`,
        {
          method: isEditing ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('ld_cert_token') || ''}`,
          },
          body: JSON.stringify({ ...formData, start_date: startDate, end_date: endDate }),
        }
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.message || `Could not ${isEditing ? 'update' : 'create'} the learning event.`);
      }
      closeModal();
      setSuccess(isEditing ? 'Learning event updated.' : 'Learning event proposal submitted.');
      setReloadKey((key) => key + 1);
    } catch (saveError) {
      setError(saveError.message || 'Could not save the learning event.');
    } finally {
      setSaving(false);
    }
  };

  const updateEventStatus = async (event, status) => {
    setError('');
    setSuccess('');
    setUpdatingStatusId(event.event_id);
    try {
      const response = await fetch(`${API_BASE_URL}/api/learning-events/${event.event_id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('ld_cert_token') || ''}`,
        },
        body: JSON.stringify({ status }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || 'Could not update proposal status.');
      setEvents((current) => current.map((item) => item.event_id === event.event_id ? { ...item, status: result.status } : item));
      setSuccess(`Proposal status updated to ${result.status}.`);
    } catch (statusError) {
      setError(statusError.message || 'Could not update proposal status.');
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const deleteEvent = async (event) => {
    if (!window.confirm(`Delete the learning event “${event.title}”?`)) return;
    setError('');
    setSuccess('');
    setDeletingId(event.event_id);
    try {
      const response = await fetch(`${API_BASE_URL}/api/learning-events/${event.event_id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('ld_cert_token') || ''}` },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || 'Could not delete the learning event.');
      setSuccess('Learning event deleted.');
      setReloadKey((key) => key + 1);
    } catch (deleteError) {
      setError(deleteError.message || 'Could not delete the learning event.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <BrandHeader />
      <main className="container py-4 flex-grow-1 learning-list">
        <div className="d-flex flex-md-wrap align-items-end align-items-md-center justify-content-between gap-2 gap-md-3 mb-4">
          <div>
            <p className="text-success text-uppercase fw-bold small mb-1">Learning Management</p>
            <h1 className="h2 mb-0" style={{ fontFamily: "'DM Serif Display', serif", color: '#1a202c' }}>Learning Event List</h1>
          </div>
          {canAddEvents && (
            <button className="btn btn-success flex-shrink-0 learning-list-add" type="button" onClick={openAdd} aria-label="Submit Learning Event Proposal">
              <i className="bi bi-plus-lg me-md-1" aria-hidden="true" />
              <span className="d-none d-md-inline">Submit Learning Event Proposal</span>
            </button>
          )}
        </div>

        {error && !modalMode && <div className="alert alert-danger" role="alert">{error}</div>}
        {success && <div className="alert alert-success" role="status">{success}</div>}

        <section
          className="card border-0 shadow-sm"
          onMouseDown={(mouseEvent) => {
            if (!mouseEvent.target.closest('.event-search-dropdown')) setShowEventSuggestions(false);
          }}
        >
          <div className="card-body p-2 p-md-3">
            <div className="row g-3 align-items-end mb-3">
              <div className="col-md-8">
                <label htmlFor="event-search" className="visually-hidden">Search learning events</label>
                <div className="event-search-dropdown">
                  <input
                    id="event-search"
                    className="form-control"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={showEventSuggestions}
                    aria-controls="event-search-suggestions"
                    aria-activedescendant={showEventSuggestions && filteredEvents[activeEventSuggestionIndex]
                      ? `event-search-option-${filteredEvents[activeEventSuggestionIndex].event_id}`
                      : undefined}
                    value={search}
                    onFocus={() => { if (search.trim()) setShowEventSuggestions(true); }}
                    onChange={(inputEvent) => {
                      setSearch(inputEvent.target.value);
                      setActiveEventSuggestionIndex(0);
                      setShowEventSuggestions(Boolean(inputEvent.target.value.trim()));
                    }}
                    onKeyDown={handleEventSearchKeyDown}
                    placeholder="Search events by title, course, institution, or venue"
                  />
                  {showEventSuggestions && search.trim() && (
                    <div id="event-search-suggestions" className="event-search-options" role="listbox" aria-label="Matching learning events">
                      {filteredEvents.length ? filteredEvents.slice(0, 50).map((event, index) => (
                        <button
                          id={`event-search-option-${event.event_id}`}
                          key={event.event_id}
                          className={`event-search-option${index === activeEventSuggestionIndex ? ' active' : ''}`}
                          type="button"
                          role="option"
                          aria-selected={false}
                          onMouseDown={(mouseEvent) => mouseEvent.preventDefault()}
                          onMouseEnter={() => setActiveEventSuggestionIndex(index)}
                          onClick={() => chooseEventSuggestion(event)}
                        >
                          <span>{event.course_title || event.title}</span>
                          <small className="text-muted d-block">{[event.institution_name, event.venue, formatShortDate(event.start_date)].filter(Boolean).join(' · ')}</small>
                        </button>
                      )) : (
                        <div className="event-search-empty">No matching events found.</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="col-md-4">
                <label htmlFor="event-delivery-filter" className="visually-hidden">Delivery mode</label>
                <select id="event-delivery-filter" className="form-select" value={deliveryFilter} onChange={(event) => setDeliveryFilter(event.target.value)}>
                  <option value="all">All delivery modes</option>
                  {DELIVERY_MODES.map((mode) => <option key={mode} value={mode}>{formatLabel(mode)}</option>)}
                </select>
              </div>
            </div>

            {loading ? (
              <div className="text-center text-secondary py-5" role="status"><span className="spinner-border spinner-border-sm me-2" aria-hidden="true" /> Loading learning events...</div>
            ) : filteredEvents.length === 0 ? (
              <div className="text-center text-secondary py-5">{events.length ? 'No events match your search.' : 'No learning events have been registered yet.'}</div>
            ) : (
              <div className="table-responsive learning-course-list-scroll">
                <table className="table table-hover mb-0 learning-list-table">
                  <caption className="visually-hidden">Learning events with event IDs, schedule, offering institution, and available actions</caption>
                  <thead className="table-light">
                    <tr>
                      <th scope="col" className="text-center learning-event-list-id">ID No</th>
                      <SortableTableHeader sort={sort} column="title" className="text-start learning-event-list-title">Course Title</SortableTableHeader>
                      <SortableTableHeader sort={sort} column="institution" className="d-none d-md-table-cell" style={{ width: '150px', maxWidth: '150px' }}>Offering Institution</SortableTableHeader>
                      <th scope="col" className="text-nowrap d-none d-md-table-cell" style={{ minWidth: '150px' }}>Schedule</th>
                      <SortableTableHeader sort={sort} column="venue" className="d-none d-md-table-cell">Venue</SortableTableHeader>
                      <th scope="col" className="text-center d-none d-md-table-cell">Status</th>
                      <th scope="col" className="text-center learning-list-actions">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sort.order(filteredEvents, { title: (row) => row.course_title || row.title, institution: (row) => row.institution_name, venue: (row) => row.venue }).map((event) => {
                      const courseLevel = formatCourseLevel(event.course_level || event.learning_level);
                      const certifiedCount = event.certified_count ?? 0;
                      return (
                        <tr key={event.event_id}>
                          <td className="align-top text-center">{event.event_id}</td>
                          <td className="align-top text-start learning-event-list-title" style={{ lineHeight: 1.1 }}>
                            <div className="fw-semibold">{event.course_title || event.title}{courseLevel && <span className="d-none d-md-inline">{` ${courseLevel}`}</span>}</div>
                            {courseLevel && <small className="text-muted d-block d-md-none mt-1">{courseLevel}</small>}
                            {event.course_department_name && <small className="text-muted d-none d-md-inline">{event.course_department_name}</small>}
                          </td>
                          <td className="align-top d-none d-md-table-cell" style={{ width: '150px', maxWidth: '150px', overflowWrap: 'anywhere' }}>{event.institution_name}</td>
                          <td className="align-top text-start text-nowrap d-none d-md-table-cell" style={{ minWidth: '150px' }}>
                            <div>{formatShortDate(event.start_date)}</div>
                            {event.end_date && event.end_date !== event.start_date && (
                              <small className="text-muted d-block">{formatShortDate(event.end_date)}</small>
                            )}
                          </td>
                          <td className="align-top d-none d-md-table-cell">{event.venue || '—'}</td>
                          <td className="align-top text-center d-none d-md-table-cell" style={{ lineHeight: 1.1 }}>
                            <span className={`badge ${event.status === 'Approved' ? 'text-bg-success' : event.status === 'Rejected' ? 'text-bg-danger' : event.status === 'For evaluation' ? 'text-bg-warning' : 'text-bg-secondary'}`}>
                              {event.status || 'Submitted'}
                            </span>
                            {canEditEvents && event.status === 'Submitted' && <button className="btn btn-outline-secondary rounded-circle p-0 d-flex align-items-center justify-content-center mx-auto mt-1" style={{ width: '1.5rem', height: '1.5rem', fontSize: '0.75rem' }} type="button" onClick={() => updateEventStatus(event, 'For evaluation')} disabled={updatingStatusId === event.event_id} aria-label="Start evaluation" title="Start evaluation"><i className="bi bi-clipboard-check" aria-hidden="true" /></button>}
                            {canEditEvents && event.status === 'For evaluation' && <div className="d-flex flex-wrap justify-content-center gap-1 mt-1"><button className="btn btn-outline-secondary rounded-circle p-0 d-inline-flex align-items-center justify-content-center" style={{ width: '1.5rem', height: '1.5rem', fontSize: '0.75rem' }} type="button" onClick={() => updateEventStatus(event, 'Approved')} disabled={updatingStatusId === event.event_id} aria-label="Approve proposal" title="Approve proposal"><i className="bi bi-check-lg" aria-hidden="true" /></button><button className="btn btn-outline-secondary rounded-circle p-0 d-inline-flex align-items-center justify-content-center" style={{ width: '1.5rem', height: '1.5rem', fontSize: '0.75rem' }} type="button" onClick={() => updateEventStatus(event, 'Rejected')} disabled={updatingStatusId === event.event_id} aria-label="Reject proposal" title="Reject proposal"><i className="bi bi-x-lg" aria-hidden="true" /></button></div>}
                            {canEditEvents && event.status === 'Rejected' && String(event.start_date).slice(0, 10) > localTodayApiValue() && <button className="btn btn-outline-secondary rounded-circle p-0 d-inline-flex align-items-center justify-content-center mt-1" style={{ width: '1.5rem', height: '1.5rem', fontSize: '0.75rem' }} type="button" onClick={() => updateEventStatus(event, 'For evaluation')} disabled={updatingStatusId === event.event_id} aria-label="Revert rejected proposal" title="Revert rejected proposal"><i className="bi bi-arrow-counterclockwise" aria-hidden="true" /></button>}
                          </td>
                          <td className="align-top text-center text-nowrap">
                            <button className="btn btn-sm user-action-button position-relative me-md-1" type="button" onClick={() => navigate(`/learning/events/${event.event_id}`)} disabled={event.status === 'Rejected'} aria-label={`View ${event.title}, certified participants: ${certifiedCount}`} title={`Certified participants: ${certifiedCount}`}>
                              <i className="bi bi-card-text fs-6" aria-hidden="true" />
                              <span className="position-absolute top-0 badge rounded-pill text-bg-success view-count-badge" aria-hidden="true">{certifiedCount}</span>
                            </button>
                            {canEditEvents && <button className="btn btn-sm user-action-button me-1 d-none d-md-inline-flex" type="button" onClick={() => openEdit(event)} disabled={event.status === 'Rejected'} aria-label={`Edit ${event.title}`} title="Edit event"><i className="bi bi-pencil-square fs-6" aria-hidden="true" /></button>}
                            {canDeleteEvents && (
                              <>
                                <button className="btn btn-sm user-action-button d-none d-md-inline-flex" type="button" onClick={() => deleteEvent(event)} disabled={deletingId === event.event_id || event.status === 'Rejected'} aria-label={`Delete ${event.title}`} title="Delete event">
                                  {deletingId === event.event_id ? <span className="spinner-border spinner-border-sm" aria-hidden="true" /> : <i className="bi bi-trash fs-6" aria-hidden="true" />}
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {modalMode && (
          <>
            <div className="modal fade show d-block" role="dialog" aria-modal="true" aria-labelledby="event-modal-title" tabIndex="-1" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) closeModal(); }}>
              <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-lg">
                <div className="modal-content border-0 shadow">
                  <div className="modal-header bg-light">
                    <h2 id="event-modal-title" className="modal-title h5 fw-bold">{modalMode === 'view' ? 'Learning event details' : modalMode === 'edit' ? 'Edit learning event' : 'Learning Event Proposal'}</h2>
                    <button className="btn-close" type="button" onClick={closeModal} aria-label="Close" disabled={saving} />
                  </div>
                  {modalMode === 'view' ? (
                    <>
                      <div className="modal-body">
                        <h3 className="h5">{selectedEvent.title}</h3>
                        <dl className="row mb-0">
                          <dt className="col-sm-4">Related course</dt><dd className="col-sm-8">{selectedEvent.course_title || 'Standalone event'}</dd>
                          <dt className="col-sm-4">Learning level</dt><dd className="col-sm-8">{selectedEvent.learning_level || '—'}</dd>
                          <dt className="col-sm-4">Proposal status</dt><dd className="col-sm-8">{selectedEvent.status || 'Submitted'}</dd>
                          <dt className="col-sm-4">Offering institution</dt><dd className="col-sm-8">{selectedEvent.institution_name}</dd>
                          <dt className="col-sm-4">Department</dt><dd className="col-sm-8">{selectedEvent.department_name || '—'}</dd>
                          <dt className="col-sm-4">Start date</dt><dd className="col-sm-8">{formatShortDate(selectedEvent.start_date)}</dd>
                          <dt className="col-sm-4">End date</dt><dd className="col-sm-8">{formatShortDate(selectedEvent.end_date)}</dd>
                          <dt className="col-sm-4">Delivery mode</dt><dd className="col-sm-8">{formatLabel(selectedEvent.delivery_mode)}</dd>
                          <dt className="col-sm-4">Venue</dt><dd className="col-sm-8">{selectedEvent.venue || '—'}</dd>
                          <dt className="col-sm-4">Description</dt><dd className="col-sm-8 text-break">{selectedEvent.description || '—'}</dd>
                        </dl>
                      </div>
                      <div className="modal-footer"><button className="btn btn-outline-secondary" type="button" onClick={closeModal}>Close</button></div>
                    </>
                  ) : (
                    <form onSubmit={saveEvent}>
                      <div className="modal-body">
                        {error && <div className="alert alert-danger" role="alert">{error}</div>}
                        <div className="row g-3">
                          <div className="col-12">
                            <label htmlFor="event-course" className="form-label">Catalog course <span className="text-danger" aria-hidden="true">*</span></label>
                            <div className="input-group">
                              <SearchableSelect id="event-course" value={formData.course_id} onChange={(value) => handleSelectChange('course_id', value)} placeholder={courses.length ? 'Find catalog title' : 'No courses in catalog'} disabled={saving || !courses.length} required options={courses.map((course) => ({ value: String(course.course_id), label: `${course.title}${course.learning_level ? ` · ${course.learning_level}` : ''}` }))} />
                            </div>
                          </div>
                          <div className="col-md-6">
                            <label htmlFor="event-institution" className="form-label">Institution <span className="text-danger" aria-hidden="true">*</span></label>
                            <div className="input-group">
                              <SearchableSelect id="event-institution" value={formData.institution_id} onChange={(value) => handleSelectChange('institution_id', value)} placeholder="Find institution" disabled={saving} required options={institutions.map((institution) => ({ value: String(institution.unit_id), label: `${institution.name} (${formatLabel(institution.unit_type)})` }))} />
                            </div>
                          </div>
                          <div className="col-md-6">
                            <div className="input-group">
                              <SearchableSelect
                                id="event-department"
                                value={formData.department_id}
                                onChange={(value) => handleSelectChange('department_id', value)}
                                placeholder="Find department"
                                disabled={saving}
                                options={departments.map((department) => ({ value: String(department.department_id), label: department.name }))}
                              />
                            </div>
                          </div>
                          <div className="col-md-4">
                            <div className="input-group">
                              <label htmlFor="event-start-date" className="input-group-text bg-light text-secondary" style={{ width: '90px' }}>Start date <span className="text-danger ms-1">*</span></label>
                              <input id="event-start-date" name="start_date" type="text" className="form-control bg-light text-dark" style={{ borderColor: '#cbd5e1' }} value={formData.start_date} onChange={handleFormChange} placeholder="dd-Mmm-yyyy *" pattern="[0-9]{2}-[A-Za-z]{3}-[0-9]{4}" maxLength={11} required disabled={saving} />
                              <span className="input-group-text p-0 position-relative" aria-label="Choose start date">
                                <i className="bi bi-calendar3 text-secondary px-2" aria-hidden="true" />
                                <input type="date" aria-label="Choose start date" value={dateApiValue(formData.start_date) || ''} onChange={(event) => handleCalendarChange('start_date', event.target.value)} disabled={saving} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }} />
                              </span>
                            </div>
                          </div>
                          <div className="col-md-4">
                            <div className="input-group">
                              <label htmlFor="event-end-date" className="input-group-text bg-light text-secondary" style={{ width: '90px' }}>End date</label>
                              <input id="event-end-date" name="end_date" type="text" className="form-control bg-light text-dark" style={{ borderColor: '#cbd5e1' }} value={formData.end_date} onChange={handleFormChange} placeholder="dd-Mmm-yyyy" pattern="[0-9]{2}-[A-Za-z]{3}-[0-9]{4}" maxLength={11} disabled={saving} />
                              <span className="input-group-text p-0 position-relative" aria-label="Choose end date">
                                <i className="bi bi-calendar3 text-secondary px-2" aria-hidden="true" />
                                <input type="date" aria-label="Choose end date" value={dateApiValue(formData.end_date) || ''} min={dateApiValue(formData.start_date) || undefined} onChange={(event) => handleCalendarChange('end_date', event.target.value)} disabled={saving} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }} />
                              </span>
                            </div>
                          </div>
                          <div className="col-md-4">
                            <label htmlFor="event-delivery-mode" className="form-label">Delivery mode <span className="text-danger" aria-hidden="true">*</span></label>
                            <div className="input-group">
                              <SearchableSelect
                                id="event-delivery-mode"
                                value={formData.delivery_mode}
                                onChange={(value) => handleSelectChange('delivery_mode', value)}
                                placeholder="Find delivery mode"
                                disabled={saving}
                                required
                                options={DELIVERY_MODES.map((mode) => ({
                                  value: mode,
                                  label: formatLabel(mode),
                                }))}
                              />
                            </div>
                          </div>
                          <div className="col-12">
                            <div className="input-group">
                              <label htmlFor="event-venue" className="input-group-text bg-light text-secondary" style={{ width: '180px' }}>Venue or meeting link</label>
                              <input id="event-venue" name="venue" className="form-control bg-light text-dark" style={{ borderColor: '#cbd5e1' }} value={formData.venue} onChange={handleFormChange} maxLength={255} disabled={saving} />
                            </div>
                          </div>
                          <div className="col-12">
                            <div className="input-group">
                              <label htmlFor="event-description" className="input-group-text bg-light text-secondary" style={{ width: '180px' }}>Description</label>
                              <textarea id="event-description" name="description" className="form-control bg-light text-dark" style={{ borderColor: '#cbd5e1' }} rows="3" value={formData.description} onChange={handleFormChange} maxLength={20000} disabled={saving} />
                            </div>
                          </div>
                          <div className="col-12 small text-secondary">Mentor and certifier choices are limited to accounts accredited for the selected catalog course.</div>
                          <div className="col-md-6">
                            <AccountMultiSelect id="event-mentors" label={selectedEvent?.status === 'Approved' ? 'Approved mentor/s' : 'Proposed mentors'} accounts={mentors} value={formData.mentor_ids} onChange={(value) => handleSelectChange('mentor_ids', value)} disabled={saving || loadingProposedPeople} loading={loadingProposedPeople} />
                          </div>
                          <div className="col-md-6">
                            <AccountMultiSelect id="event-certifiers" label={selectedEvent?.status === 'Approved' ? 'Approved certifier/s' : 'Proposed certifiers'} accounts={certifiers} value={formData.certifier_ids} onChange={(value) => handleSelectChange('certifier_ids', value)} disabled={saving || loadingProposedPeople} loading={loadingProposedPeople} />
                          </div>
                        </div>
                      </div>
                      <div className="modal-footer">
                        <button className="btn btn-outline-secondary" type="button" onClick={closeModal} disabled={saving}>Cancel</button>
                        <button className="btn btn-success" type="submit" disabled={saving || !courses.length}>{saving ? <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />Saving...</> : modalMode === 'edit' ? 'Save Changes' : 'Submit Proposal'}</button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            </div>
            <div className="modal-backdrop fade show" onClick={() => { if (!saving) closeModal(); }} />
          </>
        )}

      </main>
      <SiteFooter />
    </div>
  );
}

export default LearningEventList;
