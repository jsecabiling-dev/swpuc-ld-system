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
            <form onSubmit={submit} aria-busy={submitting}>
              <fieldset disabled={submitting}>
                {[
                  ['first_name', 'First name', 'text', 100, true, 'given-name'],
                  ['last_name', 'Last name', 'text', 100, true, 'family-name'],
                  ['email', 'Email address', 'email', 150, true, 'email'],
                  ['phone_number', 'Phone number (optional)', 'tel', 20, false, 'tel'],
                ].map(([name, label, type, maxLength, required, autoComplete]) => (
                  <div className="mb-2" key={name}>
                    <label className="form-label" htmlFor={`signup-${name}`}>{label}</label>
                    <input id={`signup-${name}`} name={name} type={type} className="form-control" value={form[name]} required={required} maxLength={maxLength} autoComplete={autoComplete} onChange={(event) => setForm((current) => ({ ...current, [name]: event.target.value }))} />
                  </div>
                ))}
                <label className="form-label" htmlFor="signup-message">Message (optional)</label>
                <textarea id="signup-message" name="message" className="form-control mb-3" rows={3} maxLength={1000} value={form.message} onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))} />
                <p className="small text-secondary">Your details will be saved for administrator review. Please do not include passwords.</p>
                <button className="btn btn-success w-100" type="submit">{submitting ? 'Sending request…' : 'Submit request'}</button>
              </fieldset>
            </form>
          )}
          <div className="text-center mt-3"><Link to="/login">Back to sign in</Link></div>
        </div>
      </section>
    </main>
  );
}

export default SignupRequest;
