import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import SortableTableHeader, { useTableSort } from '../components/SortableTableHeader';
import BrandHeader from '../components/BrandHeader';
import SiteFooter from '../components/SiteFooter';
import { formatShortDate } from '../utils/dateFormat';
import './organizationalUnitList.css';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/+$/, '');

function DepartmentList() {
  const sort = useTableSort();
  const { user } = useContext(AuthContext);
  const canAdd = Boolean(user?.canAddCourses);
  const canEdit = Boolean(user?.canEditCourses);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedDepartment, setSelectedDepartment] = useState(null);
  const [modalMode, setModalMode] = useState('');
  const [editForm, setEditForm] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    const loadDepartments = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`${API_BASE_URL}/api/departments`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('ld_cert_token') || ''}` },
          signal: controller.signal,
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) throw new Error(result.message || 'Could not load departments.');
        setDepartments(result.data || []);
      } catch (loadError) {
        if (loadError.name !== 'AbortError') setError(loadError.message || 'Could not load departments.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    loadDepartments();
    return () => controller.abort();
  }, [user, canAdd, canEdit, reloadKey]);

  const filteredDepartments = useMemo(() => {
    const query = search.trim().toLowerCase();
    return departments.filter((department) => {
      if (!query) return true;
      return [department.name, department.description]
        .some((value) => String(value || '').toLowerCase().includes(query));
    });
  }, [departments, search]);

  const closeModal = () => {
    setSelectedDepartment(null);
    setModalMode('');
    setEditForm(null);
  };

  const showView = (department) => {
    setSelectedDepartment(department);
    setModalMode('view');
    setError('');
    setSuccess('');
  };

  const showEdit = (department) => {
    if (!canEdit) return;
    setSelectedDepartment(department);
    setModalMode('edit');
    setEditForm({
      name: department.name || '',
      description: department.description || '',
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
    if (!canEdit || !selectedDepartment || !editForm) return;
    setIsSaving(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/departments/${selectedDepartment.department_id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('ld_cert_token') || ''}`,
        },
        body: JSON.stringify({
          ...editForm,
          name: editForm.name.trim(),
          description: editForm.description.trim(),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || 'Could not update this department.');

      setDepartments((current) => current.map((department) => (
        department.department_id === selectedDepartment.department_id ? result.data : department
      )));
      setSuccess(`${result.data.name} was updated.`);
      closeModal();
      setReloadKey((key) => key + 1);
    } catch (saveError) {
      setError(saveError.message || 'Could not update this department.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!user) {
    return (
      <div className="min-vh-100 bg-light d-flex flex-column">
        <BrandHeader />
        <main className="container py-5 flex-grow-1">
          <div className="alert alert-warning" role="alert">Sign in to view departments.</div>
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
            <p className="text-success text-uppercase fw-bold small mb-1">Entity Management</p>
            <h1 className="h2 mb-0" style={{ fontFamily: "'DM Serif Display', serif", color: '#1a202c' }}>Department List</h1>
          </div>
          {canAdd && (
            <Link className="btn btn-success d-none d-md-inline-block ms-auto" to="/departments/new">
              <i className="bi bi-plus-lg me-1" aria-hidden="true" /> Add New Department
            </Link>
          )}
        </div>

        {error && <div className="alert alert-danger" role="alert">{error}</div>}
        {success && <div className="alert alert-success" role="status">{success}</div>}

        <section className="card border-0 shadow-sm">
          <div className="card-body p-2 p-md-3">
            <div className="row g-2 g-md-3 align-items-end mb-2 mb-md-3">
              <div className="col-md-12">
                <label htmlFor="department-search" className="visually-hidden">Search departments</label>
                <input id="department-search" className="form-control" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search departments by name or description" />
              </div>
            </div>

            {loading ? (
              <div className="text-center text-secondary py-3 py-md-5" role="status">
                <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" /> Loading departments...
              </div>
            ) : filteredDepartments.length === 0 ? (
              <div className="text-center text-secondary py-3 py-md-5">No departments match your search.</div>
            ) : (
              <div className="table-responsive department-list-scroll">
                <table className="table table-hover align-middle mb-0">
                  <caption className="visually-hidden">Departments and available actions</caption>
                  <thead className="table-light">
                    <tr><th scope="col" className="text-nowrap text-center">ID No</th>
                      <SortableTableHeader sort={sort} column="name">Department</SortableTableHeader>
                      <th scope="col" className="d-none d-md-table-cell">Created</th>
                      <th scope="col" className="text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sort.order(filteredDepartments, { name: (row) => row.name }, (a, b) => Number(b.department_id) - Number(a.department_id)).map((department) => (
                      <tr key={department.department_id}><td className="text-nowrap text-center">{department.department_id}</td>
                        <td>
                          <div className="fw-semibold">{department.name}</div>
                          <small className="text-muted d-none d-md-inline">{department.description || 'Department'}</small>
                        </td>
                        <td className="d-none d-md-table-cell">{formatShortDate(department.created_at)}</td>
                        <td className="text-center text-nowrap">
                          <button className="btn btn-sm user-action-button me-md-1" type="button" onClick={() => showView(department)} aria-label={`View ${department.name}`} title={`View ${department.name}`}>
                            <i className="bi bi-card-text fs-6" aria-hidden="true" />
                          </button>
                          {canEdit && (
                            <button className="btn btn-sm user-action-button d-none d-md-inline-flex" type="button" onClick={() => showEdit(department)} aria-label={`Edit ${department.name}`} title={`Edit ${department.name}`}>
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

        {selectedDepartment && modalMode && (
          <>
            <div className="modal fade show d-block" role="dialog" aria-modal="true" aria-labelledby="department-modal-title" tabIndex="-1" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}>
              <div className={`modal-dialog modal-dialog-centered modal-dialog-scrollable ${modalMode === 'edit' ? 'modal-lg' : ''}`}>
                <div className="modal-content border-0 shadow">
                  <div className="modal-header bg-light">
                    <h2 id="department-modal-title" className={`modal-title h5 fw-bold${modalMode === 'view' ? ' department-details-title' : ''}`}>
                      {modalMode === 'view' ? 'Department Details' : `Edit ${selectedDepartment.name}`}
                    </h2>
                    <button className="btn-close" type="button" onClick={closeModal} aria-label="Close" />
                  </div>
                  {modalMode === 'view' ? (
                    <div className="modal-body">
                      <h3 className="h5 mb-3">{selectedDepartment.name}</h3>
                      <dl className="row mb-0">
                        <dt className="col-sm-4">Description</dt><dd className="col-sm-8 text-break">{selectedDepartment.description || '—'}</dd>
                        <dt className="col-sm-4">Created</dt><dd className="col-sm-8">{selectedDepartment.created_at ? new Date(selectedDepartment.created_at).toLocaleString() : '—'}</dd>
                      </dl>
                    </div>
                  ) : (
                    <form onSubmit={saveEdit}>
                      <div className="modal-body">
                        {error && <div className="alert alert-danger" role="alert">{error}</div>}
                        <div className="row g-3">
                          <div className="col-md-6">
                            <label htmlFor="edit-department-name" className="form-label">Department name *</label>
                            <input id="edit-department-name" name="name" className="form-control" value={editForm.name} onChange={handleEditChange} maxLength={150} required />
                          </div>
                          <div className="col-12">
                            <label htmlFor="edit-department-description" className="form-label">Description</label>
                            <textarea id="edit-department-description" name="description" className="form-control" rows="4" value={editForm.description} onChange={handleEditChange} maxLength={20000} />
                          </div>
                        </div>
                      </div>
                      <div className="modal-footer">
                        <button className="btn btn-outline-secondary" type="button" onClick={closeModal} disabled={isSaving}>Cancel</button>
                        <button className="btn btn-success" type="submit" disabled={isSaving}>{isSaving ? 'Saving...' : 'Save changes'}</button>
                      </div>
                    </form>
                  )}
                  {modalMode === 'view' && (
                    <div className="modal-footer">
                      <button className="btn btn-outline-secondary" type="button" onClick={closeModal}>Close</button>
                      {canEdit && <button className="btn btn-success d-none d-md-inline-block" type="button" onClick={() => showEdit(selectedDepartment)}>Edit department</button>}
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

export default DepartmentList;
