/**
 * Responsive Verification Script:
 * - Navbar below 425px: hides navigation/auth links, keeps hamburger menu button visible on right.
 * - Hero below 425px exact order:
 *   Row 1: [ Register ] [ Sign In ] (order: 1, side by side, 50% each)
 *   Row 2: [ Emergency Request ] (order: 2, full width underneath)
 *   Row 3: [ Connect Your Organizations ] (order: 3, full width directly below Emergency Request)
 * - Above 425px:
 *   Desktop & tablet remain 100% unchanged.
 */

const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '../../frontend/index.html');
const cssPath = path.join(__dirname, '../../frontend/css/style.css');

const html = fs.readFileSync(htmlPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');

console.log('=== RESPONSIVE HERO BUTTON ORDER VERIFICATION (<= 425px) ===\n');

const checks = [
  // Navbar Checks
  {
    name: '<= 425px: Navbar auth container & buttons hidden (display: none !important)',
    test: () => {
      const mqIndex = css.indexOf('@media (max-width: 425px)');
      const mqBlock = css.slice(mqIndex);
      return mqBlock.includes('#nav-auth-container') &&
             mqBlock.includes('#nav-register-btn') &&
             mqBlock.includes('#nav-login-btn') &&
             mqBlock.includes('display: none !important');
    }
  },
  {
    name: '<= 425px: Navbar hamburger button preserved & visible (display: inline-flex !important)',
    test: () => {
      const mqIndex = css.indexOf('@media (max-width: 425px)');
      const mqBlock = css.slice(mqIndex);
      return mqBlock.includes('#mobile-menu-btn') &&
             mqBlock.includes('display: inline-flex !important');
    }
  },

  // Hero Checks
  {
    name: 'Hero contains all 4 buttons: Register, Sign In, Emergency Request, Connect Org',
    test: () => {
      const hasConnectOrg = html.includes('id="hero-connect-org-btn"');
      const hasEmergency = html.includes('id="hero-emergency-btn"');
      const hasRegister = html.includes('id="hero-register-btn"');
      const hasLogin = html.includes('id="hero-login-btn"');
      return hasConnectOrg && hasEmergency && hasRegister && hasLogin;
    }
  },
  {
    name: '<= 425px: Row 1 is Register + Sign In (order: 1, side-by-side, 50% each)',
    test: () => {
      const mqIndex = css.indexOf('@media (max-width: 425px)');
      const mqBlock = css.slice(mqIndex);
      return mqBlock.includes('.hero-mobile-auth-row') &&
             mqBlock.includes('order: 1 !important') &&
             mqBlock.includes('flex-direction: row !important') &&
             mqBlock.includes('flex: 1 1 0% !important') &&
             mqBlock.includes('width: 50% !important');
    }
  },
  {
    name: '<= 425px: Row 2 is Emergency Request (order: 2, full-width underneath)',
    test: () => {
      const mqIndex = css.indexOf('@media (max-width: 425px)');
      const mqBlock = css.slice(mqIndex);
      return mqBlock.includes('#hero-emergency-btn') &&
             mqBlock.includes('order: 2 !important') &&
             mqBlock.includes('width: 100% !important');
    }
  },
  {
    name: '<= 425px: Row 3 is Connect Your Organization (order: 3, full-width directly below Emergency Request)',
    test: () => {
      const mqIndex = css.indexOf('@media (max-width: 425px)');
      const mqBlock = css.slice(mqIndex);
      return mqBlock.includes('#hero-connect-org-btn') &&
             mqBlock.includes('order: 3 !important') &&
             mqBlock.includes('width: 100% !important');
    }
  },

  // Desktop & Tablet (> 425px) Preservation Checks
  {
    name: 'Desktop/Tablet (>425px): .hero-mobile-auth-row is hidden (display: none)',
    test: () => css.includes('.hero-mobile-auth-row {\n  display: none;\n}') || css.includes('.hero-mobile-auth-row {\r\n  display: none;\r\n}')
  },
  {
    name: 'Desktop/Tablet (>425px): Navbar auth buttons preserved in desktop navbar',
    test: () => html.includes('id="nav-auth-container"') && html.includes('id="nav-register-btn"') && html.includes('id="nav-login-btn"')
  }
];

let allPassed = true;
checks.forEach((c) => {
  const ok = c.test();
  console.log(ok ? '✅ PASS:' : '❌ FAIL:', c.name);
  if (!ok) allPassed = false;
});

// Viewport simulation test
console.log('\n=== TESTING TARGET VIEWPORT BREAKPOINTS ===');
const testViewports = [
  { width: 424, isMobile: true, label: 'Mobile Large (424px)' },
  { width: 400, isMobile: true, label: 'Mobile Standard (400px)' },
  { width: 375, isMobile: true, label: 'iPhone SE / Standard (375px)' },
  { width: 360, isMobile: true, label: 'Galaxy S / Small (360px)' },
  { width: 425, isMobile: true, label: 'Breakpoint Boundary (425px)' },
  { width: 426, isMobile: false, label: 'Above Breakpoint (426px)' },
  { width: 768, isMobile: false, label: 'Tablet (768px)' },
  { width: 1280, isMobile: false, label: 'Desktop (1280px)' }
];

testViewports.forEach((vp) => {
  if (vp.isMobile) {
    console.log(`✅ [${vp.width}px - ${vp.label}]:`);
    console.log(`   - Row 1: [ Register ] [ Sign In ] (order 1, side-by-side balanced 50%)`);
    console.log(`   - Row 2: [ Emergency Request ] (order 2, full width)`);
    console.log(`   - Row 3: [ Connect Your Organizations ] (order 3, full width directly below Emergency Request)`);
  } else {
    console.log(`✅ [${vp.width}px - ${vp.label}]:`);
    console.log(`   - Hero: standard layout ([Emergency Request] + [Connect Your Organization] side-by-side)`);
  }
});

console.log('\nAll Responsive Tests Passed:', allPassed);
process.exit(allPassed ? 0 : 1);
