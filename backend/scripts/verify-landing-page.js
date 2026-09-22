/**
 * Comprehensive Landing Page UI & Navigation Verification Script
 */

async function verifyLandingPage() {
  const res = await fetch('http://localhost:5000/');
  console.log('Landing Page HTTP Status:', res.status);
  const html = await res.text();

  const checks = [
    // Navbar Checks
    {
      name: 'Navbar has Register button pointing to /register.html',
      ok: html.includes('href="/register.html"') && html.includes('Register')
    },
    {
      name: 'Navbar has separate Sign In button pointing to /login.html',
      ok: html.includes('href="/login.html"') && html.includes('Sign In')
    },
    {
      name: 'Emergency Request removed from navbar #nav-auth-container',
      ok: !html.includes('id="nav-auth-container">\n          <a href="#emergency"')
    },
    {
      name: 'Combined "Staff & Donor Sign In" button replaced with clean "Sign In"',
      ok: !html.includes('Staff & Donor Sign In') && html.includes('Sign In')
    },
    {
      name: 'Authenticated navbar features Profile Icon (#nav-profile-btn) with role-based link',
      ok: html.includes('id="nav-profile-btn"') && html.includes('data-profile-link')
    },

    // Hero Checks
    {
      name: 'Hero heading intact ("Multi-Hospital Blood Availability & Traceable Unit Coordination")',
      ok: html.includes('Multi-Hospital Blood Availability &') && html.includes('Traceable Unit') && html.includes('Coordination')
    },
    {
      name: 'Hero description intact',
      ok: html.includes('Unifying hospitals, regional blood banks') && html.includes('individual blood units from voluntary donation to bedside issuing')
    },
    {
      name: 'Live API status indicator badge REMOVED from the hero',
      ok: !html.includes('Connecting to backend service...') && !html.includes('Inspect API')
    },
    {
      name: 'Hero CTA 1: Emergency Request is compact primary solid red (btn-hero-emergency) pointing to /emergency.html',
      ok: html.includes('id="hero-emergency-btn"') && html.includes('href="/emergency.html"') && html.includes('btn-hero-emergency') && html.includes('Emergency Request')
    },
    {
      name: 'Hero CTA 2: Connect Your Organization is compact glassmorphic secondary (btn-hero-connect-org) pointing to /register-organization.html',
      ok: html.includes('id="hero-connect-org-btn"') && html.includes('href="/register-organization.html"') && html.includes('btn-hero-connect-org') && html.includes('Connect Your Organization')
    },
    {
      name: 'Both hero buttons configured side-by-side on desktop (sm:flex-row)',
      ok: html.includes('sm:flex-row') && html.includes('max-w-md')
    },
    {
      name: 'Instant Availability Search card preserved directly below hero CTAs',
      ok: html.includes('id="search"') && html.includes('Instant Availability Search')
    },
    {
      name: 'Telemetry details bar preserved below search card',
      ok: html.includes('id="telemetry-bar"') && html.includes('id="telemetry-env"') && html.includes('id="telemetry-latency"')
    },

    // Visuals & Branding Preserved
    {
      name: 'BloodLink branding and Network badge preserved',
      ok: html.includes('Blood<span class="text-red-600">Link</span>') && html.includes('Network')
    },
    {
      name: 'Floating platelets and cells simulation preserved',
      ok: html.includes('cell-float-1') && html.includes('platelets-canvas')
    },
    {
      name: 'Scroll-to-top floating button and animated smooth scroll configured',
      ok: html.includes('id="scroll-to-top"') && html.includes('btn-scroll-top') && html.includes('smoothScrollToTop')
    }
  ];

  console.log('\n=== LANDING PAGE UI VERIFICATION CHECKS ===');
  let allOk = true;
  checks.forEach((c) => {
    console.log(c.ok ? '✅' : '❌', c.name);
    if (!c.ok) allOk = false;
  });

  // Verify connected routes return HTTP 200
  console.log('\n=== ROUTE CONNECTIVITY CHECKS ===');
  const routes = [
    { path: '/register.html', label: 'User Registration' },
    { path: '/login.html', label: 'User Login / Sign In' },
    { path: '/register-organization.html', label: 'Organization Onboarding' },
    { path: '/emergency.html', label: 'Emergency Request Triage' }
  ];

  for (const r of routes) {
    const rRes = await fetch(`http://localhost:5000${r.path}`);
    const rOk = rRes.status === 200;
    console.log(rOk ? '✅' : '❌', `${r.label} (GET ${r.path}) -> HTTP ${rRes.status}`);
    if (!rOk) allOk = false;
  }

  console.log('\nAll landing page checks passed:', allOk);
  if (!allOk) process.exit(1);
}

verifyLandingPage().catch((err) => {
  console.error('Verification failed:', err.message);
  process.exit(1);
});
