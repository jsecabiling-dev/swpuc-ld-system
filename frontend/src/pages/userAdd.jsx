import React, { useContext, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import BrandHeader from '../components/BrandHeader';
import SiteFooter from '../components/SiteFooter';
import { processProfilePicture } from '../utils/processProfilePicture';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/+$/, '');
const EMPTY_FORM = {
  first_name: '',
  middle_name: '',
  last_name: '',
  suffix: '',
  email: '',
  phone_number: '',
  unit_id: '',
};

function formatLabel(value) {
  return value.replaceAll('_', ' ');
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('Could not read the selected profile picture.'));
    reader.readAsDataURL(file);
  });
}

function UserAdd() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useContext(AuthContext);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [profilePicture, setProfilePicture] = useState(null);
  const [profilePicturePreviewUrl, setProfilePicturePreviewUrl] = useState('');
  const [profilePictureError, setProfilePictureError] = useState('');
  const [units, setUnits] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [optionsError, setOptionsError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const profilePictureInput = useRef(null);

  useEffect(() => {
    if (authLoading || !user || !user.canAddUsers) return undefined;

    const controller = new AbortController();
    const loadOptions = async () => {
      setLoadingOptions(true);
      setOptionsError('');

      try {
        const response = await fetch(`${API_BASE_URL}/api/users/options`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('ld_cert_token') || ''}` },
          signal: controller.signal,
        });
        const result = await response.json().catch(() => ({}));

        if (!response.ok || !result.success) {
          throw new Error(result.message || 'Could not load institutions.');
        }

        setUnits(result.data.units || []);
      } catch (error) {
        if (error.name !== 'AbortError') {
          setOptionsError(error.message || 'Could not load institutions.');
        }
      } finally {
        if (!controller.signal.aborted) setLoadingOptions(false);
      }
    };

    loadOptions();
    return () => controller.abort();
  }, [authLoading, user, reloadKey]);

  useEffect(() => {
    if (!profilePicture) {
      setProfilePicturePreviewUrl('');
      return undefined;
    }

    const previewUrl = URL.createObjectURL(profilePicture);
    setProfilePicturePreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [profilePicture]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
    setSubmitError('');
    setSuccessMessage('');
  };

  const handleProfilePictureChange = async (event) => {
    const file = event.target.files?.[0] || null;
    setProfilePictureError('');
    setSubmitError('');
    setSuccessMessage('');

    if (!file) {
      setProfilePicture(null);
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setProfilePicture(null);
      setProfilePictureError('Choose a JPEG, PNG, GIF, or WebP image.');
      event.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setProfilePicture(null);
      setProfilePictureError('The profile picture must be 5 MB or smaller.');
      event.target.value = '';
      return;
    }

    try {
      setProfilePicture(await processProfilePicture(file));
    } catch (error) {
      setProfilePicture(null);
      setProfilePictureError(error.message || 'Could not resize the selected profile picture.');
      event.target.value = '';
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError('');
    setSuccessMessage('');

    if (profilePictureError) return;

    setIsSubmitting(true);
    try {
      const profilePictureData = profilePicture
        ? { mime_type: profilePicture.type, data: await fileToBase64(profilePicture) }
        : null;
      const response = await fetch(`${API_BASE_URL}/api/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('ld_cert_token') || ''}`,
        },
        body: JSON.stringify({
          ...formData,
          first_name: formData.first_name.trim(),
          middle_name: formData.middle_name.trim(),
          last_name: formData.last_name.trim(),
          suffix: formData.suffix.trim(),
          email: formData.email.trim(),
          phone_number: formData.phone_number.trim(),
          profile_picture: profilePictureData,
        }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Could not create the user.');
      }

      setSuccessMessage(
        `${[result.data.first_name, result.data.middle_name, result.data.last_name, result.data.suffix].filter(Boolean).join(' ')} was added. The generated password is saved in: ${result.credential_file}`
      );
      setFormData(EMPTY_FORM);
      setProfilePicture(null);
      setProfilePictureError('');
      if (profilePictureInput.current) profilePictureInput.current.value = '';
    } catch (error) {
      setSubmitError(error.message || 'Could not create the user. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading) return null;

  if (!user || !user.canAddUsers) {
    return (
      <div className="min-vh-100 bg-light d-flex flex-column">
        <BrandHeader />
        <main className="container py-5 flex-grow-1">
          <div className="alert alert-warning" role="alert">
            Only a Union Administrator can create user accounts.
          </div>
          <Link className="btn btn-outline-secondary" to="/users">Back to User List</Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
    <BrandHeader />
    <main className="container py-4 flex-grow-1">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div>
          <p className="text-success text-uppercase fw-bold small mb-1">User Management</p>
          <h1 className="h2 mb-0" style={{ fontFamily: "'DM Serif Display', serif", color: '#1a202c' }}>
            Add New User
          </h1>
        </div>
        <Link className="btn btn-outline-secondary" to="/users">
          <i className="bi bi-arrow-left me-1" aria-hidden="true" /> Back to User List
        </Link>
      </div>

      <section className="card border-0 shadow-sm">
        <div className="card-body p-4">
          {optionsError && (
            <div className="alert alert-danger d-flex align-items-center justify-content-between gap-3" role="alert">
              <span>{optionsError}</span>
              <button className="btn btn-sm btn-outline-danger" type="button" onClick={() => setReloadKey((key) => key + 1)}>
                Retry
              </button>
            </div>
          )}
          {submitError && <div className="alert alert-danger" role="alert">{submitError}</div>}
          {successMessage && <div className="alert alert-success" role="status">{successMessage}</div>}
          <div className="alert alert-info" role="note">
            A secure temporary password will be generated and saved in a text file on the backend computer. Share it securely, then delete the file after delivery.
          </div>

          <form onSubmit={handleSubmit}>
            <div className="row g-3">
              <div className="col-md-3">
                <label htmlFor="first_name" className="form-label">First name <span className="text-danger">*</span></label>
                <input id="first_name" name="first_name" className="form-control" value={formData.first_name} onChange={handleChange} autoComplete="given-name" maxLength={100} required disabled={loadingOptions || isSubmitting} />
              </div>
              <div className="col-md-3">
                <label htmlFor="middle_name" className="form-label">Middle name</label>
                <input id="middle_name" name="middle_name" className="form-control" value={formData.middle_name} onChange={handleChange} autoComplete="additional-name" maxLength={100} disabled={loadingOptions || isSubmitting} />
              </div>
              <div className="col-md-3">
                <label htmlFor="last_name" className="form-label">Last name <span className="text-danger">*</span></label>
                <input id="last_name" name="last_name" className="form-control" value={formData.last_name} onChange={handleChange} autoComplete="family-name" maxLength={100} required disabled={loadingOptions || isSubmitting} />
              </div>
              <div className="col-md-3">
                <label htmlFor="suffix" className="form-label">Suffix</label>
                <input id="suffix" name="suffix" className="form-control" value={formData.suffix} onChange={handleChange} placeholder="e.g. Jr., Sr., III" maxLength={20} disabled={loadingOptions || isSubmitting} />
              </div>

              <div className="col-md-6">
                <label htmlFor="email" className="form-label">Email address</label>
                <input id="email" name="email" type="email" className="form-control" value={formData.email} onChange={handleChange} autoComplete="email" maxLength={150} disabled={loadingOptions || isSubmitting} />
                <div className="form-text">Optional if the user signs in with a phone number.</div>
              </div>
              <div className="col-md-6">
                <label htmlFor="phone_number" className="form-label">Phone number <span className="text-danger">*</span></label>
                <input id="phone_number" name="phone_number" type="tel" className="form-control" value={formData.phone_number} onChange={handleChange} autoComplete="tel" maxLength={20} required disabled={loadingOptions || isSubmitting} />
              </div>

              <div className="col-md-6">
                <label htmlFor="unit_id" className="form-label">Institution <span className="text-danger">*</span></label>
                <select id="unit_id" name="unit_id" className="form-select" value={formData.unit_id} onChange={handleChange} required disabled={loadingOptions || isSubmitting || !units.length}>
                  <option value="">{loadingOptions ? 'Loading institutions...' : 'Choose an institution'}</option>
                  {units.map((unit) => <option key={unit.unit_id} value={unit.unit_id}>{unit.name} ({formatLabel(unit.unit_type)})</option>)}
                </select>
              </div>

              <div className="col-12">
                <input
                  ref={profilePictureInput}
                  id="profile_picture"
                  name="profile_picture"
                  type="file"
                  className="visually-hidden"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={handleProfilePictureChange}
                  tabIndex={-1}
                  disabled={loadingOptions || isSubmitting}
                />
                <button
                  type="button"
                  className="btn btn-outline-success"
                  onClick={() => profilePictureInput.current?.click()}
                  aria-describedby="profile-picture-help"
                  disabled={loadingOptions || isSubmitting}
                >
                  <i className="bi bi-camera me-2" aria-hidden="true" />
                  {profilePicture ? 'Change profile picture' : 'Choose profile picture'}
                </button>
                <div id="profile-picture-help" className="form-text mt-2">
                  Optional. JPEG, PNG, GIF, or WebP, up to 5 MB.
                </div>
                {profilePictureError && <div className="text-danger small mt-1" role="alert">{profilePictureError}</div>}
                {profilePicturePreviewUrl && (
                  <div className="d-flex align-items-center gap-3 mt-3">
                    <img
                      src={profilePicturePreviewUrl}
                      alt="Selected profile picture preview"
                      className="rounded-circle border"
                      style={{ width: '6rem', height: '6rem', objectFit: 'cover' }}
                    />
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm"
                      onClick={() => {
                        setProfilePicture(null);
                        setProfilePictureError('');
                        if (profilePictureInput.current) profilePictureInput.current.value = '';
                      }}
                      disabled={isSubmitting}
                    >
                      Remove picture
                    </button>
                  </div>
                )}
              </div>

            </div>

            <div className="d-flex justify-content-end gap-2 mt-4">
              <button type="button" className="btn btn-outline-secondary" onClick={() => navigate('/users')} disabled={isSubmitting}>Cancel</button>
              <button type="submit" className="btn btn-success" disabled={loadingOptions || isSubmitting || Boolean(optionsError)}>
                {isSubmitting ? <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />Saving...</> : 'Create User'}
              </button>
            </div>
          </form>
        </div>
      </section>
      {/* Footer placed cleanly at the bottom container margin layer */}
      <SiteFooter />
    </main>
    </div>
  );
}

export default UserAdd;
