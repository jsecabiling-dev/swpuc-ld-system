import React, { useContext, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import SiteFooter from '../components/SiteFooter';
import sdaLogoGreen from './thumbnails/sda_logo_green.png';
import './login.css';

function formatFullName(firstName, middleName, lastName, suffix) {
  const first = firstName?.trim() || '';
  const middle = middleName?.trim() || '';
  const last = lastName?.trim() || '';
  const nameSuffix = suffix?.trim() || '';
  const middleInitial = middle ? `${middle.charAt(0).toUpperCase()}.` : '';

  return [first, middleInitial, last, nameSuffix].filter(Boolean).join(' ');
}

function Login() {
  const navigate = useNavigate();
  const { login, loading: authLoading } = useContext(AuthContext);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const result = await login(identifier.trim(), password);

      if (!result.success) {
        setError(result.message);
        return;
      }

      const profile = result.data || {};
      const fullName = formatFullName(
        profile.first_name,
        profile.middle_name,
        profile.last_name,
        profile.suffix,
      );

      // These values are display data only. The JWT managed by AuthContext
      // represents the signed-in session.
      localStorage.setItem('userName', fullName || 'User');
      localStorage.setItem('profilePict', profile.profilepict || '');

      navigate(result.user?.mustChangePassword ? '/change-password' : '/home', { replace: true });
    } catch (requestError) {
      setError('Unable to sign in right now. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const isBusy = authLoading || submitting;

  return (
    <main className="login-page container d-flex justify-content-center align-items-center min-vh-100 py-4">
      <section
        className="login-card card bg-white shadow-sm p-4 rounded-3 position-relative"
        aria-labelledby="login-title"
        style={{
          border: '1px solid #e3e8ed',
          maxWidth: '450px',
          width: '100%',
        }}
      >
        <header className="text-center mb-4">
          <img
            src={sdaLogoGreen}
            alt="Southwestern Philippine Union Conference"
            className="login-logo img-fluid mb-3"
          />
          <p className="text-muted mb-1">Southwestern Philippine Union Conference</p>
          <h1
            id="login-title"
            className="mb-0"
            style={{ fontFamily: "'DM Serif Display', serif", fontSize: '1.3rem', color: '#1a202c' }}
          >
            Learning &amp; Development Certification Management System
          </h1>
        </header>

        <form onSubmit={handleSubmit} aria-busy={isBusy}>
          {error && (
            <div className="alert alert-danger" role="alert" aria-live="assertive">
              {error}
            </div>
          )}

          <div className="mb-3 text-start">
            <div className="input-group">
              <span className="input-group-text bg-light text-secondary" aria-hidden="true">
                <i className="bi bi-person-circle" />
              </span>
              <input
                id="login-identifier"
                name="identifier"
                type="text"
                autoComplete="username"
                value={identifier}
                onChange={(event) => {
                  setIdentifier(event.target.value);
                  if (error) setError('');
                }}
                className="form-control bg-light text-dark"
                style={{ borderColor: '#cbd5e1' }}
                placeholder="Email address or phone number"
                aria-label="Email address or phone number"
                required
                disabled={isBusy}
              />
            </div>
          </div>

          <div className="mb-3 text-start">
            <div className="input-group">
              <span className="input-group-text bg-light text-secondary" aria-hidden="true">
                <i className="bi bi-lock-fill" />
              </span>
              <input
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (error) setError('');
                }}
                className="form-control bg-light text-dark"
                style={{ borderColor: '#cbd5e1' }}
                placeholder="Enter your password"
                aria-label="Password"
                required
                disabled={isBusy}
              />
            </div>
          </div>

          <div className="text-center mt-4">
            <button
              type="submit"
              className="btn login-submit-button rounded-circle d-inline-flex align-items-center justify-content-center p-0"
              aria-label={submitting ? 'Signing in' : 'Sign in'}
              title={submitting ? 'Signing in' : 'Sign in'}
              disabled={isBusy}
            >
              {submitting ? (
                <>
                  <span className="spinner-border spinner-border-sm" aria-hidden="true" />
                  <span className="visually-hidden">Signing in...</span>
                </>
              ) : authLoading ? (
                <span className="spinner-border spinner-border-sm" aria-hidden="true" />
              ) : (
                <i className="bi bi-arrow-right" style={{ fontSize: '1.5rem' }} aria-hidden="true" />
              )}
            </button>
          </div>
        </form>

        <div className="text-center">
          <Link className="login-signup-link" to="/signup-request">Signup Request</Link>
        </div>

        <SiteFooter />
      </section>
    </main>
  );
}

export default Login;
