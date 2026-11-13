import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import BrandHeader from '../components/BrandHeader';
import SiteFooter from '../components/SiteFooter';

const guideSections = [
  {
    title: 'Users and permissions',
    icon: 'bi-people',
    text: 'System access is controlled with per-user permissions for adding, editing, and deleting records. Ask an account manager if you need access to an action.',
    link: '/users',
    linkText: 'Open users',
  },
  {
    title: 'Courses and events',
    icon: 'bi-calendar-event',
    text: 'Create a course in the catalog before scheduling an event. Events include the course, institution, schedule, and delivery details. The Organizational Unit menu contains institution and department records.',
    link: '/learning/courses',
    linkText: 'Open course catalog',
  },
  {
    title: 'Learners and progress',
    icon: 'bi-mortarboard',
    text: 'Open a learner or event to view attendance, completion, and certification status. Users with progress editing permission can update those records. When a certificate is issued, use its printer icon to print it.',
    link: '/community/learners',
    linkText: 'Open learners',
  },
  {
    title: 'Accounts and sign out',
    icon: 'bi-person-gear',
    text: 'If prompted after your first sign-in, replace the temporary password with one of your own. Signing out returns you to the public home page.',
    link: '/home',
    linkText: 'Go to home',
  },
];

function Help() {
  const [activeGuide, setActiveGuide] = useState('');

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <BrandHeader />
      <main className="container py-4 flex-grow-1">
        <div className="mb-4">
          <p className="text-success text-uppercase fw-bold small mb-1">Support</p>
          <h1 className="h2 mb-2" style={{ fontFamily: "'DM Serif Display', serif", color: '#1a202c' }}>Help and user guide</h1>
          <p className="text-secondary mb-0">Quick guidance for common tasks in the L&amp;D Certification Management System.</p>
        </div>
        <div className="row g-3">
          {guideSections.map((section) => (
            <div className="col-12 col-lg-6" key={section.title}>
              <section className="card border-0 shadow-sm h-100">
                <div className="card-body p-4">
                  <h2 className="h5 fw-bold"><i className={`bi ${section.icon} text-success me-2`} aria-hidden="true" />{section.title}</h2>
                  <p className="text-secondary">{section.text}</p>
                  <div className="d-flex flex-wrap gap-2">
                    <button className="btn btn-outline-secondary btn-sm" type="button" onClick={() => setActiveGuide(section.title)}><i className="bi bi-info-circle me-1" aria-hidden="true" />{section.title === 'Users and permissions' ? 'User instructions' : 'Instructions'}</button>
                    <Link to={section.link} className="btn btn-outline-success btn-sm">{section.linkText}<i className="bi bi-arrow-right ms-2" aria-hidden="true" /></Link>
                  </div>
                </div>
              </section>
            </div>
          ))}
        </div>
        {activeGuide && (
          <>
            <div className="modal fade show d-block" role="dialog" aria-modal="true" aria-labelledby="user-guide-title" tabIndex="-1" onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveGuide(''); }}>
              <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-lg">
                <div className="modal-content border-0 shadow">
                  <div className="modal-header bg-light">
                    <h2 id="user-guide-title" className="modal-title h5 fw-bold">{activeGuide}</h2>
                    <button className="btn-close" type="button" onClick={() => setActiveGuide('')} aria-label="Close instructions" />
                  </div>
                  <div className="modal-body">
                    {activeGuide === 'Users and permissions' ? <>
                    <h3 className="h6 fw-bold">Add a user</h3>
                    <ol className="ps-3 text-secondary">
                      <li className="mb-2">Open <strong>Community → User</strong>, then select <span className="btn btn-success btn-sm py-0 px-2 text-nowrap"><i className="bi bi-person-plus me-1" aria-hidden="true" />Add New User</span>.</li>
                      <li>Complete the required fields, select the user’s institution, then save the new account.</li>
                    </ol>

                    <h3 className="h6 fw-bold mt-4">Edit a user and permissions</h3>
                    <ol className="ps-3 text-secondary">
                      <li className="mb-2">Find the user and select the <span className="btn btn-light btn-sm border py-0 px-2"><i className="bi bi-card-text" aria-hidden="true" /><span className="visually-hidden">View</span></span> view button.</li>
                      <li className="mb-2">In the details window, select <span className="btn btn-success btn-sm py-0 px-2">Edit user</span>. Update account details or choose the user’s add, edit, and delete permissions.</li>
                      <li>Select <span className="btn btn-success btn-sm py-0 px-2">Save changes</span> to apply the updates.</li>
                    </ol>

                    <h3 className="h6 fw-bold mt-4">Deactivate a user</h3>
                    <ol className="ps-3 text-secondary mb-2">
                      <li className="mb-2">In the user row, select the <span className="btn btn-light btn-sm border py-0 px-2"><i className="bi bi-trash" aria-hidden="true" /><span className="visually-hidden">Deactivate</span></span> button and confirm.</li>
                      <li>This deactivates the account. Use the check button on an inactive user to reactivate it.</li>
                    </ol>
                    <p className="small text-muted mb-0">These controls appear only when your account has the matching permission. Deleting a user deactivates the account rather than permanently removing its records.</p>
                    </> : activeGuide === 'Courses and events' ? <>
                      <h3 className="h6 fw-bold">Create a course</h3>
                      <ol className="ps-3 text-secondary">
                        <li className="mb-2">Open <strong>Learning → Courses</strong>, then select <strong>Add New Learning Course</strong>.</li>
                        <li>Enter the course details, including its title, learning level, and hosting department, then save.</li>
                      </ol>
                      <h3 className="h6 fw-bold mt-4">Schedule an event</h3>
                      <ol className="ps-3 text-secondary mb-2">
                        <li className="mb-2">Open <strong>Learning → Events</strong> and select <strong>Add New Learning Event</strong>.</li>
                        <li>Choose the course and provide the hosting institution, schedule, and delivery details, then save the event.</li>
                      </ol>
                      <p className="small text-muted mb-0">Course and event creation controls appear when your account has the matching permissions.</p>
                    </> : activeGuide === 'Learners and progress' ? <>
                      <h3 className="h6 fw-bold">Find a learner or event</h3>
                      <ol className="ps-3 text-secondary">
                        <li className="mb-2">Open <strong>Community → Learners</strong> to find a learner, or open <strong>Learning → Events</strong> and select an event to view its participants.</li>
                        <li>Open the learner or event record to review attendance, completion, and certification status.</li>
                      </ol>
                      <h3 className="h6 fw-bold mt-4">Update progress and print certificates</h3>
                      <ol className="ps-3 text-secondary mb-2">
                        <li className="mb-2">Use the status edit control on a learner or participant record to update progress. Some event pages also allow authorized users to update selected participants in bulk.</li>
                        <li>For a certified participant, select the printer icon to print their certificate.</li>
                      </ol>
                      <p className="small text-muted mb-0">Progress controls appear only when your account has the matching permission.</p>
                    </> : <>
                      <h3 className="h6 fw-bold">Change your password</h3>
                      <p className="text-secondary">If prompted after your first sign-in, replace the temporary password with one of your own and save the change.</p>
                      <h3 className="h6 fw-bold mt-4">Sign out</h3>
                      <p className="text-secondary mb-0">Select <strong>Sign Out</strong> in the top-right corner of the page. You will return to the public home page.</p>
                    </>}
                  </div>
                  <div className="modal-footer">
                    <button className="btn btn-outline-secondary" type="button" onClick={() => setActiveGuide('')}>Close</button>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-backdrop fade show" onClick={() => setActiveGuide('')} />
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

export default Help;
