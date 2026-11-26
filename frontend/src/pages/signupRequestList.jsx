import React, { useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import SortableTableHeader, { useTableSort } from '../components/SortableTableHeader';
import BrandHeader from '../components/BrandHeader';
import SiteFooter from '../components/SiteFooter';
import './userList.css';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/+$/, '');
const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('ld_cert_token') || ''}` });

async function readApiResponse(response, fallbackMessage) {
  const result = await response.json().catch(() => null);
  if (!result || typeof result !== 'object') {
    throw new Error(`${fallbackMessage} The API returned an unexpected response (HTTP ${response.status}).`);
  }
  if (!response.ok || !result.success) throw new Error(result.message || fallbackMessage);
  return result;
}

function SignupRequestList() {
  const sort = useTableSort();
  const { user } = useContext(AuthContext);
  const allowed = Boolean(user?.canAddUsers);
  const [requests, setRequests] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [savingId, setSavingId] = useState(null);

  useEffect(() => {
    if (!allowed) { setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetch(`${API_BASE_URL}/api/users/signup-requests?page=${page}`, { headers: headers(), signal: controller.signal })
      .then(async (response) => {
        const result = await readApiResponse(response, 'Could not load requests.');
        setRequests(result.data);
        setTotal(result.total);
      })
      .catch((loadError) => { if (loadError.name !== 'AbortError') setError(loadError.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, allowed]);

  const updateStatus = async (id, status) => {
    setSavingId(id);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/users/signup-requests/${id}`, {
        method: 'PATCH', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
      });
      await readApiResponse(response, 'Could not update request.');
      setRequests((current) => current.map((request) => request.request_id === id ? { ...request, status } : request));
    } catch (updateError) { setError(updateError.message); }
    finally { setSavingId(null); }
  };

  const createUser = async (request) => {
    if (savingId !== null) return;
    setSavingId(request.request_id);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/users/signup-requests/${request.request_id}/create-user`, {
        method: 'POST', headers: headers(),
      });
      const result = await readApiResponse(response, 'Could not create this account.');
      setRequests((current) => current.map((item) => item.request_id === request.request_id ? { ...item, status: 'created', created_user_id: result.user_id } : item));
      setNotice(result.message);
    } catch (createError) { setError(createError.message); }
    finally { setSavingId(null); }
  };

  return (
    <div className="users-page signup-review-page min-vh-100 bg-light d-flex flex-column">
      <BrandHeader />
      <main className="container py-4 flex-grow-1">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
          <div><p className="users-eyebrow text-success text-uppercase fw-bold small mb-1">User Management</p><h1 className="users-title h2 mb-0">Signup Requests</h1></div>
          <Link className="btn btn-outline-secondary" to="/users">Back to Users</Link>
        </div>
        {!allowed ? <div className="alert alert-warning">You need permission to create users to review signup requests.</div> : (
          <>
            {error && <div className="alert alert-danger" role="alert">{error}</div>}
            {notice && <div className="alert alert-success" role="status">{notice}</div>}
            <section className="card border-0 shadow-sm"><div className="card-body">
              <p className="text-secondary small">Create user makes the account immediately and emails temporary credentials. Missing phone and institution details can be completed later in Users. New accounts have no management permissions.</p>
              {loading ? <div role="status">Loading requests…</div> : requests.length === 0 ? <p>No signup requests yet.</p> : (
                <div className="table-responsive user-list-scroll"><table className="table table-hover align-middle mb-0">
                  <caption className="visually-hidden">Submitted signup requests</caption>
                  <thead className="table-light">
                    <tr>
                      <SortableTableHeader sort={sort} column="name">Name</SortableTableHeader>
                      <th scope="col" className="d-none d-md-table-cell">Contact</th>
                      <th scope="col" className="d-none d-md-table-cell">Message</th>
                      <th scope="col" className="d-none d-md-table-cell">Submitted</th>
                      <th scope="col"><span className="d-none d-md-inline">Review </span>Status</th>
                      <th scope="col"><span className="d-md-none">Action</span><span className="d-none d-md-inline">Account</span></th>
                    </tr>
                  </thead>
                  <tbody>{sort.order(requests, { name: (row) => [row.first_name, row.last_name].filter(Boolean).join(' ') }).map((request) => <tr key={request.request_id}>
                    <td className="text-break">{request.first_name} {request.last_name}</td>
                    <td className="d-none d-md-table-cell"><div>{request.email}</div><small>{request.phone_number || '—'}</small></td>
                    <td className="d-none d-md-table-cell" style={{ minWidth: '150px', maxWidth: '300px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{request.message || '—'}</td>
                    <td className="d-none d-md-table-cell">{new Date(request.created_at).toLocaleString()}</td>
                    <td><label className="visually-hidden" htmlFor={`request-status-${request.request_id}`}>Review status for {request.first_name} {request.last_name}</label><select id={`request-status-${request.request_id}`} className="form-select form-select-sm signup-review-status" value={request.status} disabled={savingId !== null || request.status === 'created'} onChange={(event) => updateStatus(request.request_id, event.target.value)}><option value="pending">Pending</option><option value="reviewed">Reviewed</option><option value="dismissed">Dismissed</option>{request.status === 'created' && <option value="created">Account created</option>}</select></td>
                    <td>
                      {request.status === 'created' ? <span className="badge text-bg-success">Account created</span> : (
                        <button className="btn btn-sm btn-outline-success table-action-button" type="button" disabled={savingId !== null || request.status === 'dismissed'} onClick={() => createUser(request)} aria-label={savingId === request.request_id ? 'Please wait' : `Create user for ${request.first_name} ${request.last_name}`} title="Create user">
                          {savingId === request.request_id ? <span className="spinner-border spinner-border-sm" aria-hidden="true" /> : <i className="bi bi-person-plus" aria-hidden="true" />}
                        </button>
                      )}
                    </td>
                  </tr>)}</tbody>
                </table></div>
              )}
              <div className="d-flex justify-content-between align-items-center mt-3 gap-2">
                <button className="btn btn-sm btn-outline-secondary" disabled={loading || page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button>
                <span className="small">Page {page} of {Math.max(1, Math.ceil(total / 50))}</span>
                <button className="btn btn-sm btn-outline-secondary" disabled={loading || page * 50 >= total} onClick={() => setPage((current) => current + 1)}>Next</button>
              </div>
            </div></section>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

export default SignupRequestList;
