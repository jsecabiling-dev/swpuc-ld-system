import React, { useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import SiteFooter from '../components/SiteFooter';

function ChangePassword() {
  const navigate = useNavigate();
  const { changePassword } = useContext(AuthContext);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (newPassword.length < 6) {
      setError('Choose a password at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await changePassword(newPassword);
      if (!result.success) {
        setError(result.message);
        return;
      }
      navigate('/home', { replace: true });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="container d-flex justify-content-center align-items-center min-vh-100 py-4">
      <section className="card border-0 shadow-sm p-4" style={{ maxWidth: '480px', width: '100%' }} aria-labelledby="change-password-title">
        <p className="text-success text-uppercase fw-bold small mb-1">First sign-in</p>
        <h1 id="change-password-title" className="h3 mb-2" style={{ fontFamily: "'DM Serif Display', serif", color: '#1a202c' }}>
          Change your password
        </h1>
        <p className="text-secondary mb-4">
          Your temporary password can only be used for initial access. Set a new password to continue.
        </p>

        {error && <div className="alert alert-danger" role="alert">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label htmlFor="new-password" className="form-label">New password</label>
            <input
              id="new-password"
              type="password"
              className="form-control"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              minLength={6}
              maxLength={72}
              required
              disabled={isSubmitting}
            />
            <div className="form-text">Use at least 6 characters.</div>
          </div>

          <div className="mb-4">
            <label htmlFor="confirm-password" className="form-label">Confirm new password</label>
            <input
              id="confirm-password"
              type="password"
              className="form-control"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              minLength={6}
              maxLength={72}
              required
              disabled={isSubmitting}
            />
          </div>

          <button type="submit" className="btn btn-success w-100" disabled={isSubmitting}>
            {isSubmitting ? <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />Saving...</> : 'Save new password'}
          </button>
        </form>
      </section>
      <SiteFooter />
    </main>
  );
}

export default ChangePassword;
