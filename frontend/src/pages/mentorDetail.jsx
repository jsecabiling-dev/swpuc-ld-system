import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import BrandHeader from '../components/BrandHeader';
import SiteFooter from '../components/SiteFooter';
import CommunityProfileAvatar from '../components/CommunityProfileAvatar';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/+$/, '');
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('ld_cert_token') || ''}` });

function fullName(person) {
  const middleInitial = person.middle_name?.trim().charAt(0);
  return [person.first_name, middleInitial ? `${middleInitial.toUpperCase()}.` : '', person.last_name, person.suffix].filter(Boolean).join(' ');
}

function MentorDetail() {
  const { user } = useContext(AuthContext);
  const { userId } = useParams();
  const canEditCourses = Boolean(user?.canEditCourses);
  const [mentor, setMentor] = useState(null);
  const [courses, setCourses] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showAddCourses, setShowAddCourses] = useState(false);
  const [selectedCourseIds, setSelectedCourseIds] = useState([]);
  const [courseSearch, setCourseSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async (signal) => {
    setLoading(true);
    setError('');
    const headers = authHeaders();
    try {
      const [mentorResponse, assignedResponse, catalogResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/api/community-roles/mentor/${userId}`, { headers, signal }),
        fetch(`${API_BASE_URL}/api/community-roles/mentor/${userId}/courses`, { headers, signal }),
        fetch(`${API_BASE_URL}/api/learning-courses`, { headers, signal }),
      ]);
      const [mentorResult, assignedResult, catalogResult] = await Promise.all([
        mentorResponse.json().catch(() => ({})),
        assignedResponse.json().catch(() => ({})),
        catalogResponse.json().catch(() => ({})),
      ]);
      if (!mentorResponse.ok || !mentorResult.success) throw new Error(mentorResult.message || 'Could not load mentor details.');
      if (!assignedResponse.ok || !assignedResult.success) throw new Error(assignedResult.message || 'Could not load courses assigned to this mentor.');
      if (!catalogResponse.ok || !catalogResult.success) throw new Error(catalogResult.message || 'Could not load the learning course catalog.');
      setMentor(mentorResult.data);
      setCourses(assignedResult.data || []);
      setCatalog(catalogResult.data || []);
    } catch (loadError) {
      if (loadError.name !== 'AbortError') setError(loadError.message || 'Could not load mentor details.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    const controller = new AbortController();
    loadData(controller.signal);
    return () => controller.abort();
  }, [loadData]);

  const availableCourses = useMemo(() => {
    const assignedIds = new Set(courses.map((course) => Number(course.course_id)));
    const query = courseSearch.trim().toLowerCase();
    return catalog.filter((course) => !assignedIds.has(Number(course.course_id))
      && (!query || `${course.title} ${course.learning_level || ''} ${course.department_name || ''}`.toLowerCase().includes(query)));
  }, [catalog, courses, courseSearch]);

  const openAddCourses = () => {
    setError(''); setNotice(''); setCourseSearch(''); setSelectedCourseIds([]); setShowAddCourses(true);
  };

  const toggleCourse = (courseId) => {
    setSelectedCourseIds((current) => current.includes(courseId)
      ? current.filter((id) => id !== courseId)
      : [...current, courseId]);
  };

  const saveCourses = async (event) => {
    event.preventDefault();
    if (!selectedCourseIds.length) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/community-roles/mentor/${userId}/courses`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ course_ids: selectedCourseIds }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || 'Could not assign courses to this mentor.');
      setShowAddCourses(false);
      setNotice(result.message);
      await loadData();
    } catch (saveError) { setError(saveError.message || 'Could not assign courses to this mentor.'); }
    finally { setSaving(false); }
  };

  const removeCourse = async (course) => {
    if (!window.confirm(`Remove “${course.title}” from ${fullName(mentor)}’s teaching assignments?`)) return;
    setError(''); setNotice('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/community-roles/mentor/${userId}/courses/${course.course_id}`, { method: 'DELETE', headers: authHeaders() });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || 'Could not remove this course assignment.');
      setCourses((current) => current.filter((item) => item.course_id !== course.course_id));
      setNotice(result.message);
    } catch (removeError) { setError(removeError.message || 'Could not remove this course assignment.'); }
  };

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <BrandHeader />
      <main className="container py-4 flex-grow-1">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
          <div>
            <p className="text-success text-uppercase fw-bold small mb-1">Community · Mentor</p>
            <h1 className="h2 mb-0" style={{ fontFamily: "'DM Serif Display', serif", color: '#1a202c' }}>{mentor ? fullName(mentor) : 'Mentor Details'}</h1>
          </div>
          <Link className="btn btn-outline-secondary" to="/community/mentors"><i className="bi bi-arrow-left me-2" aria-hidden="true" />Back to Mentors</Link>
        </div>
        {error && !showAddCourses && <div className="alert alert-danger" role="alert">{error}</div>}
        {notice && <div className="alert alert-success" role="status">{notice}</div>}
        {loading ? <div className="text-center text-secondary py-5" role="status"><span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />Loading mentor details...</div>
          : mentor && <>
            <section className="card border-0 shadow-sm mb-4">
              <div className="card-body p-4">
                <div className="d-flex flex-column flex-md-row align-items-md-start gap-4">
                  <CommunityProfileAvatar key={`${mentor.user_id}-${mentor.profilepict || ''}`} person={mentor} size="6rem" />
                  <div className="flex-grow-1">
                    <h2 className="h5 fw-bold mb-3">Mentor Profile</h2>
                    <dl className="row mb-0">
                      <dt className="col-sm-3">Email</dt><dd className="col-sm-9">{mentor.email || '—'}</dd>
                      <dt className="col-sm-3">Phone</dt><dd className="col-sm-9">{mentor.phone_number || '—'}</dd>
                      <dt className="col-sm-3">Affiliation</dt><dd className="col-sm-9">{mentor.unit_name || '—'}</dd>
                      <dt className="col-sm-3">Account status</dt><dd className="col-sm-9"><span className={`badge ${mentor.is_active ? 'text-bg-success' : 'text-bg-secondary'}`}>{mentor.is_active ? 'Active' : 'Inactive'}</span></dd>
                    </dl>
                  </div>
                </div>
              </div>
            </section>
            <section className="card border-0 shadow-sm">
              <div className="card-body p-4">
                <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
                  <div><h2 className="h5 fw-bold mb-1">Learning Courses</h2><p className="text-secondary mb-0">Courses this mentor is assigned to teach.</p></div>
                  {canEditCourses && <button className="btn btn-success" type="button" onClick={openAddCourses}><i className="bi bi-plus-lg me-2" aria-hidden="true" />Add Courses</button>}
                </div>
                {courses.length ? <div className="table-responsive"><table className="table table-hover align-middle mb-0"><caption className="visually-hidden">Courses assigned to {fullName(mentor)}</caption><thead className="table-light"><tr><th>Course</th><th>Level</th><th>Department</th>{canEditCourses && <th className="text-center">Actions</th>}</tr></thead><tbody>
                  {courses.map((course) => <tr key={course.course_id}><td className="fw-semibold">{course.title}</td><td>{course.learning_level || '—'}</td><td>{course.department_name || '—'}</td>{canEditCourses && <td className="text-center"><button className="btn btn-sm btn-outline-secondary" type="button" onClick={() => removeCourse(course)} aria-label={`Remove ${course.title} assignment`}><i className="bi bi-trash text-secondary" aria-hidden="true" /></button></td>}</tr>)}
                </tbody></table></div> : <p className="text-secondary text-center py-4 mb-0">No courses are assigned to this mentor yet.</p>}
              </div>
            </section>
          </>}
      </main>
      {showAddCourses && <>
        <div className="modal fade show d-block" role="dialog" aria-modal="true" aria-labelledby="mentor-courses-dialog-title" tabIndex="-1" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setShowAddCourses(false); }}>
          <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable">
            <form className="modal-content border-0 shadow" onSubmit={saveCourses}>
              <div className="modal-header"><h2 id="mentor-courses-dialog-title" className="modal-title h5">Assign Learning Courses</h2><button className="btn-close" type="button" onClick={() => setShowAddCourses(false)} aria-label="Close" disabled={saving} /></div>
              <div className="modal-body">
                {error && <div className="alert alert-danger" role="alert">{error}</div>}
                <label className="form-label" htmlFor="mentor-course-search">Search courses</label>
                <input id="mentor-course-search" className="form-control mb-3" value={courseSearch} onChange={(event) => setCourseSearch(event.target.value)} placeholder="Search by course, level, or department" />
                {availableCourses.length ? <div className="list-group">
                  {availableCourses.map((course) => <label key={course.course_id} className="list-group-item d-flex align-items-start gap-2"><input className="form-check-input mt-1" type="checkbox" checked={selectedCourseIds.includes(course.course_id)} onChange={() => toggleCourse(course.course_id)} disabled={saving} /><span><span className="d-block fw-semibold">{course.title}</span><small className="text-muted">{[course.learning_level, course.department_name].filter(Boolean).join(' · ')}</small></span></label>)}
                </div> : <p className="text-secondary text-center py-4">{catalog.length === courses.length ? 'All courses are already assigned to this mentor.' : 'No courses match your search.'}</p>}
              </div>
              <div className="modal-footer"><span className="me-auto text-secondary small">{selectedCourseIds.length} selected</span><button className="btn btn-outline-secondary" type="button" onClick={() => setShowAddCourses(false)} disabled={saving}>Cancel</button><button className="btn btn-success" type="submit" disabled={saving || !selectedCourseIds.length}>{saving ? 'Saving...' : 'Assign selected'}</button></div>
            </form>
          </div>
        </div>
        <div className="modal-backdrop fade show" onClick={() => !saving && setShowAddCourses(false)} />
      </>}
      <SiteFooter />
    </div>
  );
}

export default MentorDetail;
