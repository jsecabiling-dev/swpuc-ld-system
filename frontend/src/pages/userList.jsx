import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import BrandHeader from '../components/BrandHeader';
import SiteFooter from '../components/SiteFooter';
import { processProfilePicture } from '../utils/processProfilePicture';
import ProfilePhotoQr from '../components/ProfilePhotoQr';
import './userList.css';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/+$/, '');
const PROFILE_IMAGE_BASE_URL = (
  import.meta.env.VITE_PROFILE_IMAGE_BASE_URL || `${API_BASE_URL}/api/profile-pictures`
).replace(/\/+$/, '');

const PERMISSION_GROUPS = [
  { prefix: 'users.', title: 'User accounts' },
  { prefix: 'courses.', title: 'Learning courses and departments' },
  { prefix: 'events.', title: 'Learning events and institutions' },
  { prefix: 'progress.', title: 'Learner enrollment and records' },
];

function getImageUrl(value) {
  const image = value?.trim();
  if (!image) return '';
  if (/^https?:\/\//i.test(image)) return image;
  const filename = image.split(/[\\/]/).pop();
  return filename ? `${PROFILE_IMAGE_BASE_URL}/${encodeURIComponent(filename)}` : '';
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('Could not read the selected profile picture.'));
    reader.readAsDataURL(file);
  });
}

function fullName(user) {
  const middleInitial = user.middle_name?.trim().charAt(0);
  return [user.first_name, middleInitial ? `${middleInitial.toUpperCase()}.` : '', user.last_name, user.suffix]
    .filter(Boolean)
    .join(' ');
}

function ProfileAvatar({ user, size = '2.75rem' }) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = getImageUrl(user.profilepict);
  const dimension = typeof size === 'number' ? `${size}rem` : size;
  const style = { width: dimension, height: dimension, flex: `0 0 ${dimension}`, objectFit: 'cover' };

  if (!imageUrl || imageFailed) {
    return (
      <span className="user-profile-avatar rounded-circle border bg-secondary-subtle text-secondary d-inline-flex justify-content-center align-items-center" role="img" aria-label={`${fullName(user)} profile picture unavailable`} style={style}>
        <i className={`bi bi-person-fill ${dimension === '5rem' ? 'fs-3' : ''}`} aria-hidden="true" />
      </span>
    );
  }

  return <img src={imageUrl} alt={`${fullName(user)} profile`} className="user-profile-avatar rounded-circle border" style={style} onError={() => setImageFailed(true)} />;
}

function displayLabel(value = '') {
  return typeof value === 'string' && value ? value.replaceAll('_', ' ') : 'Not assigned';
}

function UserList() {
  const { user } = useContext(AuthContext);
  const [users, setUsers] = useState([]);
  const [units, setUnits] = useState([]);
  const [permissionOptions, setPermissionOptions] = useState([]);
  const [editPermissions, setEditPermissions] = useState([]);
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [reloadKey, setReloadKey] = useState(0);
  const [pendingSignupCount, setPendingSignupCount] = useState(null);
  const [signupCountError, setSignupCountError] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [modalMode, setModalMode] = useState('');
  const [editForm, setEditForm] = useState(null);
  const [editProfilePicture, setEditProfilePicture] = useState(null);
  const [editProfilePictureError, setEditProfilePictureError] = useState('');
  const [editProfilePicturePreview, setEditProfilePicturePreview] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [reactivatingId, setReactivatingId] = useState(null);
  const [resettingId, setResettingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const editProfilePictureInput = useRef(null);
  const canAddUsers = Boolean(user?.canAddUsers);
  const canEditUsers = Boolean(user?.canEditUsers);
  const canManagePermissions = canEditUsers && selectedUser?.user_id !== user?.userId;
  const canDeleteUsers = Boolean(user?.canDeleteUsers);

  useEffect(() => {
    if (!canAddUsers) return undefined;
    const controller = new AbortController();
    let fetching = false;
    const refreshCount = async () => {
      if (fetching || document.visibilityState === 'hidden') return;
      fetching = true;
      try {
        const response = await fetch(`${API_BASE_URL}/api/users/signup-requests/count`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('ld_cert_token') || ''}` },
          signal: controller.signal,
          cache: 'no-store',
        });
        const result = await response.json();
        if (!response.ok || !result.success || !Number.isSafeInteger(result.pending_count) || result.pending_count < 0) throw new Error('Count unavailable');
        if (!controller.signal.aborted) {
          setPendingSignupCount(result.pending_count);
          setSignupCountError(false);
        }
      } catch {
        if (!controller.signal.aborted) setSignupCountError(true);
      } finally { fetching = false; }
    };
    refreshCount();
    const interval = window.setInterval(refreshCount, 30000);
    window.addEventListener('focus', refreshCount);
    document.addEventListener('visibilitychange', refreshCount);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshCount);
      document.removeEventListener('visibilitychange', refreshCount);
    };
  }, [canAddUsers, reloadKey]);

  useEffect(() => {
    if (!editProfilePicture) {
      setEditProfilePicturePreview('');
      return undefined;
    }

    const previewUrl = URL.createObjectURL(editProfilePicture);
    setEditProfilePicturePreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [editProfilePicture]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    const loadData = async () => {
      setLoading(true);
      setError('');
      const headers = { Authorization: `Bearer ${localStorage.getItem('ld_cert_token') || ''}` };

      try {
        const usersResponse = await fetch(`${API_BASE_URL}/api/users`, { headers, signal: controller.signal });
        const usersResult = await usersResponse.json().catch(() => ({}));

        if (!usersResponse.ok || !usersResult.success) {
          throw new Error(usersResult.message || 'Could not load users.');
        }
        setUsers(usersResult.data || []);

        const optionsResponse = await fetch(`${API_BASE_URL}/api/users/options`, { headers, signal: controller.signal });
        const optionsResult = await optionsResponse.json().catch(() => ({}));
        if (!optionsResponse.ok || !optionsResult.success) {
          throw new Error(optionsResult.message || 'Could not load institution options.');
        }
        setUnits(optionsResult.data.units || []);
        setPermissionOptions(optionsResult.data.permissions || []);
      } catch (loadError) {
        if (loadError.name !== 'AbortError') {
          setError(loadError.message || 'Could not load the user list.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    loadData();
    return () => controller.abort();
  }, [user, reloadKey]);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users.filter((item) => {
      const isActive = Boolean(item.is_active);
      if (statusFilter === 'active' && !isActive) return false;
      if (statusFilter === 'inactive' && isActive) return false;
      if (!query) return true;

      return [
        fullName(item),
        item.email,
        item.phone_number,
        item.unit_name,
      ].some((value) => String(value || '').toLowerCase().includes(query));
    });
  }, [users, search, statusFilter]);

  const closeModal = () => {
    setSelectedUser(null);
    setModalMode('');
    setEditForm(null);
    setEditProfilePicture(null);
    setEditProfilePictureError('');
  };

  const showView = (item) => {
    setSelectedUser(item);
    setModalMode('view');
    setError('');
    setSuccess('');
  };

  const showEdit = async (item) => {
    setSelectedUser(item);
    setModalMode('edit');
    setEditForm({
      first_name: item.first_name || '',
      middle_name: item.middle_name || '',
      last_name: item.last_name || '',
      suffix: item.suffix || '',
      email: item.email || '',
      phone_number: item.phone_number || '',
      unit_id: String(item.unit_id),
    });
    setEditProfilePicture(null);
    setEditProfilePictureError('');
    setError('');
    setSuccess('');
    setEditPermissions([]);
    if (!canEditUsers || item.user_id === user?.userId) return;
    setPermissionsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/users/${item.user_id}/permissions`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('ld_cert_token') || ''}` },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || 'Could not load access permissions.');
      setEditPermissions(result.data || []);
    } catch (loadError) { setError(loadError.message || 'Could not load access permissions.'); }
    finally { setPermissionsLoading(false); }
  };

  const handleEditProfilePictureChange = async (event) => {
    const file = event.target.files?.[0] || null;
    setEditProfilePictureError('');
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) {
      setEditProfilePictureError('Choose a JPEG, PNG, GIF, or WebP image.');
      event.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setEditProfilePictureError('The profile picture must be 5 MB or smaller.');
      event.target.value = '';
      return;
    }

    try {
      setEditProfilePicture(await processProfilePicture(file));
      event.target.value = '';
    } catch (processError) {
      setEditProfilePicture(null);
      setEditProfilePictureError(processError.message || 'Could not resize the selected profile picture.');
      event.target.value = '';
    }
  };

  const handleEditChange = (event) => {
    const { name, value } = event.target;
    setEditForm((current) => ({ ...current, [name]: value }));
  };

  const receivePhonePhoto = React.useCallback((photo) => {
    setEditProfilePicture(photo);
    setEditProfilePictureError('');
  }, []);

  const saveEdit = async (event) => {
    event.preventDefault();
    if (!selectedUser || !editForm || editProfilePictureError || permissionsLoading) return;

    setIsSaving(true);
    setError('');
    try {
      const profilePictureData = editProfilePicture
        ? { mime_type: editProfilePicture.type, data: await fileToBase64(editProfilePicture) }
        : null;
      const response = await fetch(`${API_BASE_URL}/api/users/${selectedUser.user_id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('ld_cert_token') || ''}`,
        },
        body: JSON.stringify({
          ...editForm,
          first_name: editForm.first_name.trim(),
          middle_name: editForm.middle_name.trim(),
          last_name: editForm.last_name.trim(),
          suffix: editForm.suffix.trim(),
          email: editForm.email.trim(),
          phone_number: editForm.phone_number.trim(),
          profile_picture: profilePictureData,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Could not update this user.');
      }

      if (canManagePermissions) {
        const permissionsResponse = await fetch(`${API_BASE_URL}/api/users/${selectedUser.user_id}/permissions`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('ld_cert_token') || ''}` },
          body: JSON.stringify({ permissions: editPermissions }),
        });
        const permissionsResult = await permissionsResponse.json().catch(() => ({}));
        if (!permissionsResponse.ok || !permissionsResult.success) {
          throw new Error(permissionsResult.message || 'User details saved, but access permissions could not be updated.');
        }
      }

      setUsers((current) => current.map((item) => (
        item.user_id === selectedUser.user_id ? result.data : item
      )));
      setReloadKey((key) => key + 1);
      setSuccess(`${fullName(result.data)} was updated.`);
      closeModal();
    } catch (saveError) {
      setError(saveError.message || 'Could not update this user.');
    } finally {
      setIsSaving(false);
    }
  };

  const reactivateUser = async (targetUser = selectedUser) => {
    if (!canEditUsers) {
      setError('Your account is not authorized to reactivate user accounts.');
      return;
    }
    if (!targetUser || targetUser.is_active) return;

    setReactivatingId(targetUser.user_id);
    setError('');
    setSuccess('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/users/${targetUser.user_id}/reactivate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('ld_cert_token') || ''}` },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        const fallbackMessage = response.status === 404
          ? 'The reactivation endpoint was not found. Restart the backend server so it loads the new route.'
          : `Could not reactivate this user (HTTP ${response.status}). Check the backend logs.`;
        throw new Error(result.message || fallbackMessage);
      }

      setUsers((current) => current.map((item) => (
        item.user_id === targetUser.user_id ? result.data : item
      )));
      if (selectedUser?.user_id === targetUser.user_id) setSelectedUser(result.data);
      setReloadKey((key) => key + 1);
      setSuccess(`${fullName(result.data)} was reactivated.`);
    } catch (reactivateError) {
      setError(reactivateError.message || 'Could not reactivate this user.');
    } finally {
      setReactivatingId(null);
    }
  };

  const deleteUser = async (item) => {
    if (item.user_id === user.userId) {
      setError('You cannot deactivate your own account.');
      return;
    }
    if (!window.confirm(`Delete ${fullName(item)}? Their account will be deactivated and they will no longer be able to sign in.`)) {
      return;
    }

    setDeletingId(item.user_id);
    setError('');
    setSuccess('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/users/${item.user_id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('ld_cert_token') || ''}` },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Could not delete this user.');
      }

      setUsers((current) => current.map((userItem) => (
        userItem.user_id === item.user_id ? { ...userItem, is_active: 0 } : userItem
      )));
      setSuccess(`${fullName(item)} was deactivated.`);
    } catch (deleteError) {
      setError(deleteError.message || 'Could not delete this user.');
    } finally {
      setDeletingId(null);
    }
  };

  const resetUserPassword = async (item) => {
    if (item.user_id === user.userId) {
      setError('You cannot reset your own password from this page.');
      return;
    }
    if (!item.email) {
      setError('Add an email address to this user before resetting their password.');
      return;
    }
    if (!window.confirm(`Email a new temporary password to ${item.email} for ${fullName(item)}? They must change it at their next sign-in.`)) {
      return;
    }

    setResettingId(item.user_id);
    setError('');
    setSuccess('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/users/${item.user_id}/reset-password`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('ld_cert_token') || ''}` },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Could not reset this user password.');
      }

      setSuccess(`Temporary password for ${fullName(item)} emailed to ${result.credential_email}. Ask the user to check their inbox and spam folder.`);
    } catch (resetError) {
      setError(resetError.message || 'Could not reset this user password.');
    } finally {
      setResettingId(null);
    }
  };

  if (!user) {
    return (
      <div className="users-page user-accounts-page min-vh-100 bg-light d-flex flex-column">
        <BrandHeader />
        <main className="container py-5 flex-grow-1">
          <div className="alert alert-warning" role="alert">Sign in to view user accounts.</div>
        </main>
      </div>
    );
  }

  return (
    <div className="users-page user-accounts-page min-vh-100 bg-light d-flex flex-column">
    <BrandHeader />
    <main className="container py-4 flex-grow-1">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
        <div>
          <p className="users-eyebrow text-success text-uppercase fw-bold small mb-1">User Management</p>
          <h1 className="users-title h2 mb-0" style={{ fontFamily: "'DM Serif Display', serif", color: '#1a202c' }}>User List</h1>
        </div>
        <div className="d-flex gap-2">
          {canAddUsers && <Link className="btn btn-primary" to="/users/signup-requests"><i className="bi bi-person-plus me-1" aria-hidden="true" /> Signup Request {!signupCountError && pendingSignupCount > 0 && <span className="badge rounded-pill text-bg-danger ms-1" aria-label={`${pendingSignupCount} pending or reviewed signup requests`} title="Pending and reviewed signup requests">{pendingSignupCount}</span>}</Link>}
        </div>
      </div>

      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {success && <div className="alert alert-success" role="status">{success}</div>}

      <section className="card border-0 shadow-sm">
        <div className="card-body">
          <div className="row g-3 align-items-end mb-3">
            <div className="col-md-8">
              <label htmlFor="user-search" className="visually-hidden">Search users</label>
              <input
                id="user-search"
                className="form-control"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name, email, phone, or institution"
              />
            </div>
            <div className="users-status-filter col-md-4">
              <label htmlFor="user-status-filter" className="visually-hidden">Account status</label>
              <select id="user-status-filter" className="form-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All accounts</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="text-center text-secondary py-5" role="status">
              <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" /> Loading users...
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center text-secondary py-5">No users match your search.</div>
          ) : (
            <div className="table-responsive user-list-scroll">
              <table className="table table-hover align-middle mb-0">
                <caption className="visually-hidden">Users with account status and available actions</caption>
                <thead className="table-light">
                  <tr><th scope="col" className="text-nowrap text-center">ID No</th>
                    <th scope="col">Name</th>
                    <th scope="col">Contact</th>
                    <th scope="col">Institution</th>
                    <th scope="col">Status</th>
                    <th scope="col" className="text-center"><span className="d-md-none">View</span><span className="d-none d-md-inline">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {[...filteredUsers].sort((a, b) => Number(b.user_id) - Number(a.user_id)).map((item) => (
                    <tr key={item.user_id}><td className="text-nowrap text-center">{item.user_id}</td>
                      <td>
                        <div className="d-flex align-items-center gap-2">
                          <ProfileAvatar key={`${item.user_id}-${item.profilepict || 'no-picture'}`} user={item} />
                          <div>
                            <div className="fw-semibold">{fullName(item)}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div>{item.email || '—'}</div>
                        <small className="text-muted">{item.phone_number}</small>
                      </td>
                      <td>{item.unit_name}</td>
                      <td>
                        <span className={`badge fw-normal ${item.is_active ? 'text-bg-secondary' : 'text-bg-light text-secondary border border-secondary-subtle'}`}>
                          {item.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="text-center text-nowrap">
                        <button className="users-view-button btn btn-sm user-action-button me-1" type="button" onClick={() => showView(item)} aria-label={`View ${fullName(item)}`} title={`View ${fullName(item)}`}>
                          <i className="bi bi-card-text fs-6" aria-hidden="true" />
                        </button>
                        {canEditUsers && (
                          <>
                            <button
                              className="btn btn-sm user-action-button me-1"
                              type="button"
                              onClick={() => resetUserPassword(item)}
                              aria-label={`Reset password for ${fullName(item)}`}
                              title={`Reset password for ${fullName(item)}`}
                              disabled={!item.is_active || item.user_id === user.userId || resettingId === item.user_id}
                            >
                              {resettingId === item.user_id ? <span className="spinner-border spinner-border-sm" aria-hidden="true" /> : <i className="bi bi-unlock2 fs-6" aria-hidden="true" />}
                            </button>
                            {!item.is_active && (
                              <button className="btn btn-sm user-action-button" type="button" onClick={() => reactivateUser(item)} disabled={reactivatingId === item.user_id} aria-label={`Reactivate ${fullName(item)}`} title={`Reactivate ${fullName(item)}`}>
                                {reactivatingId === item.user_id ? <span className="spinner-border spinner-border-sm" aria-hidden="true" /> : <i className="bi bi-check-lg fs-6" aria-hidden="true" />}
                              </button>
                            )}
                          </>
                        )}
                        {canDeleteUsers && item.is_active && (
                          <button className="btn btn-sm user-action-button" type="button" onClick={() => deleteUser(item)} disabled={item.user_id === user.userId || deletingId === item.user_id} aria-label={`Deactivate ${fullName(item)}`} title={`Deactivate ${fullName(item)}`}>
                            {deletingId === item.user_id ? <span className="spinner-border spinner-border-sm" aria-hidden="true" /> : <i className="bi bi-trash fs-6" aria-hidden="true" />}
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

      {selectedUser && modalMode && (
        <>
          <div className="modal fade show d-block" role="dialog" aria-modal="true" aria-labelledby="user-modal-title" tabIndex="-1" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}>
            <div className={`modal-dialog modal-dialog-centered modal-dialog-scrollable ${modalMode === 'edit' ? 'modal-lg' : ''}`} style={{ maxHeight: 'calc(100dvh - 2rem)' }}>
              <div className="modal-content border-0 shadow" style={{ maxHeight: '100%' }}>
                <div className="modal-header bg-light">
                  <h2 id="user-modal-title" className="modal-title h5 fw-bold">
                    {modalMode === 'view' ? 'User details' : `Edit ${fullName(selectedUser)}`}
                  </h2>
                  <button className="btn-close" type="button" onClick={closeModal} aria-label="Close" />
                </div>

                {modalMode === 'view' ? (
                  <div className="modal-body">
                    <div className="d-flex align-items-center gap-3 mb-4">
                      <ProfileAvatar user={selectedUser} size="10.5rem" />
                      <div>
                        <h3 className="h5 mb-1">{fullName(selectedUser)}</h3>
                        <span className={`badge ${selectedUser.is_active ? 'text-bg-success' : 'text-bg-secondary'}`}>
                          {selectedUser.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                    <dl className="row mb-0">
                      <dt className="col-sm-4">Email</dt><dd className="col-sm-8">{selectedUser.email || '—'}</dd>
                      <dt className="col-sm-4">Phone</dt><dd className="col-sm-8">{selectedUser.phone_number}</dd>
                      <dt className="col-sm-4">Institution</dt><dd className="col-sm-8">{selectedUser.unit_name} ({displayLabel(selectedUser.unit_type)})</dd>
                      <dt className="col-sm-4">Created</dt><dd className="col-sm-8">{new Date(selectedUser.created_at).toLocaleString()}</dd>
                    </dl>
                  </div>
                ) : (
                  <form onSubmit={saveEdit}>
                    <div className="modal-body" style={{ maxHeight: 'calc(100dvh - 13rem)', overflowY: 'auto' }}>
                      {error && <div className="alert alert-danger" role="alert">{error}</div>}
                      {success && <div className="alert alert-success" role="status">{success}</div>}
                      <div className="d-flex align-items-center gap-3 mb-3">
                        {editProfilePicturePreview ? (
                          <img src={editProfilePicturePreview} alt="New profile picture preview" className="user-profile-avatar rounded-circle border" style={{ width: '5rem', height: '5rem', objectFit: 'cover' }} />
                        ) : (
                          <ProfileAvatar user={selectedUser} size="5rem" />
                        )}
                        <div>
                          <input
                            ref={editProfilePictureInput}
                            id="edit-profile-picture"
                            type="file"
                            accept="image/jpeg,image/png,image/gif,image/webp"
                            className="visually-hidden"
                            onChange={handleEditProfilePictureChange}
                            tabIndex={-1}
                            disabled={isSaving}
                          />
                          <div className="d-flex flex-wrap align-items-start gap-2">
                            <button className="btn btn-outline-secondary rounded-circle profile-photo-action" type="button" title="Get from file" aria-label="Get from file" onClick={() => editProfilePictureInput.current?.click()} disabled={isSaving}>
                              <i className="bi bi-camera" aria-hidden="true" />
                            </button>
                            {!isSaving && <ProfilePhotoQr key={selectedUser.user_id} apiBaseUrl={API_BASE_URL} userId={selectedUser.user_id} onPhoto={receivePhonePhoto} />}
                          </div>
                          <div className="form-text fst-italic" style={{ fontSize: '0.75rem' }}>JPEG, PNG, GIF, or WebP, up to 5 MB.</div>
                          {editProfilePictureError && <div className="text-danger small mt-1" role="alert">{editProfilePictureError}</div>}
                        </div>
                      </div>
                      <div className="row g-3">
                        <div className="col-md-6">
                          <div className="input-group">
                            <span className="input-group-text bg-light text-secondary" aria-hidden="true" style={{ width: '100px' }}>Firstname</span>
                            <input id="edit-first-name" name="first_name" type="text" autoComplete="given-name" value={editForm.first_name} onChange={handleEditChange} className="form-control bg-light text-dark" style={{ borderColor: '#cbd5e1' }} placeholder="Enter first name" maxLength={100} required
                            />
                          </div>
                        </div>
                        <div className="col-md-6">
                          <div className="input-group">
                            <span className="input-group-text bg-light text-secondary" aria-hidden="true" style={{ width: '100px' }}>Middlename</span>
                            <input id="edit-middle-name" name="middle_name" type="text" autoComplete="additional-name" className="form-control bg-light text-dark" style={{ borderColor: '#cbd5e1' }} placeholder="Enter middle name" value={editForm.middle_name} onChange={handleEditChange} maxLength={100} />
                          </div>
                        </div>
                        <div className="col-md-6">
                          <div className="input-group">
                            <span className="input-group-text bg-light text-secondary" aria-hidden="true" style={{ width: '100px' }}>Lastname</span>
                            <input id="edit-last-name" name="last_name" type="text" autoComplete="family-name" className="form-control bg-light text-dark" style={{ borderColor: '#cbd5e1' }} placeholder="Enter last name" value={editForm.last_name} onChange={handleEditChange} maxLength={100} required />
                          </div>
                        </div>
                        <div className="col-md-6">
                          <div className="input-group">
                            <span className="input-group-text bg-light text-secondary" aria-hidden="true" style={{ width: '100px' }}>Suffix</span>
                            <input id="edit-suffix" name="suffix" type="text" className="form-control bg-light text-dark" style={{ borderColor: '#cbd5e1' }} placeholder="Enter suffix" value={editForm.suffix} onChange={handleEditChange} maxLength={20} />
                          </div>
                        </div>
                        <div className="col-md-6">
                          <div className="input-group">
                            <span className="input-group-text bg-light text-secondary" aria-hidden="true" style={{ width: '100px' }}>Email</span>
                            <input id="edit-email" name="email" type="email" autoComplete="email" className="form-control bg-light text-dark" style={{ borderColor: '#cbd5e1' }} placeholder="Enter email address" value={editForm.email} onChange={handleEditChange} maxLength={150} />
                          </div>
                        </div>
                        <div className="col-md-6">
                          <div className="input-group">
                            <span className="input-group-text bg-light text-secondary" aria-hidden="true" style={{ width: '100px' }}>Phone</span>
                            <input id="edit-phone" name="phone_number" type="tel" autoComplete="tel" className="form-control bg-light text-dark" style={{ borderColor: '#cbd5e1' }} placeholder="Enter phone number" value={editForm.phone_number} onChange={handleEditChange} maxLength={20} required />
                          </div>
                        </div>
                        <div className="col-md-6">
                          <div className="input-group">
                            <span className="input-group-text bg-light text-secondary" aria-hidden="true" style={{ width: '100px' }}>Institution</span>
                            <select id="edit-unit" name="unit_id" className="form-select bg-light text-dark" style={{ borderColor: '#cbd5e1' }} value={editForm.unit_id} onChange={handleEditChange} required>
                              {units.map((unit) => <option key={unit.unit_id} value={unit.unit_id}>{unit.name} ({displayLabel(unit.unit_type)})</option>)}
                            </select>
                          </div>
                        </div>
                        {canManagePermissions && <div className="col-12">
                          <fieldset className="border rounded p-3">
                            <legend className="float-none w-auto px-2 fs-6 fw-semibold">Access permissions</legend>
                            <p className="small text-muted">Choose the actions this account can perform. Permissions are grouped by the records they apply to.</p>
                            <div className="row g-3">
                              {PERMISSION_GROUPS.map((group) => {
                                const groupPermissions = permissionOptions.filter((permission) => permission.key.startsWith(group.prefix));
                                if (!groupPermissions.length) return null;
                                return (
                                  <div className="col-12 col-md-6" key={group.prefix}>
                                    <section className="h-100 border rounded p-3 bg-light" aria-label={group.title}>
                                      <h3 className="h6 fw-semibold mb-3">{group.title}</h3>
                                      <div className="d-grid gap-2">
                                        {groupPermissions.map((permission) => (
                                          <label className="form-check mb-0" key={permission.key}>
                                            <input
                                              className="form-check-input"
                                              type="checkbox"
                                              checked={editPermissions.includes(permission.key)}
                                              disabled={isSaving || permissionsLoading}
                                              onChange={(event) => setEditPermissions((current) => event.target.checked
                                                ? [...current, permission.key]
                                                : current.filter((key) => key !== permission.key))}
                                            />
                                            <span className="form-check-label">{permission.label}</span>
                                          </label>
                                        ))}
                                      </div>
                                    </section>
                                  </div>
                                );
                              })}
                            </div>
                            {permissionsLoading && <div className="small text-muted">Loading permissions…</div>}
                          </fieldset>
                        </div>}
                      </div>
                    </div>
                    <div className="modal-footer">
                      <button className="btn btn-outline-secondary" type="button" onClick={closeModal} disabled={isSaving}>Cancel</button>
                      <button className="btn btn-success" type="submit" disabled={isSaving || permissionsLoading}>
                        {isSaving ? 'Saving...' : 'Save changes'}
                      </button>
                    </div>
                  </form>
                )}

                {modalMode === 'view' && (
                  <div className="modal-footer">
                    <button className="btn btn-outline-secondary" type="button" onClick={closeModal}>Close</button>
                    {(canEditUsers || selectedUser.user_id === user?.userId) && <button className="btn btn-success" type="button" onClick={() => showEdit(selectedUser)}>Edit user</button>}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" onClick={closeModal} />
        </>
      )}

      {/* Footer placed cleanly at the bottom container margin layer */}
      <SiteFooter />

    </main>
    </div>
  );
}

export default UserList;
