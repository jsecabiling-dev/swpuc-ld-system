import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import SortableTableHeader, { useTableSort } from '../components/SortableTableHeader';
import BrandHeader from '../components/BrandHeader';
import SiteFooter from '../components/SiteFooter';
import { formatShortDate } from '../utils/dateFormat';
import './organizationalUnitList.css';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/+$/, '');
const UNIT_TYPES = ['Union', 'Mission', 'District', 'Local_Church', 'Hospital', 'School', 'Services'];

function formatLabel(value = '') {
  return value.replaceAll('_', ' ');
}

function getDescendantIds(institutions, rootId) {
  const descendants = new Set([rootId]);
  let foundNewDescendant = true;
  while (foundNewDescendant) {
    foundNewDescendant = false;
    institutions.forEach((institution) => {
      if (descendants.has(institution.parent_unit_id) && !descendants.has(institution.unit_id)) {
        descendants.add(institution.unit_id);
        foundNewDescendant = true;
      }
    });
  }
  return descendants;
}

function InstitutionList() {
  const sort = useTableSort();
  const { user } = useContext(AuthContext);
  const canAdd = Boolean(user?.canAddEvents);
  const canEdit = Boolean(user?.canEditEvents);
  const [institutions, setInstitutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [childFilterRootId, setChildFilterRootId] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedInstitution, setSelectedInstitution] = useState(null);
  const [modalMode, setModalMode] = useState('');
  const [editForm, setEditForm] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    const loadInstitutions = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`${API_BASE_URL}/api/institutions`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('ld_cert_token') || ''}` },
          signal: controller.signal,
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) {
          throw new Error(result.message || 'Could not load institutions.');
        }
        setInstitutions(result.data || []);
      } catch (loadError) {
        if (loadError.name !== 'AbortError') setError(loadError.message || 'Could not load institutions.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    loadInstitutions();
    return () => controller.abort();
  }, [user, reloadKey]);

  const filteredInstitutions = useMemo(() => {
    const query = search.trim().toLowerCase();
    const visibleIds = childFilterRootId === null
      ? null
      : getDescendantIds(institutions, childFilterRootId);
    return institutions.filter((institution) => {
      if (visibleIds && !visibleIds.has(institution.unit_id)) return false;
      if (typeFilter !== 'all' && institution.unit_type !== typeFilter) return false;
      if (!query) return true;
      return [institution.name, institution.unit_type, institution.parent_name]
        .some((value) => String(value || '').toLowerCase().includes(query));
    });
  }, [institutions, search, typeFilter, childFilterRootId]);
  const childFilterRoot = institutions.find((institution) => institution.unit_id === childFilterRootId);

  const parentOptions = useMemo(() => {
    if (!selectedInstitution) return institutions;
    const excludedIds = new Set([selectedInstitution.unit_id]);
    let foundDescendant = true;
    while (foundDescendant) {
      foundDescendant = false;
      institutions.forEach((institution) => {
        if (excludedIds.has(institution.parent_unit_id) && !excludedIds.has(institution.unit_id)) {
          excludedIds.add(institution.unit_id);
          foundDescendant = true;
        }
      });
    }
    return institutions.filter((institution) => !excludedIds.has(institution.unit_id));
  }, [institutions, selectedInstitution]);

  const closeModal = () => {
    setSelectedInstitution(null);
    setModalMode('');
    setEditForm(null);
  };

  const showView = (institution) => {
    setSelectedInstitution(institution);
    setModalMode('view');
    setError('');
    setSuccess('');
  };

  const showEdit = (institution) => {
    if (!canEdit) return;
    setSelectedInstitution(institution);
    setModalMode('edit');
    setEditForm({
      name: institution.name || '',
      unit_type: institution.unit_type || '',
      parent_unit_id: institution.parent_unit_id ? String(institution.parent_unit_id) : '',
    });
    setError('');
    setSuccess('');
  };

  const handleEditChange = (event) => {
    const { name, value } = event.target;
    setEditForm((current) => ({ ...current, [name]: value }));
  };

  const saveEdit = async (event) => {
    event.preventDefault();
    if (!canEdit || !selectedInstitution || !editForm) return;

    setIsSaving(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/institutions/${selectedInstitution.unit_id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('ld_cert_token') || ''}`,
        },
        body: JSON.stringify({
          ...editForm,
          name: editForm.name.trim(),
          parent_unit_id: editForm.parent_unit_id || null,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Could not update this institution.');
      }

      setInstitutions((current) => current.map((institution) => (
        institution.unit_id === selectedInstitution.unit_id ? result.data : institution
      )));
      setSelectedInstitution(result.data);
      setReloadKey((key) => key + 1);
      setSuccess(`${result.data.name} was updated.`);
      closeModal();
    } catch (saveError) {
      setError(saveError.message || 'Could not update this institution.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!user) {
    return (
      <div className="min-vh-100 bg-light d-flex flex-column">
        <BrandHeader />
        <main className="container py-5 flex-grow-1">
          <div className="alert alert-warning" role="alert">Sign in to view institutions.</div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <BrandHeader />
      <main className="organizational-unit-list container py-3 py-md-4 flex-grow-1">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 gap-md-3 mb-3 mb-md-4">
          <div>
            <p className="text-success text-uppercase fw-bold small mb-1">Institution Management</p>
            <h1 className="h2 mb-0" style={{ fontFamily: "'DM Serif Display', serif", color: '#1a202c' }}>Institution List</h1>
          </div>
          {canAdd && (
            <Link className="btn btn-success d-none d-md-inline-block ms-auto" to="/institutions/new">
              <i className="bi bi-plus-lg me-1" aria-hidden="true" /> Add New Institution
            </Link>
          )}
        </div>

        {error && <div className="alert alert-danger" role="alert">{error}</div>}
        {success && <div className="alert alert-success" role="status">{success}</div>}

        <section className="card border-0 shadow-sm">
          <div className="card-body p-2 p-md-3">
            {childFilterRoot && (
              <div className="alert alert-secondary d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3" role="status">
                <span>Showing {childFilterRoot.name} and all of its descendant institutions.</span>
                <button className="btn btn-sm btn-outline-secondary" type="button" onClick={() => setChildFilterRootId(null)}>
                  <i className="bi bi-arrow-clockwise me-1" aria-hidden="true" /> Show all institutions
                </button>
              </div>
            )}
            <div className="row g-2 g-md-3 align-items-end mb-2 mb-md-3">
              <div className="col-md-8">
                <label htmlFor="institution-search" className="visually-hidden">Search institutions</label>
                <input
                  id="institution-search"
                  className="form-control"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by institution, type, or mother institution"
                />
              </div>
              <div className="col-md-4">
                <label htmlFor="institution-type-filter" className="visually-hidden">Institution type</label>
                <select id="institution-type-filter" className="form-select" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                  <option value="all">All institution types</option>
                  {UNIT_TYPES.map((type) => <option key={type} value={type}>{formatLabel(type)}</option>)}
                </select>
              </div>
            </div>

            {loading ? (
              <div className="text-center text-secondary py-3 py-md-5" role="status">
                <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" /> Loading institutions...
              </div>
            ) : filteredInstitutions.length === 0 ? (
              <div className="text-center text-secondary py-3 py-md-5">No institutions match your search.</div>
            ) : (
              <div className="table-responsive institution-list-scroll">
                <table className="table table-hover align-middle mb-0">
                  <caption className="visually-hidden">Institutions, their mother units, and available actions</caption>
                  <thead className="table-light">
                    <tr><th scope="col" className="text-nowrap text-center">ID No</th>
                      <SortableTableHeader sort={sort} column="name">Institution</SortableTableHeader>
                      <th scope="col" className="d-none d-md-table-cell">Mother institution</th>
                      <th scope="col" className="d-none d-md-table-cell text-center">Children</th>
                      <th scope="col" className="d-none d-md-table-cell">Created</th>
                      <th scope="col" className="text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sort.order(filteredInstitutions, { name: (row) => row.name }, (a, b) => Number(b.unit_id) - Number(a.unit_id)).map((institution) => (
                      <tr key={institution.unit_id}><td className="text-nowrap text-center">{institution.unit_id}</td>
                        <td>
                          <div className="fw-semibold">{institution.name}</div>
                          <small className="text-muted">{formatLabel(institution.unit_type)}</small>
                        </td>
                        <td className="d-none d-md-table-cell">{institution.parent_name || <span className="text-muted">—</span>}</td>
                        <td className="d-none d-md-table-cell text-center">{institution.child_count}</td>
                        <td className="d-none d-md-table-cell">{formatShortDate(institution.created_at)}</td>
                        <td className="text-center text-nowrap">
                          <button
                            className="btn btn-sm user-action-button d-none d-md-inline-flex me-1"
                            type="button"
                            onClick={() => {
                              if (childFilterRootId === institution.unit_id) {
                                setChildFilterRootId(null);
                              } else {
                                setSearch('');
                                setTypeFilter('all');
                                setChildFilterRootId(institution.unit_id);
                              }
                            }}
                            aria-label={childFilterRootId === institution.unit_id ? 'Show all institutions' : `Show children of ${institution.name}`}
                            title={childFilterRootId === institution.unit_id ? 'Show all institutions' : `Show children of ${institution.name}`}
                            disabled={Number(institution.child_count) === 0 && childFilterRootId !== institution.unit_id}
                          >
                            <i className={`bi ${childFilterRootId === institution.unit_id ? 'bi-arrow-clockwise' : 'bi-diagram-3'} fs-6`} aria-hidden="true" />
                          </button>
                          <button className="btn btn-sm user-action-button me-md-1" type="button" onClick={() => showView(institution)} aria-label={`View ${institution.name}`} title={`View ${institution.name}`}>
                            <i className="bi bi-card-text fs-6" aria-hidden="true" />
                          </button>
                          {canEdit && (
                            <button className="btn btn-sm user-action-button d-none d-md-inline-flex" type="button" onClick={() => showEdit(institution)} aria-label={`Edit ${institution.name}`} title={`Edit ${institution.name}`}>
                              <i className="bi bi-pencil-square fs-6" aria-hidden="true" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {selectedInstitution && modalMode && (
          <>
            <div className="modal fade show d-block" role="dialog" aria-modal="true" aria-labelledby="institution-modal-title" tabIndex="-1" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}>
              <div className={`modal-dialog modal-dialog-centered modal-dialog-scrollable ${modalMode === 'edit' ? 'modal-lg' : ''}`}>
                <div className="modal-content border-0 shadow">
                  <div className="modal-header bg-light">
                    <h2 id="institution-modal-title" className={`modal-title h5 fw-bold${modalMode === 'view' ? ' institution-details-title' : ''}`}>
                      {modalMode === 'view' ? 'Institution details' : `Edit ${selectedInstitution.name}`}
                    </h2>
                    <button className="btn-close" type="button" onClick={closeModal} aria-label="Close" />
                  </div>

                  {modalMode === 'view' ? (
                    <div className="modal-body">
                      <h3 className="h5 mb-3">{selectedInstitution.name}</h3>
                      <dl className="row mb-0">
                        <dt className="col-sm-5">Institution type</dt><dd className="col-sm-7">{formatLabel(selectedInstitution.unit_type)}</dd>
                        <dt className="col-sm-5">Mother institution</dt><dd className="col-sm-7">{selectedInstitution.parent_name || 'None (top-level)'}</dd>
                        <dt className="col-sm-5">Child units</dt><dd className="col-sm-7">{selectedInstitution.child_count}</dd>
                        <dt className="col-sm-5">Created</dt><dd className="col-sm-7">{selectedInstitution.created_at ? new Date(selectedInstitution.created_at).toLocaleString() : '—'}</dd>
                      </dl>
                    </div>
                  ) : (
                    <form onSubmit={saveEdit}>
                      <div className="modal-body">
                        {error && <div className="alert alert-danger" role="alert">{error}</div>}
                        <div className="row g-3">
                          <div className="col-md-6">
                            <label htmlFor="edit-institution-name" className="form-label">Institution name *</label>
                            <input id="edit-institution-name" name="name" className="form-control" value={editForm.name} onChange={handleEditChange} maxLength={150} required />
                          </div>
                          <div className="col-md-6">
                            <label htmlFor="edit-institution-type" className="form-label">Institution type *</label>
                            <select id="edit-institution-type" name="unit_type" className="form-select" value={editForm.unit_type} onChange={handleEditChange} required>
                              {UNIT_TYPES.map((type) => <option key={type} value={type}>{formatLabel(type)}</option>)}
                            </select>
                          </div>
                          <div className="col-12">
                            <label htmlFor="edit-institution-parent" className="form-label">Mother institution</label>
                            <select id="edit-institution-parent" name="parent_unit_id" className="form-select" value={editForm.parent_unit_id} onChange={handleEditChange}>
                              <option value="">No mother institution (top-level)</option>
                              {parentOptions.map((institution) => (
                                <option key={institution.unit_id} value={institution.unit_id}>
                                  {institution.name} ({formatLabel(institution.unit_type)})
                                </option>
                              ))}
                            </select>
                            <div className="form-text">An institution cannot be placed under itself or one of its descendants.</div>
                          </div>
                        </div>
                      </div>
                      <div className="modal-footer">
                        <button className="btn btn-outline-secondary" type="button" onClick={closeModal} disabled={isSaving}>Cancel</button>
                        <button className="btn btn-success" type="submit" disabled={isSaving}>
                          {isSaving ? 'Saving...' : 'Save changes'}
                        </button>
                      </div>
                    </form>
                  )}

                  {modalMode === 'view' && (
                    <div className="modal-footer">
                      <button className="btn btn-outline-secondary" type="button" onClick={closeModal}>Close</button>
                      {canEdit && <button className="btn btn-success d-none d-md-inline-block" type="button" onClick={() => showEdit(selectedInstitution)}>Edit institution</button>}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="modal-backdrop fade show" onClick={closeModal} />
          </>
        )}

        <SiteFooter />
      </main>
    </div>
  );
}

export default InstitutionList;
