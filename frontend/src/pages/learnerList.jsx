import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import SortableTableHeader, { useTableSort } from '../components/SortableTableHeader';
import BrandHeader from '../components/BrandHeader';
import SiteFooter from '../components/SiteFooter';
import './userList.css';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/+$/, '');
const PROFILE_IMAGE_BASE_URL = (
  import.meta.env.VITE_PROFILE_IMAGE_BASE_URL || `${API_BASE_URL}/api/profile-pictures`
).replace(/\/+$/, '');

function getProfileImageUrl(value) {
  const image = value?.trim();
  if (!image) return '';
  if (/^https?:\/\//i.test(image)) return image;
  const filename = image.split(/[\\/]/).pop();
  return filename ? `${PROFILE_IMAGE_BASE_URL}/${encodeURIComponent(filename)}` : '';
}

function fullName(person) {
  const middleInitial = person.middle_name?.trim().charAt(0);
  return [person.first_name, middleInitial ? `${middleInitial.toUpperCase()}.` : '', person.last_name, person.suffix]
    .filter(Boolean)
    .join(' ');
}

function LearnerAvatar({ learner }) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = getProfileImageUrl(learner.profilepict);
  const style = { width: '2.75rem', height: '2.75rem', flex: '0 0 2.75rem', objectFit: 'cover' };

  if (!imageUrl || imageFailed) {
    return (
      <span className="user-profile-avatar rounded-circle border bg-secondary-subtle text-secondary d-inline-flex justify-content-center align-items-center" role="img" aria-label={`${fullName(learner)} profile picture unavailable`} style={style}>
        <i className="bi bi-card-list" aria-hidden="true" />
      </span>
    );
  }

  return <img src={imageUrl} alt={`${fullName(learner)} profile`} className="user-profile-avatar rounded-circle border" style={style} onError={() => setImageFailed(true)} />;
}

function LearnerList() {
  const sort = useTableSort();
  const { user } = useContext(AuthContext);
  const [learners, setLearners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    const loadLearners = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`${API_BASE_URL}/api/learning-participations`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('ld_cert_token') || ''}` },
          signal: controller.signal,
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) {
          throw new Error(result.message || 'Could not load the learner list.');
        }

        const learnerByUserId = new Map();
        (result.data || []).forEach((record) => {
          if (!learnerByUserId.has(record.user_id)) {
            learnerByUserId.set(record.user_id, { learner: record, certifiedEventKeys: new Set() });
          }
          if (Number(record.certified) !== 1) return;
          const learnerEntry = learnerByUserId.get(record.user_id);
          const eventKey = record.event_id
            ? `event:${record.event_id}`
            : `participation:${record.participation_id}`;
          learnerEntry.certifiedEventKeys.add(eventKey);
        });
        setLearners([...learnerByUserId.values()]
          .map(({ learner, certifiedEventKeys }) => ({ ...learner, certified_event_count: certifiedEventKeys.size }))
          .sort((a, b) => fullName(a).localeCompare(fullName(b))));
      } catch (loadError) {
        if (loadError.name !== 'AbortError') {
          setError(loadError.message || 'Could not load the learner list.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    loadLearners();
    return () => controller.abort();
  }, [user]);

  const filteredLearners = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return learners;
    return learners.filter((learner) => (
      `${fullName(learner)} ${learner.unit_name || ''}`.toLowerCase().includes(query)
    ));
  }, [learners, search]);

  return (
    <div className="users-page learner-list-page min-vh-100 bg-light d-flex flex-column">
      <BrandHeader />
      <main className="container py-4 flex-grow-1">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
          <div>
            <p className="users-eyebrow text-success text-uppercase fw-bold small mb-1">Community</p>
            <div className="learner-list-heading d-flex flex-wrap align-items-baseline gap-4">
              <h1 className="users-title h2 mb-0" style={{ fontFamily: "'DM Serif Display', serif", color: '#1a202c' }}>
                Learner List
              </h1>
              <p className="text-secondary mb-0">A person appears here when they are registered as a learner in at least one learning event.</p>
            </div>
          </div>
        </div>

        {error && <div className="alert alert-danger" role="alert">{error}</div>}

        <section className="card border-0 shadow-sm">
          <div className="card-body">
            <div className="mb-3">
              <label htmlFor="learner-search" className="visually-hidden">Search learners</label>
              <input
                id="learner-search"
                className="form-control"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name or affiliation"
              />
            </div>

            {loading ? (
              <div className="text-center text-secondary py-5" role="status">
                <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" /> Loading learners...
              </div>
            ) : filteredLearners.length === 0 ? (
              <div className="text-center text-secondary py-5">
                {learners.length ? 'No learners match your search.' : 'No learners have been registered yet.'}
              </div>
            ) : (
              <div className="table-responsive user-list-scroll">
                <table className="table table-hover align-middle mb-0">
                  <caption className="visually-hidden">Learner names and affiliations</caption>
                  <thead className="table-light">
                    <tr><th scope="col" className="text-nowrap text-center">ID No</th>
                      <SortableTableHeader sort={sort} column="name">Name</SortableTableHeader>
                      <th scope="col">Contact Information</th>
                      <SortableTableHeader sort={sort} column="unit" className="d-none d-md-table-cell">Affiliation</SortableTableHeader>
                      <th scope="col" className="text-center"><span className="d-md-none">View</span><span className="d-none d-md-inline">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sort.order(filteredLearners, { name: fullName, unit: (row) => row.unit_name }, (a, b) => Number(b.user_id) - Number(a.user_id)).map((learner) => (
                      <tr key={learner.user_id}><td className="text-nowrap text-center">{learner.user_id}</td>
                        <td>
                          <div className="d-flex align-items-center gap-2">
                            <LearnerAvatar learner={learner} />
                            <span className="fw-semibold">{fullName(learner)}</span>
                          </div>
                        </td>
                        <td className="text-break">
                          <div>{learner.email || '—'}</div>
                          <div>{learner.phone_number || '—'}</div>
                        </td>
                        <td className="d-none d-md-table-cell">{learner.unit_name || '—'}</td>
                        <td className="text-center">
                          <Link
                            className="btn btn-sm user-action-button position-relative"
                            to={`/community/learners/${learner.user_id}`}
                            aria-label={`View learning journey for ${fullName(learner)}, certified events: ${learner.certified_event_count}`}
                            title={`Certified events: ${learner.certified_event_count}`}
                          >
                            <i className="bi bi-card-list fs-6" aria-hidden="true" />
                            <span className="position-absolute top-0 badge rounded-pill text-bg-success view-count-badge" aria-hidden="true">{learner.certified_event_count}</span>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

export default LearnerList;
