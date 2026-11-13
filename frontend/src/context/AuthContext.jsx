import React, { createContext, useState, useEffect, useCallback } from 'react';
import { jwtDecode } from 'jwt-decode';

export const AuthContext = createContext();
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
const configuredIdleTimeoutMinutes = Number(import.meta.env.VITE_SESSION_IDLE_TIMEOUT_MINUTES);
const IDLE_TIMEOUT_MS = Number.isFinite(configuredIdleTimeoutMinutes) && configuredIdleTimeoutMinutes > 0
    ? configuredIdleTimeoutMinutes * 60 * 1000
    : 60 * 1000;
const LAST_ACTIVITY_KEY = 'ld_cert_last_activity_at';

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const logout = useCallback(() => {
        const token = localStorage.getItem('ld_cert_token');
        if (token) {
            fetch(`${API_BASE_URL}/api/auth/logout`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                keepalive: true
            }).catch(() => {});
        }
        localStorage.removeItem('ld_cert_token');
        localStorage.removeItem('isAuthenticated');
        localStorage.removeItem(LAST_ACTIVITY_KEY);
        setUser(null);
    }, []);

    useEffect(() => {
        let cancelled = false;
        const restoreSession = async () => {
            const token = localStorage.getItem('ld_cert_token');
            if (!token) {
                setLoading(false);
                return;
            }

            try {
                const decoded = jwtDecode(token);
                if (!decoded.exp || decoded.exp * 1000 <= Date.now()) {
                    logout();
                } else {
                    const response = await fetch(`${API_BASE_URL}/api/auth/session`, {
                        headers: { Authorization: `Bearer ${token}` },
                        cache: 'no-store'
                    });

                    if (cancelled) return;
                    if (!response.ok) {
                        logout();
                    } else {
                        setUser(decoded);
                    }
                }
            } catch {
                if (cancelled) return;
                logout();
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        restoreSession();
        return () => { cancelled = true; };
    }, [logout]);

    const login = async (identifier, password) => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identifier, password })
            });

            let data;
            try {
                data = await response.json();
            } catch {
                return { success: false, message: 'The server returned an invalid response.' };
            }

            if (response.ok && data.token) {
                let decoded;
                try {
                    decoded = jwtDecode(data.token);
                } catch {
                    return { success: false, message: 'The server returned an invalid session.' };
                }

                if (!decoded.exp || decoded.exp * 1000 <= Date.now()) {
                    return { success: false, message: 'The server returned an invalid session.' };
                }

                localStorage.setItem('ld_cert_token', data.token);
                localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
                setUser(decoded);
                return { success: true, user: decoded, data: data.data || {} };
            } else {
                return { success: false, message: data.message || "Authentication failed" };
            }
        } catch (err) {
            return { success: false, message: 'Could not connect to the sign-in service. Please try again.' };
        }
    };

    const changePassword = async (newPassword) => {
        try {
            const token = localStorage.getItem('ld_cert_token');
            const response = await fetch(`${API_BASE_URL}/api/auth/change-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token || ''}`
                },
                body: JSON.stringify({ new_password: newPassword })
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.success || !data.token) {
                return { success: false, message: data.message || 'Could not change the password.' };
            }

            const decoded = jwtDecode(data.token);
            if (!decoded.exp || decoded.exp * 1000 <= Date.now() || decoded.mustChangePassword) {
                return { success: false, message: 'The server returned an invalid session.' };
            }

            localStorage.setItem('ld_cert_token', data.token);
            setUser(decoded);
            return { success: true };
        } catch (error) {
            return { success: false, message: 'Could not connect to the password service. Please try again.' };
        }
    };

    useEffect(() => {
        if (!user) return undefined;

        let checkingSession = false;
        const checkSession = async () => {
            if (checkingSession) return;
            checkingSession = true;
            const token = localStorage.getItem('ld_cert_token');
            if (!token) {
                logout();
                checkingSession = false;
                return;
            }

            try {
                const response = await fetch(`${API_BASE_URL}/api/auth/session`, {
                    headers: { Authorization: `Bearer ${token}` },
                    cache: 'no-store'
                });
                if (response.status === 401) logout();
            } catch {
                // Keep the current session during a temporary network outage.
            } finally {
                checkingSession = false;
            }
        };

        const intervalId = window.setInterval(checkSession, 10000);
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') checkSession();
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        checkSession();

        return () => {
            window.clearInterval(intervalId);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [user, logout]);

    useEffect(() => {
        if (!user) return undefined;

        const storedActivity = Number(localStorage.getItem(LAST_ACTIVITY_KEY));
        let lastActivityAt = Number.isFinite(storedActivity) && storedActivity > 0
            ? storedActivity
            : Date.now();
        let lastPersistedAt = lastActivityAt;
        let timeoutId;

        if (!Number.isFinite(storedActivity) || storedActivity <= 0) {
            localStorage.setItem(LAST_ACTIVITY_KEY, String(lastActivityAt));
        }

        const checkIdleTimeout = () => {
            window.clearTimeout(timeoutId);
            const remainingMs = IDLE_TIMEOUT_MS - (Date.now() - lastActivityAt);
            if (remainingMs <= 0) {
                logout();
                return;
            }
            timeoutId = window.setTimeout(checkIdleTimeout, remainingMs);
        };

        const recordActivity = () => {
            lastActivityAt = Date.now();
            if (lastActivityAt - lastPersistedAt >= 1000) {
                localStorage.setItem(LAST_ACTIVITY_KEY, String(lastActivityAt));
                lastPersistedAt = lastActivityAt;
            }
            checkIdleTimeout();
        };

        const syncActivityAcrossTabs = (event) => {
            if (event.key !== LAST_ACTIVITY_KEY) return;
            const nextActivityAt = Number(event.newValue);
            if (Number.isFinite(nextActivityAt) && nextActivityAt > lastActivityAt) {
                lastActivityAt = nextActivityAt;
                lastPersistedAt = nextActivityAt;
                checkIdleTimeout();
            }
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') checkIdleTimeout();
        };
        const activityEvents = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'];

        activityEvents.forEach((eventName) => {
            document.addEventListener(eventName, recordActivity, { passive: true });
        });
        window.addEventListener('storage', syncActivityAcrossTabs);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        checkIdleTimeout();

        return () => {
            window.clearTimeout(timeoutId);
            activityEvents.forEach((eventName) => {
                document.removeEventListener(eventName, recordActivity);
            });
            window.removeEventListener('storage', syncActivityAcrossTabs);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [user, logout]);

    return (
        <AuthContext.Provider value={{ user, login, changePassword, logout, loading }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};
