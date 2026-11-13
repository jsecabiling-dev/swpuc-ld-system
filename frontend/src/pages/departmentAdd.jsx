import React, { useContext, useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import BrandHeader from '../components/BrandHeader';
import SiteFooter from '../components/SiteFooter';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/+$/, '');

function DepartmentAdd() {
  const { user, loading: authLoading } = useContext(AuthContext);
  const [formData, setFormData] = useState({ name: '', description: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
    setError('');
    setSuccess('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/departments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('ld_cert_token') || ''}`,
        },
        body: JSON.stringify({
          ...formData,
          name: formData.name.trim(),
          description: formData.description.trim(),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || 'Could not create the department.');

      setSuccess(`${result.data.name} was added.`);
      setFormData({ name: '', description: '' });
    } catch (submitError) {
      setError(submitError.message || 'Could not create the department.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading) return null;

  if (!user || !user.canAddCourses) {
    return (
      <div className="min-vh-100 bg-light d-flex flex-column">
        <BrandHeader />
        <main className="container py-5 flex-grow-1">
          <div className="alert alert-warning" role="alert">Only a Union Administrator can create departments.</div>
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
            <p className="text-success text-uppercase fw-bold small mb-1">Entity Management</p>
            <h1 className="h2 mb-0" style={{ fontFamily: "'DM Serif Display', serif", color: '#1a202c' }}>Add New Department</h1>
          </div>
        </div>

        <section className="card border-0 shadow-sm">
          <div className="card-body p-4">
            {error && <div className="alert alert-danger" role="alert">{error}</div>}
            {success && <div className="alert alert-success" role="status">{success}</div>}
            <form onSubmit={handleSubmit}>
              <div className="row g-3">
                <div className="col-md-6">
                  <label htmlFor="department-name" className="form-label">Department name <span className="text-danger">*</span></label>
                  <input id="department-name" name="name" className="form-control" value={formData.name} onChange={handleChange} maxLength={150} required disabled={isSubmitting} />
                </div>
                <div className="col-12">
                  <label htmlFor="department-description" className="form-label">Description</label>
                  <textarea id="department-description" name="description" className="form-control" rows="4" value={formData.description} onChange={handleChange} maxLength={20000} disabled={isSubmitting} />
                </div>
              </div>
              <div className="d-flex justify-content-end gap-2 mt-4">
                <Link className="btn btn-outline-secondary" to="/home">Cancel</Link>
                <button className="btn btn-success" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />Saving...</> : 'Create Department'}
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

export default DepartmentAdd;
