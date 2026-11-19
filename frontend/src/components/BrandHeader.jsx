import React, { useContext, useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import sdaLogoGreen from '../pages/thumbnails/sda_logo_green.png';
import { AuthContext } from '../context/AuthContext';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/+$/, '');
const PROFILE_IMAGE_BASE_URL = (
  import.meta.env.VITE_PROFILE_IMAGE_BASE_URL || `${API_BASE_URL}/api/profile-pictures`
).replace(/\/+$/, '');

function getProfileImageUrl(value) {
  const image = value?.trim();
  if (!image) return '';
  if (/^(https?:|data:|blob:)/i.test(image)) return image;
  const filename = image.split(/[\\/]/).pop();
  return filename ? `${PROFILE_IMAGE_BASE_URL}/${encodeURIComponent(filename)}` : '';
}

function BrandHeader({ showMenu = true }) {
  const { logout, user } = useContext(AuthContext);
  const [currentUserName, setCurrentUserName] = useState('User');
  const [profileImage, setProfileImage] = useState('');
  const [profileImageFailed, setProfileImageFailed] = useState(false);

  useEffect(() => {
    setCurrentUserName(localStorage.getItem('userName') || 'User');
    setProfileImage(localStorage.getItem('profilePict') || '');
  }, []);

  const handleLogout = () => {
    logout();
  };

  return (
    <>
      <nav className="navbar navbar-dark bg-dark shadow-sm py-3">
        <div className="container">
          <NavLink className="navbar-brand d-flex align-items-center" to={user ? '/home' : '/'} aria-label="Home">
            <img src={sdaLogoGreen} alt="" className="img-fluid me-2" style={{ maxHeight: '60px' }} />
            <div className="d-flex flex-column" style={{ lineHeight: '1.2' }}>
              <span style={{ fontSize: '0.90rem', fontWeight: 'normal' }}>Southwestern Philippine Union Conference</span>
              <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: '1.50rem', fontWeight: 'normal' }}>Learning &amp; Development Certification Management System</span>
              <small className="text-muted" style={{ fontSize: '0.65rem' }}>Certification Management System</small>
            </div>
          </NavLink>

          <div className="d-flex align-items-center gap-3 ms-auto">
            {user ? (
              <>
                <div className="d-flex align-items-center">
                  {getProfileImageUrl(profileImage) && !profileImageFailed ? (
                    <img
                      src={getProfileImageUrl(profileImage)}
                      alt={`${currentUserName}'s profile`}
                      className="rounded-circle border border-secondary img-fluid me-2"
                      style={{ width: '2.7rem', height: '2.7rem', flex: '0 0 2.7rem', objectFit: 'cover' }}
                      onError={() => setProfileImageFailed(true)}
                    />
                  ) : (
                    <span
                      className="rounded-circle border border-secondary bg-secondary-subtle text-secondary d-inline-flex align-items-center justify-content-center me-2"
                      role="img"
                      aria-label={`${currentUserName}'s profile picture is unavailable`}
                      style={{ width: '2.7rem', height: '2.7rem', flex: '0 0 2.7rem' }}
                    >
                      <i className="bi bi-person-fill" aria-hidden="true" />
                    </span>
                  )}
                  <span className="text-light text-capitalize" style={{ fontSize: '0.9rem', fontWeight: 'normal' }}>
                    {currentUserName}
                  </span>
                </div>
                <button
                  className="btn btn-outline-light btn-sm d-inline-flex align-items-center"
                  type="button"
                  onClick={handleLogout}
                  style={{ paddingLeft: '0.75rem', paddingRight: '0.75rem' }}
                >
                  <i className="bi bi-box-arrow-right me-1" aria-hidden="true" /> Sign Out
                </button>
              </>
            ) : (
              <NavLink className="btn btn-outline-light btn-sm" to="/login">
                <i className="bi bi-box-arrow-in-right me-1" aria-hidden="true" /> Sign In
              </NavLink>
            )}
          </div>
        </div>
      </nav>

      {showMenu && user && (
        <nav className="navbar navbar-expand-lg navbar-light border-bottom shadow-sm" style={{ backgroundColor: '#e2e8f0' }} aria-label="Main navigation">
          <div className="container">
            <button
              className="navbar-toggler"
              type="button"
              data-bs-toggle="collapse"
              data-bs-target="#site-menu"
              aria-controls="site-menu"
              aria-expanded="false"
              aria-label="Toggle navigation menu"
            >
              <span className="navbar-toggler-icon" />
            </button>

            <div className="collapse navbar-collapse" id="site-menu">
              <ul className="navbar-nav gap-2 gap-lg-4">
                <li className="nav-item">
                  <NavLink className="nav-link d-flex align-items-center" to={user ? '/home' : '/'} end><i className="bi bi-house-door me-2" aria-hidden="true" />Home</NavLink>
                </li>
                <li className="nav-item dropdown">
                  <button className="nav-link dropdown-toggle d-flex align-items-center" type="button" id="community-menu" data-bs-toggle="dropdown" aria-expanded="false">
                    <i className="bi bi-people me-2" aria-hidden="true" />
                    Community
                  </button>
                  <ul className="dropdown-menu" aria-labelledby="community-menu">
                    <li><NavLink className="dropdown-item" to="/users"><i className="bi bi-person me-2" aria-hidden="true" />User</NavLink></li>
                    <li><NavLink className="dropdown-item" to="/community/learners"><i className="bi bi-mortarboard me-2" aria-hidden="true" />Learner</NavLink></li>
                    <li><NavLink className="dropdown-item" to="/community/mentors"><i className="bi bi-person-workspace me-2" aria-hidden="true" />Mentor</NavLink></li>
                    <li><NavLink className="dropdown-item" to="/community/certifiers"><i className="bi bi-patch-check me-2" aria-hidden="true" />Certifier</NavLink></li>
                  </ul>
                </li>
                <li className="nav-item dropdown">
                  <button className="nav-link dropdown-toggle d-flex align-items-center" type="button" id="learning-menu" data-bs-toggle="dropdown" aria-expanded="false">
                    <i className="bi bi-book me-2" aria-hidden="true" />
                    Learning
                  </button>
                  <ul className="dropdown-menu" aria-labelledby="learning-menu">
                    <li><NavLink className="dropdown-item" to="/learning/courses"><i className="bi bi-journal-bookmark me-2" aria-hidden="true" />Catalog</NavLink></li>
                    <li><NavLink className="dropdown-item" to="/learning/events"><i className="bi bi-calendar-event me-2" aria-hidden="true" />Event</NavLink></li>
                  </ul>
                </li>
                <li className="nav-item dropdown">
                  <button className="nav-link dropdown-toggle d-flex align-items-center" type="button" id="organizational-unit-menu" data-bs-toggle="dropdown" aria-expanded="false">
                    <i className="bi bi-diagram-3 me-2" aria-hidden="true" />
                    Organizational Unit
                  </button>
                  <ul className="dropdown-menu" aria-labelledby="organizational-unit-menu">
                    <li><NavLink className="dropdown-item" to="/institutions"><i className="bi bi-building me-2" aria-hidden="true" />Institution</NavLink></li>
                    <li><hr className="dropdown-divider" /></li>
                    <li><NavLink className="dropdown-item" to="/departments"><i className="bi bi-diagram-2 me-2" aria-hidden="true" />Department</NavLink></li>
                  </ul>
                </li>
                <li className="nav-item dropdown">
                  <button className="nav-link dropdown-toggle d-flex align-items-center" type="button" id="help-menu" data-bs-toggle="dropdown" aria-expanded="false">
                    <i className="bi bi-question-circle me-2" aria-hidden="true" />Help
                  </button>
                  <ul className="dropdown-menu" aria-labelledby="help-menu">
                    <li><NavLink className="dropdown-item" to="/help"><i className="bi bi-journal-text me-2" aria-hidden="true" />Help and user guide</NavLink></li>
                  </ul>
                </li>
              </ul>
            </div>
          </div>
        </nav>
      )}
    </>
  );
}

export default BrandHeader;
