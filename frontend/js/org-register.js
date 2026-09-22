/**
 * ============================================================================
 * BLOOD BANK PLATFORM — ORGANIZATION ONBOARDING CLIENT SCRIPT
 * ============================================================================
 * Architecture Reference: BLOOD_BANK_PLATFORM_PLAN.md (§9, §11, §12, §21)
 *
 * Manages client-side interaction for organization onboarding:
 * - URL query parameter pre-selection (?type=HOSPITAL|CLINIC|BLOOD_BANK)
 * - Interactive organization type card toggle
 * - Strict client-side validation & inline error reporting
 * - Double-submission prevention & loading state indicators
 * - Seamless registration submission & success screen presentation
 */

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('orgRegisterForm');
  const submitBtn = document.getElementById('submitBtn');
  const btnText = document.getElementById('btnText');
  const btnArrow = document.getElementById('btnArrow');
  const btnSpinner = document.getElementById('btnSpinner');

  const alertBox = document.getElementById('alertBox');
  const alertIcon = document.getElementById('alertIcon');
  const alertMessage = document.getElementById('alertMessage');

  const registrationContainer = document.getElementById('registrationContainer');
  const successScreen = document.getElementById('successScreen');
  const successOrgName = document.getElementById('successOrgName');
  const successOrgType = document.getElementById('successOrgType');
  const successAdminName = document.getElementById('successAdminName');

  let isSubmitting = false;

  // --------------------------------------------------------------------------
  // 1. Organization Type Card Selection & URL Param Parsing
  // --------------------------------------------------------------------------
  const typeCards = document.querySelectorAll('.org-type-card');
  const typeRadios = document.querySelectorAll('input[name="org_type"]');

  function selectOrgType(typeValue) {
    typeRadios.forEach((radio) => {
      if (radio.value === typeValue) {
        radio.checked = true;
      }
    });

    typeCards.forEach((card) => {
      const cardInput = card.querySelector('input[type="radio"]');
      if (cardInput && cardInput.value === typeValue) {
        card.classList.add('org-card-active');
      } else {
        card.classList.remove('org-card-active');
      }
    });
  }

  // Bind click event to each card
  typeCards.forEach((card) => {
    card.addEventListener('click', () => {
      const input = card.querySelector('input[type="radio"]');
      if (input) {
        selectOrgType(input.value);
      }
    });
  });

  // Pre-select based on URL query parameter (e.g. ?type=CLINIC)
  const urlParams = new URLSearchParams(window.location.search);
  const initialType = (urlParams.get('type') || 'HOSPITAL').toUpperCase();
  if (['HOSPITAL', 'CLINIC', 'BLOOD_BANK'].includes(initialType)) {
    selectOrgType(initialType);
  } else {
    selectOrgType('HOSPITAL');
  }

  // --------------------------------------------------------------------------
  // 2. Alert Box Display Helpers
  // --------------------------------------------------------------------------
  function showAlert(message, type = 'error') {
    alertBox.classList.remove('hidden');
    alertMessage.textContent = message;

    if (type === 'error') {
      alertBox.className = 'mb-6 p-4 rounded-xl text-sm border flex items-start gap-3 bg-red-50 border-red-200 text-red-800';
      alertIcon.textContent = '❌';
    } else if (type === 'warning') {
      alertBox.className = 'mb-6 p-4 rounded-xl text-sm border flex items-start gap-3 bg-amber-50 border-amber-200 text-amber-800';
      alertIcon.textContent = '⚠️';
    } else {
      alertBox.className = 'mb-6 p-4 rounded-xl text-sm border flex items-start gap-3 bg-emerald-50 border-emerald-200 text-emerald-800';
      alertIcon.textContent = '✓';
    }

    alertBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function hideAlert() {
    alertBox.classList.add('hidden');
  }

  // --------------------------------------------------------------------------
  // 3. Inline Field Error Display Helpers
  // --------------------------------------------------------------------------
  function setFieldError(fieldId, errorElementId, message) {
    const input = document.getElementById(fieldId);
    const errorEl = document.getElementById(errorElementId);
    if (input) {
      input.classList.add('border-red-500', 'focus:ring-red-500', 'bg-red-50/20');
      input.classList.remove('border-slate-300');
    }
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.remove('hidden');
    }
  }

  function clearAllErrors() {
    hideAlert();
    const errorEls = document.querySelectorAll('[id$="Error"]');
    errorEls.forEach((el) => {
      el.textContent = '';
      el.classList.add('hidden');
    });

    const inputs = form.querySelectorAll('input');
    inputs.forEach((input) => {
      input.classList.remove('border-red-500', 'focus:ring-red-500', 'bg-red-50/20');
      input.classList.add('border-slate-300');
    });
  }

  // --------------------------------------------------------------------------
  // 4. Form Validation Logic
  // --------------------------------------------------------------------------
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d).{8,72}$/;

  function validateForm(data) {
    let isValid = true;
    let firstErrorField = null;

    clearAllErrors();

    // Org Name
    if (!data.organization.name || data.organization.name.trim().length < 2) {
      setFieldError('orgNameInput', 'orgNameError', 'Organization legal name must be at least 2 characters.');
      isValid = false;
      firstErrorField = firstErrorField || 'orgNameInput';
    }

    // Org Email
    if (!data.organization.email || !emailRegex.test(data.organization.email)) {
      setFieldError('orgEmailInput', 'orgEmailError', 'Please enter a valid organization email address.');
      isValid = false;
      firstErrorField = firstErrorField || 'orgEmailInput';
    }

    // Org Phone
    if (!data.organization.phone || data.organization.phone.trim().length < 5) {
      setFieldError('orgPhoneInput', 'orgPhoneError', 'Organization phone number is required (min 5 digits).');
      isValid = false;
      firstErrorField = firstErrorField || 'orgPhoneInput';
    }

    // Org Address
    if (!data.organization.address || data.organization.address.trim().length < 3) {
      setFieldError('orgAddressInput', 'orgAddressError', 'Street address or facility location is required.');
      isValid = false;
      firstErrorField = firstErrorField || 'orgAddressInput';
    }

    // Org City
    if (!data.organization.city || data.organization.city.trim().length < 2) {
      setFieldError('orgCityInput', 'orgCityError', 'City is required.');
      isValid = false;
      firstErrorField = firstErrorField || 'orgCityInput';
    }

    // Org Country
    if (!data.organization.country || data.organization.country.trim().length < 2) {
      setFieldError('orgCountryInput', 'orgCountryError', 'Country is required.');
      isValid = false;
      firstErrorField = firstErrorField || 'orgCountryInput';
    }

    // Admin Full Name
    if (!data.admin.name || data.admin.name.trim().length < 2) {
      setFieldError('adminNameInput', 'adminNameError', 'Administrator full name is required (min 2 characters).');
      isValid = false;
      firstErrorField = firstErrorField || 'adminNameInput';
    }

    // Admin Email
    if (!data.admin.email || !emailRegex.test(data.admin.email)) {
      setFieldError('adminEmailInput', 'adminEmailError', 'Please enter a valid administrator email address.');
      isValid = false;
      firstErrorField = firstErrorField || 'adminEmailInput';
    }

    // Admin Password
    if (!data.admin.password || !passwordRegex.test(data.admin.password)) {
      setFieldError(
        'adminPasswordInput',
        'passwordError',
        'Password must be at least 8 characters and include at least one letter and one number.'
      );
      isValid = false;
      firstErrorField = firstErrorField || 'adminPasswordInput';
    }

    // Admin Confirm Password
    if (data.admin.password !== data.admin.confirm_password) {
      setFieldError('confirmPasswordInput', 'confirmPasswordError', 'Passwords do not match. Please re-enter.');
      isValid = false;
      firstErrorField = firstErrorField || 'confirmPasswordInput';
    }

    if (!isValid && firstErrorField) {
      const el = document.getElementById(firstErrorField);
      if (el) el.focus();
    }

    return isValid;
  }

  // --------------------------------------------------------------------------
  // 5. Submit Handler & API Call
  // --------------------------------------------------------------------------
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (isSubmitting) return;

    // Collect Form Values
    const selectedOrgType = form.querySelector('input[name="org_type"]:checked')?.value || 'HOSPITAL';

    const payload = {
      organization: {
        name: document.getElementById('orgNameInput').value.trim(),
        type: selectedOrgType,
        email: document.getElementById('orgEmailInput').value.trim().toLowerCase(),
        phone: document.getElementById('orgPhoneInput').value.trim(),
        address: document.getElementById('orgAddressInput').value.trim(),
        city: document.getElementById('orgCityInput').value.trim(),
        country: document.getElementById('orgCountryInput').value.trim(),
        license_number: document.getElementById('orgLicenseInput').value.trim() || null
      },
      admin: {
        name: document.getElementById('adminNameInput').value.trim(),
        email: document.getElementById('adminEmailInput').value.trim().toLowerCase(),
        phone: document.getElementById('adminPhoneInput').value.trim() || null,
        password: document.getElementById('adminPasswordInput').value,
        confirm_password: document.getElementById('confirmPasswordInput').value
      }
    };

    // Client-side Validation
    if (!validateForm(payload)) {
      showAlert('Please correct the errors indicated below before submitting.', 'warning');
      return;
    }

    // Set Loading State
    isSubmitting = true;
    submitBtn.disabled = true;
    btnText.textContent = 'Submitting Registration...';
    btnArrow.classList.add('hidden');
    btnSpinner.classList.remove('hidden');
    hideAlert();

    try {
      const response = await fetch('/api/organizations/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json().catch(() => null);

      if (response.status === 201 && result && result.success) {
        // Success: Show Registration Submitted Screen
        registrationContainer.classList.add('hidden');
        successScreen.classList.remove('hidden');

        // Populate summary card
        successOrgName.textContent = result.organization?.name || payload.organization.name;
        
        // Format friendly organization type
        const typeMap = {
          HOSPITAL: 'Hospital (Inpatient Care)',
          CLINIC: 'Clinic (Outpatient Care)',
          BLOOD_BANK: 'Blood Bank (Collection & Inventory)'
        };
        successOrgType.textContent = typeMap[result.organization?.type] || result.organization?.type || payload.organization.type;
        successAdminName.textContent = result.admin?.name || payload.admin.name;

        window.scrollTo({ top: 0, behavior: 'smooth' });

      } else if (response.status === 409) {
        // Duplicate Error (Email collision)
        const errorMsg = result?.error?.message || 'An organization or account with this email is already registered.';
        showAlert(errorMsg, 'warning');

        if (result?.error?.code === 'ORGANIZATION_EMAIL_EXISTS') {
          setFieldError('orgEmailInput', 'orgEmailError', errorMsg);
          document.getElementById('orgEmailInput').focus();
        } else if (result?.error?.code === 'EMAIL_ALREADY_EXISTS') {
          setFieldError('adminEmailInput', 'adminEmailError', errorMsg);
          document.getElementById('adminEmailInput').focus();
        }

      } else if (response.status === 400) {
        // Validation Error from Server
        const errorMsg = result?.error?.message || 'Invalid registration details provided.';
        showAlert(errorMsg, 'error');

        if (result?.error?.details && Array.isArray(result.error.details)) {
          result.error.details.forEach((d) => {
            if (d.field.includes('organization.name')) setFieldError('orgNameInput', 'orgNameError', d.message);
            if (d.field.includes('organization.email')) setFieldError('orgEmailInput', 'orgEmailError', d.message);
            if (d.field.includes('organization.phone')) setFieldError('orgPhoneInput', 'orgPhoneError', d.message);
            if (d.field.includes('organization.address')) setFieldError('orgAddressInput', 'orgAddressError', d.message);
            if (d.field.includes('organization.city')) setFieldError('orgCityInput', 'orgCityError', d.message);
            if (d.field.includes('admin.name')) setFieldError('adminNameInput', 'adminNameError', d.message);
            if (d.field.includes('admin.email')) setFieldError('adminEmailInput', 'adminEmailError', d.message);
            if (d.field.includes('password')) setFieldError('adminPasswordInput', 'passwordError', d.message);
          });
        }

      } else if (response.status === 429) {
        showAlert('Too many registration requests. Please wait a few minutes before trying again.', 'warning');
      } else {
        const errorMsg = result?.error?.message || 'A network or server error occurred. Please try again later.';
        showAlert(errorMsg, 'error');
      }

    } catch (err) {
      console.error('Organization registration submission failure:', err);
      showAlert('Unable to reach the server. Please verify your connection and try again.', 'error');
    } finally {
      // Reset Button State
      isSubmitting = false;
      submitBtn.disabled = false;
      btnText.textContent = 'Submit Organization Registration';
      btnArrow.classList.remove('hidden');
      btnSpinner.classList.add('hidden');
    }
  });
});
