import React, { useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import BrandHeader from '../components/BrandHeader';
import SiteFooter from '../components/SiteFooter';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/+$/, '');
const UNIT_TYPES = ['Union', 'Mission', 'District', 'Local_Church', 'Hospital', 'School', 'Services'];
const EMPTY_FORM = { name: '', unit_type: '', parent_unit_id: '' };

function formatLabel(value = '') {
  return value.replaceAll('_', ' ');
}

function InstitutionAdd() {
  const { user, loading: authLoading } = useContext(AuthContext);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [units, setUnits] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (authLoading || !user || !user.canAddEvents) {
      setLoadingOptions(false);
      return undefined;
    }

    const controller = new AbortController();
    const loadUnits = async () => {
      setLoadingOptions(true);
      setError('');
      try {
        const response = await fetch(`${API_BASE_URL}/api/institutions/options`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('ld_cert_token') || ''}` },
          signal: controller.signal,
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) {
          throw new Error(result.message || 'Could not load parent institutions.');
        }
        setUnits(result.data || []);
      } catch (loadError) {
        if (loadError.name !== 'AbortError') setError(loadError.message || 'Could not load parent institutions.');
      } finally {
        if (!controller.signal.aborted) setLoadingOptions(false);
      }
    };

    loadUnits();
    return () => controller.abort();
  }, [authLoading, user]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({
      ...current,
      [name]: value,
      ...(name === 'unit_type' ? { parent_unit_id: '' } : {}),
    }));
    setError('');
    setSuccess('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/institutions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('ld_cert_token') || ''}`,
        },
        body: JSON.stringify({
          ...formData,
          name: formData.name.trim(),
          parent_unit_id: formData.parent_unit_id || null,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Could not create the institution.');
      }

      const parentLabel = result.data.parent_name ? ` under ${result.data.parent_name}` : '';
      setSuccess(`${result.data.name} (${formatLabel(result.data.unit_type)}) was created${parentLabel}.`);
      setUnits((current) => [...current, result.data].sort((first, second) => first.name.localeCompare(second.name)));
      setFormData(EMPTY_FORM);
    } catch (submitError) {
      setError(submitError.message || 'Could not create the institution.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading) return null;

  if (!user || !user.canAddEvents) {
    return (
      <div className="min-vh-100 bg-light d-flex flex-column">
        <BrandHeader />
        <main className="container py-5 flex-grow-1">
          <div className="alert alert-warning" role="alert">Only a Union Administrator can create institutions.</div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <BrandHeader />
      <main className="container py-4 flex-grow-1">
        <div className="d-flex align-items-center justify-content-between gap-3 mb-3">
          <div>
            <p className="text-success text-uppercase fw-bold small mb-1">Institution Management</p>
            <h1 className="h2 mb-0" style={{ fontFamily: "'DM Serif Display', serif", color: '#1a202c' }}>New Institution</h1>
          </div>
        </div>

        <section className="card border-0 shadow-sm">
          <div className="card-body p-4">
            {error && <div className="alert alert-danger" role="alert">{error}</div>}
            {success && <div className="alert alert-success" role="status">{success}</div>}

            <form onSubmit={handleSubmit}>
              <div className="row g-3">
                <div className="col-md-6">
                  <label htmlFor="institution-name" className="form-label">Institution name <span className="text-danger">*</span></label>
                  <input
                    id="institution-name"
                    name="name"
                    className="form-control"
                    value={formData.name}
                    onChange={handleChange}
                    maxLength={150}
                    autoComplete="organization"
                    required
                    disabled={loadingOptions || isSubmitting}
                  />
                </div>
                <div className="col-md-6">
                  <label htmlFor="institution-type" className="form-label">Institution type <span className="text-danger">*</span></label>
                  <select
                    id="institution-type"
                    name="unit_type"
                    className="form-select"
                    value={formData.unit_type}
                    onChange={handleChange}
                    required
                    disabled={loadingOptions || isSubmitting}
                  >
                    <option value="">Choose an institution type *</option>
                    {UNIT_TYPES.map((type) => <option key={type} value={type}>{formatLabel(type)}</option>)}
                  </select>
                </div>

                <div className="col-md-6">
                  <label htmlFor="institution-parent" className="form-label">Mother institution</label>
                  <select
                    id="institution-parent"
                    name="parent_unit_id"
                    className="form-select"
                    value={formData.parent_unit_id}
                    onChange={handleChange}
                    disabled={loadingOptions || isSubmitting}
                  >
                    <option value="">No mother institution (top-level)</option>
                    {units.map((unit) => (
                      <option key={unit.unit_id} value={unit.unit_id}>
                        {unit.name} ({formatLabel(unit.unit_type)})
                      </option>
                    ))}
                  </select>
                  <div className="form-text">Choose any existing institution as this unit’s mother institution, or leave it blank.</div>
                </div>
              </div>

              <div className="d-flex justify-content-end gap-2 mt-4">
                <Link className="btn btn-outline-secondary" to="/home">Cancel</Link>
                <button className="btn btn-success" type="submit" disabled={loadingOptions || isSubmitting || Boolean(error && !units.length)}>
                  {isSubmitting ? <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />Saving...</> : 'Create Institution'}
                </button>
              </div>
            </form>
          </div>
        </section>

        <SiteFooter />
      </main>
    </div>
  );
}

export default InstitutionAdd;
