import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import BrandHeader from '../components/BrandHeader';
import SiteFooter from '../components/SiteFooter';
import CommunityProfileAvatar from '../components/CommunityProfileAvatar';
import './userList.css';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/+$/, '');

function fullName(person) {
  const middleInitial = person.middle_name?.trim().charAt(0);
  return [person.first_name, middleInitial ? `${middleInitial.toUpperCase()}.` : '', person.last_name, person.suffix].filter(Boolean).join(' ');
}

function CommunityRoleList({ role }) {
  const { user } = useContext(AuthContext);
  const label = role === 'mentor' ? 'Mentor' : 'Certifier';
  const [people, setPeople] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [candidateSearch, setCandidateSearch] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const token = () => localStorage.getItem('ld_cert_token') || '';

  const loadPeople = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/community-roles/${role}`, { headers: { Authorization: `Bearer ${token()}` } });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || `Could not load ${label.toLowerCase()} accounts.`);
      setPeople(result.data || []);
    } catch (loadError) { setError(loadError.message); }
    finally { setLoading(false); }
  }, [role, label]);

  useEffect(() => { loadPeople(); }, [loadPeople]);

  const loadCandidates = async () => {
    const response = await fetch(`${API_BASE_URL}/api/community-roles/${role}/candidates`, { headers: { Authorization: `Bearer ${token()}` } });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) throw new Error(result.message || 'Could not load user accounts.');
    const options = result.data || [];
    setCandidates(options);
  };

  const openAdd = async () => {
    setError(''); setNotice(''); setEditing(null); setSelectedId(''); setCandidateSearch('');
    try { await loadCandidates(); }
    catch (loadError) { setError(loadError.message); return; }
    setEditing({ mode: 'add' });
  };

  const saveAssignment = async (event) => {
    event.preventDefault();
    if (!selectedId) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/community-roles/${role}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ user_id: Number(selectedId) }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || 'Could not save this directory entry.');
      setEditing(null); setNotice(result.message); await loadPeople();
    } catch (saveError) { setError(saveError.message); }
    finally { setSaving(false); }
  };

  const removeAssignment = async (person) => {
    if (!window.confirm(`Remove ${fullName(person)} from the ${label.toLowerCase()} directory? Their user account will remain unchanged.`)) return;
    setError(''); setNotice('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/community-roles/${role}/${person.user_id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || 'Could not remove this directory entry.');
      setNotice(result.message); await loadPeople();
    } catch (removeError) { setError(removeError.message); }
  };

  const visiblePeople = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return people;
    return people.filter((person) => `${fullName(person)} ${person.email || ''} ${person.unit_name || ''}`.toLowerCase().includes(query));
  }, [people, search]);

  const matchingCandidates = useMemo(() => {
    const query = candidateSearch.trim().toLowerCase();
    if (!query) return [];
    return candidates.filter((person) => (
      `${fullName(person)} ${person.email || ''} ${person.unit_name || ''}`.toLowerCase().includes(query)
    )).slice(0, 8);
  }, [candidates, candidateSearch]);

  const canAdd = Boolean(user?.canAddUsers);
  const canDelete = Boolean(user?.canDeleteUsers);

  return (
    <div className={`users-page community-role-list ${role === 'mentor' ? 'mentor-list-page' : 'certifier-list-page'} min-vh-100 bg-light d-flex flex-column`}>
      <BrandHeader />
      <main className="container py-4 flex-grow-1">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
          <div><p className="users-eyebrow text-success text-uppercase fw-bold small mb-1">Community</p><h1 className="users-title h2 mb-1" style={{ fontFamily: "'DM Serif Display', serif", color: '#1a202c' }}>{label} Accounts</h1><p className="text-secondary mb-0">Manage {label.toLowerCase()} directory entries from existing user accounts.</p></div>
          {canAdd && <button className="users-add-button btn btn-success" type="button" onClick={openAdd}><i className="bi bi-person-plus me-2" aria-hidden="true" />Add {label}</button>}
        </div>
        {error && !editing && <div className="alert alert-danger" role="alert">{error}</div>}
        {notice && <div className="alert alert-success" role="status">{notice}</div>}
        <section className="card border-0 shadow-sm"><div className="card-body">
          <div className="mb-3"><label htmlFor={`${role}-search`} className="visually-hidden">Search {label.toLowerCase()} accounts</label><input id={`${role}-search`} className="form-control" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name, email, or affiliation" /></div>
          {loading ? <div className="text-center text-secondary py-5" role="status"><span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />Loading {label.toLowerCase()} accounts...</div>
            : visiblePeople.length === 0 ? <div className="text-center text-secondary py-5">{people.length ? 'No accounts match your search.' : `No ${label.toLowerCase()} accounts have been added.`}</div>
              : <div className="table-responsive"><table className="table table-hover align-middle mb-0"><caption className="visually-hidden">{label} accounts</caption><thead className="table-light"><tr><th scope="col" className="text-nowrap text-center">ID No</th><th>Name</th><th>Email</th><th>Affiliation</th><th>Status</th><th className="text-center"><span className="d-md-none">View</span><span className="d-none d-md-inline">Actions</span></th></tr></thead><tbody>
                {[...visiblePeople].sort((a, b) => Number(b.user_id) - Number(a.user_id)).map((person) => <tr key={person.user_id}><td className="text-nowrap text-center">{person.user_id}</td><td><div className="d-flex align-items-center gap-2"><CommunityProfileAvatar key={`${person.user_id}-${person.profilepict || ''}`} person={person} /><span className="fw-semibold">{fullName(person)}</span></div></td><td>{person.email || '—'}</td><td>{person.unit_name || '—'}</td><td><span className={`badge ${person.is_active ? 'text-bg-success' : 'text-bg-secondary'}`}>{person.is_active ? 'Active' : 'Inactive'}</span></td><td className="text-center"><div className="d-inline-flex gap-2"><Link className="btn btn-sm btn-outline-secondary community-action-button" to={`/community/${role === 'mentor' ? 'mentors' : 'certifiers'}/${person.user_id}`} aria-label={`View ${fullName(person)}`} title={`View ${label.toLowerCase()} details`}><i className="bi bi-card-text text-secondary" aria-hidden="true" /></Link>{canDelete && <button className="btn btn-sm btn-outline-secondary community-action-button" type="button" onClick={() => removeAssignment(person)} aria-label={`Remove ${fullName(person)}`}><i className="bi bi-trash text-secondary" aria-hidden="true" /></button>}</div></td></tr>)}
              </tbody></table></div>}
        </div></section>
      </main>
      {editing && <>
        <div className="modal fade show d-block" role="dialog" aria-modal="true" aria-labelledby={`${role}-dialog-title`} tabIndex="-1" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setEditing(null); }}>
          <div className="modal-dialog modal-dialog-centered" style={{ height: '34rem', maxWidth: '35rem', marginTop: 0, marginBottom: 0 }}>
            <form className="modal-content border-0 shadow" style={{ height: '34rem' }} onSubmit={saveAssignment}>
              <div className="modal-header">
                <h2 id={`${role}-dialog-title`} className="modal-title h5">Add {label} Account</h2>
                <button className="btn-close" type="button" onClick={() => setEditing(null)} aria-label="Close" disabled={saving} />
              </div>
              <div className="modal-body d-flex flex-column" style={{ overflowY: 'auto' }}>
                {error && <div className="alert alert-danger" role="alert">{error}</div>}
                <label className="form-label" htmlFor={`${role}-user-search`}>Search existing user accounts *</label>
                <input
                  id={`${role}-user-search`}
                  className="form-control"
                  type="search"
                  value={candidateSearch}
                  onChange={(event) => { setCandidateSearch(event.target.value); setSelectedId(''); }}
                  placeholder="Type a name, email, or affiliation *"
                  autoComplete="off"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={!selectedId && matchingCandidates.length > 0}
                  aria-controls={`${role}-user-options`}
                  required={!selectedId}
                  disabled={saving}
                />
                <div
                  id={`${role}-user-options`}
                  className="list-group mt-2 shadow-sm"
                  role={selectedId || !candidateSearch.trim() ? undefined : 'listbox'}
                  aria-label={selectedId || !candidateSearch.trim() ? undefined : 'Matching user accounts'}
                  style={{ height: '16rem', minHeight: '16rem', flex: '0 0 16rem', overflowY: 'auto' }}
                >
                  {selectedId ? (
                    <div className="list-group-item d-flex flex-column justify-content-center">
                      <span className="fw-semibold">{fullName(candidates.find((person) => String(person.user_id) === selectedId) || editing.person || {})}</span>
                      <small className="text-muted">Selected user account</small>
                    </div>
                  ) : !candidateSearch.trim() ? (
                    <div className="list-group-item d-flex align-items-center justify-content-center text-secondary">Start typing to search user accounts.</div>
                  ) : matchingCandidates.length ? matchingCandidates.map((person) => (
                      <button
                        key={person.user_id}
                        className="list-group-item list-group-item-action text-start"
                        type="button"
                        role="option"
                        aria-selected="false"
                        onClick={() => { setSelectedId(String(person.user_id)); setCandidateSearch(fullName(person)); }}
                      >
                        <span className="d-block fw-semibold">{fullName(person)}</span>
                        <small className="text-muted">{[person.email, person.unit_name].filter(Boolean).join(' · ') || 'User account'}</small>
                      </button>
                  )) : <div className="list-group-item d-flex align-items-center justify-content-center text-secondary">No matching user accounts.</div>}
                </div>
                <div className="form-text" style={{ marginTop: '1rem' }}>Type to filter user accounts, then choose a match. The existing account details and account role remain unchanged.</div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-outline-secondary" type="button" onClick={() => setEditing(null)} disabled={saving}>Cancel</button>
                <button className="btn btn-success" type="submit" disabled={saving || !selectedId}>{saving ? 'Saving...' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
        <div className="modal-backdrop fade show" onClick={() => !saving && setEditing(null)} />
      </>}      <SiteFooter />
    </div>
  );
}

export default CommunityRoleList;
