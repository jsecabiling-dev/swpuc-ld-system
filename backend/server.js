// server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const db = require('./config/db');

const profilePicturesDirectory = path.resolve(
    __dirname,
    process.env.PROFILE_PICTURES_DIR || '../resources'
);

const app = express();

// 1. Core Global Middleware Setup
app.use(cors());
app.use('/api/signup-requests', require('./routes/signupRequests').createSignupRouter());
app.use(express.json({ limit: '7mb' }));

// 2. Mount Authentication Router (Placed exactly here)
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);
const userRoutes = require('./routes/users');
app.use('/api/users', userRoutes);
app.use('/api/certificates', require('./routes/certificates'));
const communityRoleRoutes = require('./routes/communityRoles');
app.use('/api/community-roles', communityRoleRoutes);
const institutionRoutes = require('./routes/institutions');
app.use('/api/institutions', institutionRoutes);
const learningCourseRoutes = require('./routes/learningCourses');
app.use('/api/learning-courses', learningCourseRoutes);
const departmentRoutes = require('./routes/departments');
app.use('/api/departments', departmentRoutes);
const learningParticipationRoutes = require('./routes/learningParticipations');
app.use('/api/learning-participations', learningParticipationRoutes);
const learningEventRoutes = require('./routes/learningEvents');
app.use('/api/learning-events', learningEventRoutes);

// Display the local L&D article as a standalone document in the homepage iframe.
app.get('/api/home-article', (req, res, next) => {
    res.sendFile(path.resolve(profilePicturesDirectory, 'article.html'), (error) => {
        if (error) next(error);
    });
});

// Serve profile images stored in the shared resources directory without
// exposing the whole directory as a general static file tree.
app.get('/api/profile-pictures/:filename', (req, res, next) => {
    const { filename } = req.params;
    const isSafeFilename = /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(filename);
    const isImage = /\.(?:jpe?g|png|gif|webp)$/i.test(filename);

    if (!isSafeFilename || filename !== path.basename(filename) || !isImage) {
        return res.sendStatus(404);
    }

    const imagePath = path.resolve(profilePicturesDirectory, filename);
    res.sendFile(imagePath, (error) => {
        if (error) next(error);
    });
});


// 3. Base Verification Routes
app.get('/', (req, res) => {
    res.json({ message: "SWPUC L&D Certification System API Running Securely." });
});

// Simple Database Connectivity Test
app.get('/test-db', async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT 1 + 1 AS result');
        res.json({ success: true, message: "MySQL Connection Connected!", data: rows });
    } catch (error) {
        res.status(500).json({ success: false, message: "Database error", error: error.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server executing cleanly on port ${PORT}`);
});


