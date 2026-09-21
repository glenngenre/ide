import { API_BASE_URL } from "./constants.js";

const ACCESS_KEY = "skwtr_jwt";
const REFRESH_KEY = "skwtr_refresh";
const ROLE_KEY = "skwtr_role";
const USER_KEY = "skwtr_username";

function storeSession(data) {
    if (data.token) localStorage.setItem(ACCESS_KEY, data.token);
    if (data.refresh_token)
        localStorage.setItem(REFRESH_KEY, data.refresh_token);
    if (data.role) localStorage.setItem(ROLE_KEY, data.role);
    if (data.username) localStorage.setItem(USER_KEY, data.username);
}

function clearSession() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(ROLE_KEY);
    localStorage.removeItem(USER_KEY);
}

export async function initAuth() {
    const accessToken = localStorage.getItem(ACCESS_KEY);
    const refreshToken = localStorage.getItem(REFRESH_KEY);

    console.log("access token", accessToken, "refresh token", refreshToken)

    if (refreshToken && !accessToken) {
        try {
            await refreshAccessToken();
            window.dispatchEvent(
                new CustomEvent("skwtr:login", {
                    detail: {
                        username: getUsername(),
                        role: getAuthRole(),
                    },
                }),
            );
        } catch (err) {
            console.warn("Initial refresh failed:", err);
            clearSession();
            showLoginModal();
        }
    } else if (!accessToken && !refreshToken) {
        showLoginModal();
    }

    const loginForm = document.getElementById("login-form");
    if (loginForm) {
        loginForm.removeEventListener("submit", handleLogin);
        loginForm.addEventListener("submit", handleLogin);
    }
}

async function handleLogin(e) {
    e.preventDefault();

    const username = document.getElementById("login-username").value;
    const password = document.getElementById("login-password").value;
    const errorDiv = document.getElementById("login-error");

    errorDiv.style.display = "none";
    errorDiv.textContent = "";

    if (!username || !password) {
        errorDiv.textContent = "Please enter both username and password";
        errorDiv.style.display = "block";
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            body: JSON.stringify({
                username: username.trim(),
                password: password,
            }),
        });

        const data = await response.json();

        if (response.ok && data.token) {
            storeSession({
                token: data.token,
                refresh_token: data.refresh_token,
                role: data.role || "user",
                username: data.username || username,
            });

            $("#skwtr-login-modal").modal("hide");
            document.getElementById("login-password").value = "";

            console.log("Login successful");
            window.dispatchEvent(
                new CustomEvent("skwtr:login", {
                    detail: {
                        username: data.username || username,
                        role: data.role || "user",
                    },
                }),
            );
        } else {
            errorDiv.textContent = data.error || "Invalid username or password";
            errorDiv.style.display = "block";
            document.getElementById("login-password").value = "";
        }
    } catch (err) {
        console.error("Login error:", err);
        errorDiv.textContent =
            "Network error. Please check your connection and try again.";
        errorDiv.style.display = "block";
    }
}

export function getAuthToken() {
    return localStorage.getItem(ACCESS_KEY);
}

let refreshPromise = null;

async function refreshAccessToken() {
    if (refreshPromise) return refreshPromise;

    refreshPromise = (async () => {
        const refreshToken = localStorage.getItem(REFRESH_KEY);
        if (!refreshToken) throw new Error("no refresh token");

        const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            body: JSON.stringify({ refresh_token: refreshToken }),
        });

        if (!res.ok) throw new Error("refresh failed");

        const data = await res.json();
        if (!data.token) throw new Error("refresh returned no token");

        storeSession({ token: data.token, refresh_token: data.refresh_token });
        return data.token;
    })().finally(() => {
        refreshPromise = null;
    });

    return refreshPromise;
}

export function getAuthRole() {
    return localStorage.getItem(ROLE_KEY);
}

export function getUsername() {
    return localStorage.getItem(USER_KEY);
}

export async function logout() {
    const refresh = localStorage.getItem(REFRESH_KEY);

    if (refresh) {
        try {
            await fetch(`${API_BASE_URL}/auth/logout`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify({ refresh_token: refresh }),
            });
        } catch (err) {
            console.warn("Logout revoke failed:", err);
        }
    }

    clearSession();
    window.location.reload();
}

export function handleUnauthorized() {
    clearSession();
    $("#skwtr-login-modal")
        .modal({
            closable: false,
            transition: "fade up",
        })
        .modal("show");
}

export function requireAuthentication() {
    const token = getAuthToken();
    if (!token) {
        setTimeout(() => {
            $("#skwtr-login-modal")
                .modal({
                    closable: false,
                    transition: "fade up",
                })
                .modal("show");
        }, 500);
        return false;
    }
    return true;
}

export async function apiFetch(path, options = {}) {
    const url = path.startsWith("http") ? path : `${API_BASE_URL}${path}`;
    const opts = {
        ...options,
        headers: { ...(options.headers || {}) },
    };

    const token = localStorage.getItem(ACCESS_KEY);
    if (token && !opts.headers["Authorization"]) {
        opts.headers["Authorization"] = `Bearer ${token}`;
    }

    let res = await fetch(url, opts);
    if (res.status !== 401) return res;

    let newToken;
    try {
        newToken = await refreshAccessToken();
    } catch (err) {
        console.warn("Refresh failed, forcing login", err);
        handleUnauthorized();
        return res;
    }

    opts.headers["Authorization"] = `Bearer ${newToken}`;
    res = await fetch(url, opts);

    if (res.status === 401) handleUnauthorized();
    return res;
}

function showLoginModal() {
    $("#skwtr-login-modal")
        .modal({
            closable: false,
            transition: "fade up",
        })
        .modal("show");
}
