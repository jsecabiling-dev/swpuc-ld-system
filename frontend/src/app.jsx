import React, { useContext } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Login from './pages/login'; 
import SignupRequest from './pages/signupRequest';
import SignupRequestList from './pages/signupRequestList';
import ProfilePhotoUpload from './pages/profilePhotoUpload';
import CertificateVerification from './pages/certificateVerification';
import Home from './pages/home';
import UserList from './pages/userList';
import LearnerList from './pages/learnerList';
import LearnerDetail from './pages/learnerDetail';
import CommunityRoleList from './pages/communityRoleList';
import MentorDetail from './pages/mentorDetail';
import CommunityRoleDetail from './pages/communityRoleDetail';
import InstitutionAdd from './pages/institutionAdd';
import InstitutionList from './pages/institutionList';
import LearningCourseAdd from './pages/learningCourseAdd';
import LearningCourseList from './pages/learningCourseList';
import LearningEventList from './pages/learningEventList';
import LearningEventView from './pages/learningEventView';
import DepartmentAdd from './pages/departmentAdd';
import DepartmentList from './pages/departmentList';
import ChangePassword from './pages/changePassword';
import Help from './pages/help';
import { AuthContext } from './context/AuthContext';

// Middleware boundary wrapper to secure the dashboard paths
const ProtectedRoute = ({ children, requirePasswordChange = false }) => {
  const { user } = useContext(AuthContext);
  const location = useLocation();

  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (user.mustChangePassword && !requirePasswordChange) {
    return <Navigate to="/change-password" replace />;
  }
  if (!user.mustChangePassword && requirePasswordChange) {
    return <Navigate to="/home" replace />;
  }
  return children;
};

function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup-request" element={<SignupRequest />} />
        <Route path="/profile-photo-upload" element={<ProfilePhotoUpload />} />
        <Route path="/verify-certificate/:code" element={<CertificateVerification />} />
        <Route path="/users/signup-requests" element={<ProtectedRoute><SignupRequestList /></ProtectedRoute>} />
        <Route
          path="/help"
          element={
            <ProtectedRoute>
              <Help />
            </ProtectedRoute>
          }
        />
        <Route
          path="/change-password"
          element={
            <ProtectedRoute requirePasswordChange>
              <ChangePassword />
            </ProtectedRoute>
          }
        />
        <Route 
          path="/home" 
          element={
            <ProtectedRoute>
              <Home />
            </ProtectedRoute>
          } 
        />
        <Route
          path="/users"
          element={
            <ProtectedRoute>
              <UserList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/community/learners"
          element={
            <ProtectedRoute>
              <LearnerList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/community/learners/:userId"
          element={
            <ProtectedRoute>
              <LearnerDetail />
            </ProtectedRoute>
          }
        />
        <Route path="/community/mentors" element={<ProtectedRoute><CommunityRoleList role="mentor" /></ProtectedRoute>} />
        <Route path="/community/mentors/:userId" element={<ProtectedRoute><MentorDetail /></ProtectedRoute>} />
        <Route path="/community/certifiers" element={<ProtectedRoute><CommunityRoleList role="certifier" /></ProtectedRoute>} />
        <Route path="/community/certifiers/:userId" element={<ProtectedRoute><CommunityRoleDetail role="certifier" /></ProtectedRoute>} />
        <Route
          path="/institutions/new"
          element={
            <ProtectedRoute>
              <InstitutionAdd />
            </ProtectedRoute>
          }
        />
        <Route
          path="/institutions"
          element={
            <ProtectedRoute>
              <InstitutionList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/learning/courses/new"
          element={
            <ProtectedRoute>
              <LearningCourseAdd />
            </ProtectedRoute>
          }
        />
        <Route
          path="/learning/courses"
          element={
            <ProtectedRoute>
              <LearningCourseList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/learning/events"
          element={
            <ProtectedRoute>
              <LearningEventList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/learning/events/:eventId"
          element={
            <ProtectedRoute>
              <LearningEventView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/departments/new"
          element={
            <ProtectedRoute>
              <DepartmentAdd />
            </ProtectedRoute>
          }
        />
        <Route
          path="/departments"
          element={
            <ProtectedRoute>
              <DepartmentList />
            </ProtectedRoute>
          }
        />
        {/* Baseline safety fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default App;
