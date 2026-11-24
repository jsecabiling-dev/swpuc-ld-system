import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import './signupRequest.css';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/+$/, '');
const emptyForm = { first_name: '', last_name: '', email: '', phone_number: '', message: '' };

function SignupRequest() {
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/signup-requests`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || 'Could not submit your request. Please try again later.');
      setSuccess(result.message);
      setForm(emptyForm);
    } catch (requestError) {
      setError(requestError instanceof TypeError ? 'Could not connect to the signup service. Please try again.' : requestError.message);
    } finally { setSubmitting(false); }
  };

  return (
    <main className="signup-request-page bg-light">
      <section className="signup-request-card card border-0 shadow-sm" aria-labelledby="signup-request-title">
        <div className="card-body">
          <h1 id="signup-request-title">Signup Request</h1>
          <p className="text-secondary">Request an account for the Learning &amp; Development Certification Management System. An administrator will review your details.</p>
          {error && <div className="alert alert-danger" role="alert">{error}</div>}
          {success ? <div className="alert alert-success" role="status">{success}</div> : (
            <form id="signup-request-form" onSubmit={submit} aria-busy={submitting}>
              <fieldset disabled={submitting}>
                {[
                  ['first_name', 'First name', 'text', 100, true, 'given-name'],
                  ['last_name', 'Last name', 'text', 100, true, 'family-name'],
                  ['email', 'Email address', 'email', 150, true, 'email'],
                  ['phone_number', 'Phone number (optional)', 'tel', 20, false, 'tel'],
                ].map(([name, label, type, maxLength, required, autoComplete]) => (
                  <div className="mb-2" key={name}>
                    <label className="visually-hidden" htmlFor={`signup-${name}`}>{label}</label>
                    <input id={`signup-${name}`} name={name} type={type} className="form-control" value={form[name]} placeholder={required ? `${label} *` : label} required={required} maxLength={maxLength} autoComplete={autoComplete} onChange={(event) => setForm((current) => ({ ...current, [name]: event.target.value }))} />
                  </div>
                ))}
                <label className="visually-hidden" htmlFor="signup-message">Message (optional)</label>
                <textarea id="signup-message" name="message" className="form-control mb-3" placeholder="Message (optional)" rows={3} maxLength={1000} value={form.message} onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))} />
                <p className="small text-secondary">Your details will be saved for administrator review. Please do not include passwords.</p>
              </fieldset>
            </form>
          )}
          <div className="d-flex justify-content-center gap-3 mt-3">
            {!success && (
              <button
                className="btn rounded-circle signup-request-action"
                type="submit"
                form="signup-request-form"
                disabled={submitting}
                aria-label={submitting ? 'Sending request' : 'Submit Request'}
              >
                {submitting ? <span className="spinner-border spinner-border-sm" aria-hidden="true" /> : <i className="bi bi-send" aria-hidden="true" />}
              </button>
            )}
            <Link className="btn rounded-circle signup-request-action" to="/login" aria-label="Back to sign in">
              <i className="bi bi-arrow-left" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

export default SignupRequest;
