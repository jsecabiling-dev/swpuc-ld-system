import React, { useContext, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import BrandHeader from '../components/BrandHeader';
import SiteFooter from '../components/SiteFooter';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/+$/, '');

function LearningCourseAdd() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useContext(AuthContext);
  const [departments, setDepartments] = useState([]);
  const [formData, setFormData] = useState({ title: '', learning_level: '', department_id: '' });
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (authLoading || !user || !user.canAddCourses) {
      setLoadingOptions(false);
      return undefined;
    }

    const controller = new AbortController();
    const loadDepartments = async () => {
      setLoadingOptions(true);
      setError('');
      try {
        const response = await fetch(`${API_BASE_URL}/api/learning-courses/options`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('ld_cert_token') || ''}` },
          signal: controller.signal,
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) {
          throw new Error(result.message || 'Could not load departments.');
        }
        setDepartments(result.data.departments || []);
      } catch (loadError) {
        if (loadError.name !== 'AbortError') setError(loadError.message || 'Could not load departments.');
      } finally {
        if (!controller.signal.aborted) setLoadingOptions(false);
      }
    };

    loadDepartments();
    return () => controller.abort();
  }, [authLoading, user]);

  const handleChange = (event) => {
    setFormData((current) => ({ ...current, [event.target.name]: event.target.value }));
    setError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/learning-courses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('ld_cert_token') || ''}`,
        },
        body: JSON.stringify({
          title: formData.title.trim(),
          learning_level: formData.learning_level.trim(),
          department_id: formData.department_id,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Could not register the learning course.');
      }

      navigate('/learning/courses', {
                state: { success: `${result.data.title} was added to the course catalog.` },
      });
    } catch (submitError) {
      setError(submitError.message || 'Could not register the learning course.');
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
          <div className="alert alert-warning" role="alert">Only a Union Administrator can register learning courses.</div>
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
            <p className="text-success text-uppercase fw-bold small mb-1">Learning Management</p>
            <h1 className="h2 mb-0" style={{ fontFamily: "'DM Serif Display', serif", color: '#1a202c' }}>Register Learning Course</h1>
          </div>
          <Link className="btn btn-outline-secondary" to="/learning/courses">
            <i className="bi bi-arrow-left me-1" aria-hidden="true" /> Back to the Learning Course List
          </Link>
        </div>

        <section className="card border-0 shadow-sm">
          <div className="card-body p-4">
            {error && <div className="alert alert-danger" role="alert">{error}</div>}

            <form onSubmit={handleSubmit}>
              <div className="row g-3">
                <div className="col-md-6">
                  <label htmlFor="course-title" className="form-label">Course title <span className="text-danger">*</span></label>
                  <input id="course-title" name="title" className="form-control" value={formData.title} onChange={handleChange} maxLength={200} required disabled={loadingOptions || isSubmitting} />
                </div>
                <div className="col-md-3">
                  <label htmlFor="course-level" className="form-label">Learning level <span className="text-danger">*</span></label>
                  <input id="course-level" name="learning_level" className="form-control" value={formData.learning_level} onChange={handleChange} maxLength={100} placeholder="e.g. Level 1 *" required disabled={loadingOptions || isSubmitting} />
                </div>
                <div className="col-md-3">
                  <label htmlFor="course-department" className="form-label">Hosting department <span className="text-danger">*</span></label>
                  <select id="course-department" name="department_id" className="form-select" value={formData.department_id} onChange={handleChange} required disabled={loadingOptions || isSubmitting || !departments.length}>
                    <option value="">{loadingOptions ? 'Loading departments...' : 'Choose a department *'}</option>
                    {departments.map((department) => <option key={department.department_id} value={department.department_id}>{department.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="d-flex justify-content-end gap-2 mt-4">
                <Link className="btn btn-outline-secondary" to="/learning/courses">Cancel</Link>
                <button className="btn btn-success" type="submit" disabled={loadingOptions || isSubmitting || !departments.length}>
                  {isSubmitting ? <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />Saving...</> : 'Register Course'}
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

export default LearningCourseAdd;
