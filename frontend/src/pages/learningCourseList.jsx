import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import BrandHeader from '../components/BrandHeader';
import CommunityProfileAvatar from '../components/CommunityProfileAvatar';
import SiteFooter from '../components/SiteFooter';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/+$/, '');

function LearningCourseList() {
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const canAdd = Boolean(user?.canAddCourses);
  const canEdit = Boolean(user?.canEditCourses);
  const canDelete = Boolean(user?.canDeleteCourses);
  const [courses, setCourses] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(location.state?.success || '');
  const [search, setSearch] = useState('');
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [modalMode, setModalMode] = useState('');
  const [accreditedPeople, setAccreditedPeople] = useState({ mentors: [], certifiers: [] });
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleError, setPeopleError] = useState('');
  const [editForm, setEditForm] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    if (modalMode !== 'view' || !selectedCourse) return undefined;

    const controller = new AbortController();
    const loadAccreditations = async () => {
      setPeopleLoading(true);
      setPeopleError('');
      setAccreditedPeople({ mentors: [], certifiers: [] });
      try {
        const response = await fetch(`${API_BASE_URL}/api/learning-courses/${selectedCourse.course_id}/accreditations`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('ld_cert_token') || ''}` },
          signal: controller.signal,
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) throw new Error(result.message || 'Could not load accredited mentors and certifiers.');
        setAccreditedPeople(result.data || { mentors: [], certifiers: [] });
      } catch (loadError) {
        if (loadError.name !== 'AbortError') setPeopleError(loadError.message || 'Could not load accredited mentors and certifiers.');
      } finally {
        if (!controller.signal.aborted) setPeopleLoading(false);
      }
    };

    loadAccreditations();
    return () => controller.abort();
  }, [modalMode, selectedCourse]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    const headers = { Authorization: `Bearer ${localStorage.getItem('ld_cert_token') || ''}` };
    const loadCourses = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`${API_BASE_URL}/api/learning-courses`, { headers, signal: controller.signal });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) throw new Error(result.message || 'Could not load learning courses.');
        setCourses(result.data || []);

        if (canAdd || canEdit) {
          const optionsResponse = await fetch(`${API_BASE_URL}/api/learning-courses/options`, { headers, signal: controller.signal });
          const optionsResult = await optionsResponse.json().catch(() => ({}));
          if (!optionsResponse.ok || !optionsResult.success) throw new Error(optionsResult.message || 'Could not load departments.');
          setDepartments(optionsResult.data.departments || []);
        }
      } catch (loadError) {
        if (loadError.name !== 'AbortError') setError(loadError.message || 'Could not load learning courses.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    loadCourses();
    return () => controller.abort();
  }, [user, canAdd, canEdit]);

  const filteredCourses = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return courses;
    return courses.filter((course) => [course.title, course.learning_level, course.department_name]
      .some((value) => String(value || '').toLowerCase().includes(query)));
  }, [courses, search]);

  const accreditationRows = useMemo(() => {
    const peopleById = new Map();
    accreditedPeople.mentors.forEach((person) => {
      peopleById.set(person.user_id, { ...person, isMentor: true, isCertifier: false });
    });
    accreditedPeople.certifiers.forEach((person) => {
      const existing = peopleById.get(person.user_id);
      peopleById.set(person.user_id, {
        ...(existing || person),
        isMentor: Boolean(existing?.isMentor),
        isCertifier: true,
      });
    });
    return [...peopleById.values()].sort((first, second) => (
      `${first.last_name || ''} ${first.first_name || ''}`.localeCompare(`${second.last_name || ''} ${second.first_name || ''}`)
    ));
  }, [accreditedPeople]);

  const closeModal = () => {
    setSelectedCourse(null);
    setModalMode('');
    setEditForm(null);
  };

  const showView = (course) => {
    setSelectedCourse(course);
    setModalMode('view');
    setError('');
    setSuccess('');
  };

  const showEdit = (course) => {
    if (!canEdit) return;
    setSelectedCourse(course);
    setModalMode('edit');
    setEditForm({
      title: course.title || '',
      learning_level: course.learning_level || '',
      department_id: String(course.department_id || ''),
    });
    setError('');
    setSuccess('');
  };

  const handleEditChange = (event) => {
    setEditForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  const saveEdit = async (event) => {
    event.preventDefault();
    if (!canEdit || !selectedCourse || !editForm) return;

    setIsSaving(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/learning-courses/${selectedCourse.course_id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('ld_cert_token') || ''}`,
        },
        body: JSON.stringify({
          title: editForm.title.trim(),
          learning_level: editForm.learning_level.trim(),
          department_id: editForm.department_id,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || 'Could not update this course.');

      setCourses((current) => current.map((course) => (
        course.course_id === selectedCourse.course_id ? result.data : course
      )));
      closeModal();
      setSuccess(`${result.data.title} was updated.`);
    } catch (saveError) {
      setError(saveError.message || 'Could not update this course.');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteCourse = async (course) => {
    if (!canDelete || !window.confirm(`Delete "${course.title}" from the course catalog? Courses with linked learning events cannot be deleted.`)) return;

    setDeletingId(course.course_id);
    setError('');
    setSuccess('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/learning-courses/${course.course_id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('ld_cert_token') || ''}` },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || 'Could not delete this course.');

      setCourses((current) => current.filter((item) => item.course_id !== course.course_id));
      setSuccess(`${course.title} was deleted from the course catalog.`);
      if (selectedCourse?.course_id === course.course_id) closeModal();
    } catch (deleteError) {
      setError(deleteError.message || 'Could not delete this course.');
    } finally {
      setDeletingId(null);
    }
  };

  if (!user) {
    return (
      <div className="min-vh-100 bg-light d-flex flex-column">
        <BrandHeader />
        <main className="container py-5 flex-grow-1">
          <div className="alert alert-warning" role="alert">Sign in to view learning courses.</div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <BrandHeader />
      <main className="container py-4 flex-grow-1">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
          <div>
            <p className="text-success text-uppercase fw-bold small mb-1">Learning Management</p>
            <h1 className="h2 mb-0" style={{ fontFamily: "'DM Serif Display', serif", color: '#1a202c' }}>Learning Course List</h1>
          </div>
          <div className="d-flex gap-2">
            {canAdd && (
              <Link className="btn btn-success" to="/learning/courses/new">
                <i className="bi bi-plus-lg me-1" aria-hidden="true" /> Add New Learning Course
              </Link>
            )}
          </div>
        </div>

        {error && !modalMode && <div className="alert alert-danger" role="alert">{error}</div>}
        {success && <div className="alert alert-success" role="status">{success}</div>}

        <section className="card border-0 shadow-sm">
          <div className="card-body">
            <div className="mb-3">
              <label htmlFor="course-search" className="visually-hidden">Search courses</label>
              <input id="course-search" className="form-control" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by course title, level, or hosting department" />
            </div>

            {loading ? (
              <div className="text-center text-secondary py-5" role="status">
                <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" /> Loading courses...
              </div>
            ) : filteredCourses.length === 0 ? (
              <div className="text-center text-secondary py-5">{courses.length ? 'No learning courses match your search.' : 'No learning courses have been added yet.'}</div>
            ) : (
              <div className="table-responsive learning-course-list-scroll">
                <table className="table table-hover align-middle mb-0">
                  <caption className="visually-hidden">Learning course titles and hosting departments</caption>
                  <thead className="table-light">
                    <tr><th scope="col" className="text-nowrap text-center">ID No</th>
                      <th scope="col">Course Title</th>
                      <th scope="col" className="text-center">Learning Level</th>
                      <th scope="col">Hosting Department</th>
                      <th scope="col" className="text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...filteredCourses].sort((a, b) => Number(b.course_id) - Number(a.course_id)).map((course) => (
                      <tr key={course.course_id}><td className="text-nowrap text-center">{course.course_id}</td>
                        <td className="fw-semibold">{course.title}</td>
                        <td className="text-center">{course.learning_level || 'Not assigned'}</td>
                        <td>{course.department_name || 'Not assigned'}</td>
                        <td className="text-center text-nowrap">
                          <button className="btn btn-sm user-action-button me-1" type="button" onClick={() => showView(course)} aria-label={`View ${course.title}`} title={`View ${course.title}`}>
                            <i className="bi bi-card-text fs-6" aria-hidden="true" />
                          </button>
                          {canEdit && <button className="btn btn-sm user-action-button me-1" type="button" onClick={() => showEdit(course)} aria-label={`Edit ${course.title}`} title={`Edit ${course.title}`}>
                            <i className="bi bi-pencil-square fs-6" aria-hidden="true" />
                          </button>}
                          {canDelete && (
                            <>
                              <button className="btn btn-sm user-action-button" type="button" onClick={() => deleteCourse(course)} aria-label={`Delete ${course.title}`} title={`Delete ${course.title}`} disabled={deletingId === course.course_id}>
                                {deletingId === course.course_id ? <span className="spinner-border spinner-border-sm" aria-hidden="true" /> : <i className="bi bi-trash fs-6" aria-hidden="true" />}
                              </button>
                            </>
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

        {selectedCourse && modalMode && (
          <>
            <div className="modal fade show d-block" role="dialog" aria-modal="true" aria-labelledby="course-modal-title" tabIndex="-1" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSaving) closeModal(); }}>
              <div className={`modal-dialog modal-dialog-centered${modalMode === 'view' ? ' modal-lg' : ''}`}>
                <div className="modal-content border-0 shadow">
                  <div className="modal-header bg-light">
                    <h2 id="course-modal-title" className="modal-title h5 fw-bold">{modalMode === 'view' ? 'Course details' : `Edit ${selectedCourse.title}`}</h2>
                    <button className="btn-close" type="button" onClick={closeModal} aria-label="Close" disabled={isSaving} />
                  </div>

                  {modalMode === 'view' ? (
                    <div className="modal-body">
                      <dl className="row row-cols-1 row-cols-sm-2 g-2 mb-0 lh-sm">
                        <div className="col d-flex gap-1 align-items-baseline"><dt className="fw-semibold mb-0 flex-shrink-0">Course title:</dt><dd className="mb-0">{selectedCourse.title}</dd></div>
                        <div className="col d-flex gap-1 align-items-baseline"><dt className="fw-semibold mb-0 flex-shrink-0">Course ID:</dt><dd className="mb-0">{selectedCourse.course_id}</dd></div>
                        <div className="col d-flex gap-1 align-items-baseline"><dt className="fw-semibold mb-0 flex-shrink-0">Hosting department:</dt><dd className="mb-0">{selectedCourse.department_name || 'Not assigned'}</dd></div>
                        <div className="col d-flex gap-1 align-items-baseline"><dt className="fw-semibold mb-0 flex-shrink-0">Learning level:</dt><dd className="mb-0">{selectedCourse.learning_level || 'Not assigned'}</dd></div>
                      </dl>
                      <hr className="my-4" />
                      <h3 className="h6 fw-bold mb-3">Accredited people</h3>
                      {peopleLoading ? (
                        <div className="text-center text-secondary py-4" role="status">
                          <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" /> Loading accredited people...
                        </div>
                      ) : peopleError ? (
                        <div className="alert alert-danger mb-0" role="alert">{peopleError}</div>
                      ) : (
                        accreditationRows.length ? (
                          <div className="table-responsive">
                            <table className="table table-sm table-striped align-middle mb-0">
                              <caption className="visually-hidden">Mentor and certifier accreditation for {selectedCourse.title}</caption>
                              <thead className="table-light">
                                <tr><th scope="col" className="text-nowrap text-center">ID No</th>
                                  <th scope="col">Profile</th>
                                  <th scope="col">Name</th>
                                  <th scope="col">Institution</th>
                                  <th scope="col" className="text-center">Mentor</th>
                                  <th scope="col" className="text-center">Certifier</th>
                                </tr>
                              </thead>
                              <tbody>
                                {[...accreditationRows].sort((a, b) => Number(b.user_id) - Number(a.user_id)).map((person) => (
                                  <tr key={person.user_id}><td className="text-nowrap text-center">{person.user_id}</td>
                                    <td><CommunityProfileAvatar person={person} size="2.5rem" /></td>
                                    <td>{[person.first_name, person.middle_name, person.last_name, person.suffix].filter(Boolean).join(' ')}</td>
                                    <td>{person.institution_name || '—'}</td>
                                    <td className="text-center">{person.isMentor ? <i className="bi bi-check-lg" aria-label="Accredited mentor" /> : <span aria-hidden="true">-</span>}</td>
                                    <td className="text-center">{person.isCertifier ? <i className="bi bi-check-lg" aria-label="Accredited certifier" /> : <span aria-hidden="true">-</span>}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : <p className="small text-secondary mb-0">No mentors or certifiers are accredited for this course.</p>
                      )}
                    </div>
                  ) : (
                    <form onSubmit={saveEdit}>
                      <div className="modal-body">
                        {error && <div className="alert alert-danger" role="alert">{error}</div>}
                        <div className="mb-3">
                          <label htmlFor="edit-course-title" className="form-label">Course title <span className="text-danger">*</span></label>
                          <input id="edit-course-title" name="title" className="form-control" value={editForm.title} onChange={handleEditChange} maxLength={200} required disabled={isSaving} />
                        </div>
                        <div className="mb-3">
                          <label htmlFor="edit-course-level" className="form-label">Learning level <span className="text-danger">*</span></label>
                          <input id="edit-course-level" name="learning_level" className="form-control" value={editForm.learning_level} onChange={handleEditChange} maxLength={100} placeholder="e.g. Level 1" required disabled={isSaving} />
                        </div>
                        <div>
                          <label htmlFor="edit-course-department" className="form-label">Hosting department <span className="text-danger">*</span></label>
                          <select id="edit-course-department" name="department_id" className="form-select" value={editForm.department_id} onChange={handleEditChange} required disabled={isSaving || !departments.length}>
                            <option value="">Choose a department</option>
                            {departments.map((department) => <option key={department.department_id} value={department.department_id}>{department.name}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="modal-footer">
                        <button className="btn btn-outline-secondary" type="button" onClick={closeModal} disabled={isSaving}>Cancel</button>
                        <button className="btn btn-success" type="submit" disabled={isSaving || !departments.length}>{isSaving ? 'Saving...' : 'Save changes'}</button>
                      </div>
                    </form>
                  )}

                  {modalMode === 'view' && (
                    <div className="modal-footer">
                      <button className="btn btn-outline-secondary" type="button" onClick={closeModal}>Close</button>
                      {canEdit && <button className="btn btn-success" type="button" onClick={() => showEdit(selectedCourse)}>Edit course</button>}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="modal-backdrop fade show" onClick={() => { if (!isSaving) closeModal(); }} />
          </>
        )}

        <SiteFooter />
      </main>
    </div>
  );
}

export default LearningCourseList;
