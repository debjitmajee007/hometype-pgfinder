/**
 * Authentication Utility Functions
 * Handles JWT token validation and route protection
 */

// API Configuration
// Configurable base URL for backend API. Updated to match frontend requirements.
const API_BASE_URL = 'http://localhost:3000/api';

/**
 * Get token from localStorage
 */
function getToken() {
  return localStorage.getItem('token');
}

/**
 * Get user data from localStorage
 */
function getUser() {
  const userStr = localStorage.getItem('user');
  return userStr ? JSON.parse(userStr) : null;
}

/**
 * Decode JWT token to extract payload
 */
function decodeJWT(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(function (c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        })
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('Error decoding JWT:', error);
    return null;
  }
}

/**
 * Get user role from token or localStorage
 */
function getUserRole() {
  const token = getToken();
  if (!token) {
    return null;
  }

  // Try to get role from decoded token
  const decodedToken = decodeJWT(token);
  if (decodedToken && decodedToken.role) {
    return decodedToken.role.toLowerCase();
  }

  // Fallback to user data in localStorage
  const user = getUser();
  if (user && user.role) {
    return user.role.toLowerCase();
  }

  return null;
}

/**
 * Check if token is expired
 */
function isTokenExpired(token) {
  try {
    const decoded = decodeJWT(token);
    if (!decoded || !decoded.exp) {
      return true;
    }

    const currentTime = Date.now() / 1000;
    return decoded.exp < currentTime;
  } catch (error) {
    return true;
  }
}

/**
 * Verify token is valid (not expired)
 */
function isTokenValid() {
  const token = getToken();
  if (!token) {
    return false;
  }

  return !isTokenExpired(token);
}

/**
 * Clear authentication data
 */
function clearAuth() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

/**
 * Redirect to login page
 */
function redirectToLogin() {
  window.location.href = 'login.html';
}

/**
 * Protected Route Handler
 * Checks authentication and role before allowing access
 * 
 * @param {string} requiredRole - Required role to access the route ('student', 'owner', 'admin')
 * @param {boolean} allowMultipleRoles - If true, allows multiple roles (array)
 */
function protectRoute(requiredRole, allowMultipleRoles = false) {
  // Check if token exists
  const token = getToken();
  if (!token) {
    console.warn('No token found. Redirecting to login.');
    redirectToLogin();
    return false;
  }

  // Check if token is valid (not expired)
  if (!isTokenValid()) {
    console.warn('Token expired. Clearing auth and redirecting to login.');
    clearAuth();
    redirectToLogin();
    return false;
  }

  // Get user role
  const userRole = getUserRole();
  if (!userRole) {
    console.warn('No role found. Redirecting to login.');
    clearAuth();
    redirectToLogin();
    return false;
  }

  // Check if user has required role
  if (allowMultipleRoles && Array.isArray(requiredRole)) {
    // Allow multiple roles
    if (!requiredRole.includes(userRole)) {
      console.warn(`Access denied. Required roles: ${requiredRole.join(', ')}, User role: ${userRole}`);
      clearAuth();
      redirectToLogin();
      return false;
    }
  } else {
    // Single role check
    if (userRole !== requiredRole.toLowerCase()) {
      console.warn(`Access denied. Required role: ${requiredRole}, User role: ${userRole}`);
      clearAuth();
      redirectToLogin();
      return false;
    }
  }

  // All checks passed
  console.log(`Access granted. User role: ${userRole}`);
  return true;
}

/**
 * Initialize route protection on page load
 * Call this function at the end of protected pages
 * 
 * @param {string} requiredRole - Required role for the page
 */
function initRouteProtection(requiredRole) {
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      protectRoute(requiredRole);
    });
  } else {
    protectRoute(requiredRole);
  }
}

/**
 * Logout function
 */
function logout() {
  clearAuth();
  redirectToLogin();
}

// Export functions for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getToken,
    getUser,
    getUserRole,
    isTokenValid,
    clearAuth,
    redirectToLogin,
    protectRoute,
    initRouteProtection,
    logout
  };
}

/*
 * Student PG filter & fetch enhancements
 * - Overrides the page-level `fetchAndRenderPGs` after load so HTML/CSS stay unchanged
 * - Builds query params: minPrice, maxPrice, maxDistance, facilities
 * - Debounces and avoids duplicate API calls
 * - Logs filters, final URL and backend result length for debugging
 */
window.addEventListener('load', () => {
  // Keep last request signature to avoid duplicate requests
  let lastRequestKey = null;
  let isFetching = false;

  // Utility: escape HTML for safe insertion
  function escapeHtml(str) {
    if (str === undefined || str === null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Parse distance select values like "1-2" or "10+" into a maxDistance number
  function parseMaxDistance(value) {
    if (!value) return null;
    if (value.includes('-')) {
      const parts = value.split('-').map(p => Number(p));
      if (!Number.isNaN(parts[1])) return parts[1];
    }
    if (value.endsWith('+')) {
      const num = Number(value.replace('+', ''));
      if (!Number.isNaN(num)) return num + 100; // treat as large
    }
    const n = Number(value);
    return Number.isNaN(n) ? null : n;
  }

  // Build query string using URLSearchParams according to backend expectations
  function buildQueryParams() {
    const params = new URLSearchParams();

    const priceEl = document.getElementById('priceRange');
    if (priceEl) {
      // Use slider's min as minPrice and its current value as maxPrice
      const minP = Number(priceEl.min || 0);
      const maxP = Number(priceEl.value || 0);
      if (!Number.isNaN(minP)) params.set('minPrice', String(minP));
      if (!Number.isNaN(maxP)) params.set('maxPrice', String(maxP));
    }

    const distEl = document.getElementById('distanceSelect');
    if (distEl && distEl.value) {
      const maxDistance = parseMaxDistance(distEl.value);
      if (maxDistance !== null) params.set('maxDistance', String(maxDistance));
    }

    const facilityCheckboxes = Array.from(document.querySelectorAll('input[name="facilities"]:checked'));
    if (facilityCheckboxes.length) {
      const facilities = facilityCheckboxes.map(cb => cb.value).filter(Boolean);
      if (facilities.length) params.set('facilities', facilities.join(','));
    }

    return params;
  }

  // Debounce helper (300ms). Use separate timer per invocation.
  function debounce(fn, wait = 300) {
    let t;
    return function(...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  // Sort listings by numeric distance (ascending) and log before/after
  function sortByDistance(listings) {
    try {
      const distancesBefore = listings.map(l => Number(l.distance || 0));
      console.log('Distances before sort:', distancesBefore);
      listings.sort((a, b) => (Number(a.distance || 0) - Number(b.distance || 0)));
      const distancesAfter = listings.map(l => Number(l.distance || 0));
      console.log('Sorted by distance. Distances after sort:', distancesAfter);
    } catch (e) {
      console.warn('Sorting error:', e);
    }
  }

  // Override or define global fetchAndRenderPGs used by the page
  // `forceAll` true -> fetch without query params (used on initial load to show all PGs)
  window.fetchAndRenderPGs = async function fetchAndRenderPGs(forceAll = false) {
    const grid = document.getElementById('pgCardsGrid');
    const loading = document.getElementById('pgLoading');
    const empty = document.getElementById('pgEmpty');
    const resultsCountEl = document.querySelector('.dashboard-results-count strong');

    if (!grid || !loading || !empty) return;

    // Build params and avoid identical back-to-back requests
    const params = forceAll ? new URLSearchParams() : buildQueryParams();
    const requestKey = params.toString();
    if (requestKey === lastRequestKey && isFetching) {
      // duplicate in-flight request: skip
      console.log('Skipping duplicate in-flight request');
      return;
    }
    if (requestKey === lastRequestKey && !isFetching) {
      // identical to last completed request: skip
      console.log('Skipping duplicate request (no filter change)');
      return;
    }
    lastRequestKey = requestKey;

    // Prepare candidate bases to try (fallbacks) and build URLs safely
    const candidateBases = [
      (window.API_BASE_URL || API_BASE_URL),
      '/api',
      'http://localhost:5000/api',
      'http://localhost:3000/api'
    ].filter(Boolean).map(b => String(b).replace(/\/$/, ''));

    // Debug logs
    console.log('Applied filters:', Object.fromEntries(params.entries()));
    console.log('Candidate API bases:', candidateBases);

    // UI: show loading
    loading.style.display = 'block';
    empty.style.display = 'none';

    // Remove previous cards (keep loading/empty)
    Array.from(grid.children).forEach(child => {
      if (child.id !== 'pgLoading' && child.id !== 'pgEmpty') grid.removeChild(child);
    });

    isFetching = true;
    try {
      let data = null;
      let listings = [];
      let lastErr = null;

      // Try each candidate base until one succeeds
      for (const base of candidateBases) {
        const attemptUrl = `${base}/pgs` + (params.toString() ? `?${params.toString()}` : '');
        console.log('Attempting API URL:', attemptUrl);
        try {
          const res = await fetch(attemptUrl, { method: 'GET' });
          if (!res.ok) {
            lastErr = new Error(`Server returned ${res.status} for ${attemptUrl}`);
            console.warn(lastErr);
            continue; // try next base
          }
          data = await res.json();
          listings = Array.isArray(data) ? data : (Array.isArray(data.listings) ? data.listings : []);
          // Successful fetch — break out
          break;
        } catch (errAttempt) {
          lastErr = errAttempt;
          console.warn('Attempt failed:', attemptUrl, errAttempt);
          // try next base
        }
      }

      // Log fetched count
      console.log('Fetched PG count:', Array.isArray(listings) ? listings.length : 0);

      if (!Array.isArray(listings) || listings.length === 0) {
        // No results or empty array
        empty.style.display = 'block';
        empty.querySelector('h3') && (empty.querySelector('h3').textContent = 'No PGs found for selected filters');
        resultsCountEl && (resultsCountEl.textContent = '0');
        return;
      }

      // Always sort results by distance on frontend (nearest first)
      sortByDistance(listings);

      // Render cards using the same structure used by the page; do not change layout
      listings.forEach(listing => {
        const card = document.createElement('div');
        card.className = 'pg-card';
        const name = listing.name || 'PG';
        const rent = Number(listing.rent || 0);
        const distance = listing.distance || 0;
        let facilities = [];
        if (Array.isArray(listing.facilities)) facilities = listing.facilities;
        else if (typeof listing.facilities === 'string') facilities = listing.facilities.split(',').map(s => s.trim()).filter(Boolean);

        card.innerHTML = `
          <img src="${escapeHtml(listing.image || `https://via.placeholder.com/400x200?text=${encodeURIComponent(name)}`)}" alt="${escapeHtml(name)}" class="pg-card-image">
          <div class="pg-card-body">
            <div class="pg-card-header">
              <h3 class="pg-card-name">${escapeHtml(name)}</h3>
              <div class="pg-card-location">
                <svg class="pg-card-location-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                <span>${escapeHtml(listing.college || listing.city || listing.address || 'Location')}</span>
              </div>
            </div>
            <div class="pg-card-details">
              <div class="pg-card-rent">
                <span class="pg-card-rent-amount">₹${rent.toLocaleString('en-IN')}</span>
                <span class="pg-card-rent-period">per month</span>
              </div>
              <div class="pg-card-distance">
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                ${escapeHtml(String(distance) + ' km')}
              </div>
            </div>
            <div class="pg-card-facilities">
              <div class="pg-card-facilities-title">Facilities</div>
              <div class="pg-card-facilities-list">
                ${facilities.length ? facilities.map(f => `<span class="pg-card-facility-badge"><span class="pg-card-facility-icon">${escapeHtml(({
                  wifi: '📶', ac: '❄️', laundry: '🧺', parking: '🚗', food: '🍽️', security: '🔒', water: '💧', tv: '📺'
                }[f]) || '•')}</span>${escapeHtml(String(f).charAt(0).toUpperCase() + String(f).slice(1))}</span>`).join('') : '<span style="color:var(--neutral-500); font-size:var(--font-size-sm);">No facilities listed</span>'}
              </div>
            </div>
            <div class="pg-card-footer">
              <a href="pg-details.html?id=${encodeURIComponent(listing.id || '')}" class="btn btn-primary pg-card-button" style="text-decoration: none; display: block; text-align: center;">View Details</a>
            </div>
          </div>
        `;
        grid.appendChild(card);
      });

      resultsCountEl && (resultsCountEl.textContent = String(listings.length));
    } catch (err) {
      console.error('Failed to load PG listings (all attempts):', err);
      empty.style.display = 'block';
      empty.querySelector('h3') && (empty.querySelector('h3').textContent = 'Unable to load listings');
    } finally {
      loading.style.display = 'none';
      isFetching = false;
    }
  };

  // Wire facilities checkboxes to trigger debounced fetches
  (function attachFacilityListeners() {
    const facilityEls = Array.from(document.querySelectorAll('input[name="facilities"]'));
    if (!facilityEls.length) return;
    const debouncedFetch = debounce(() => { try { window.fetchAndRenderPGs(); } catch (e) { console.error(e); } }, 300);
    facilityEls.forEach(cb => {
      cb.addEventListener('change', (e) => {
        console.log('Facility filter changed:', e.target.value, e.target.checked);
        debouncedFetch();
      });
    });
  })();

  // The page's inline script already attaches listeners that call `fetchAndRenderPGs`.
  // We ensure an initial call to load data once everything is ready.
  // Debounce the initial call to avoid rapid double-calls from other handlers.
  const debouncedInitial = debounce(() => {
    try { window.fetchAndRenderPGs(true); } catch (e) { console.error(e); }
  }, 150);
  debouncedInitial();
});

