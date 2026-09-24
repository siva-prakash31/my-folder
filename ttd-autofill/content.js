// 1. Pre-fill your group's details here
const pilgrims = [
  // Keep idType as "Aadhar" (script will automatically match "Aadhaar Card")
  // Replace with your exact 12 digits for EACH person.
   { name: "Firstname Lastname", age: "30", gender: "Male", idType: "Aadhar", idNum: "123456789012" },
  { name: "Second Person", age: "28", gender: "Female", idType: "Aadhar", idNum: "123456789013" },
];

// 2. Pre-fill your contact details here
const contactDetails = {
  email: "your.email@example.com",
  city: "Hyderabad",
  state: "Telangana",
  country: "India",
  pincode: "500001"
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ADVANCED SETTER: writes plain text fields (name, age, email, city, pincode) in one shot
function setNativeValue(element, value) {
  if (!element) return;
  if (element.disabled) element.removeAttribute('disabled');

  element.focus();
  element.dispatchEvent(new Event("focus", { bubbles: true }));

  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  nativeInputValueSetter.call(element, value);

  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));

  element.blur();
  element.dispatchEvent(new Event("blur", { bubbles: true }));
}

// CHARACTER-BY-CHARACTER SETTER: for fields with a formatter/validator that only
// processes input correctly when it arrives incrementally (like real typing).
// This is the fix for the ID-number-losing-a-digit issue.
async function typeNativeValue(element, value) {
  if (!element) return;
  element.removeAttribute('disabled');

  // Some sites cap maxlength dynamically after the ID Type is chosen, and that
  // attribute may not have caught up yet when we write into the field. Widen it
  // temporarily just in case, then restore it afterward.
  const originalMaxLength = element.getAttribute('maxlength');
  element.setAttribute('maxlength', String(value.length));

  element.focus();
  element.dispatchEvent(new Event('focus', { bubbles: true }));

  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;

  nativeInputValueSetter.call(element, '');
  element.dispatchEvent(new Event('input', { bubbles: true }));

  for (const char of value) {
    const newValue = element.value + char;
    nativeInputValueSetter.call(element, newValue);
    element.dispatchEvent(new InputEvent('input', { bubbles: true, data: char, inputType: 'insertText' }));
    await delay(30); // bump this up (e.g. 60) if digits are still getting dropped
  }

  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.blur();
  element.dispatchEvent(new Event('blur', { bubbles: true }));

  if (originalMaxLength !== null) {
    element.setAttribute('maxlength', originalMaxLength);
  }

  if (element.value !== value) {
    console.warn(`ID number mismatch — expected "${value}" but field shows "${element.value}"`);
  }
}

// Polls for the dropdown's option list to appear. Prefers the real container
// (.dropdown_scroll li) confirmed from the live site; falls back to a broader
// scan only if that specific structure isn't found (e.g. a different field).
async function waitForOptions() {
  let options = [];
  for (let attempt = 0; attempt < 10; attempt++) {
    await delay(150);

    const scoped = document.querySelectorAll('.dropdown_scroll li');
    if (scoped.length > 0) {
      options = Array.from(scoped).filter(el => el.textContent && el.getBoundingClientRect().height > 0);
      if (options.length > 0) break;
    }

    options = Array.from(document.querySelectorAll('li, div, span, mat-option, [role="option"]'))
      .filter(el => el.textContent && el.getBoundingClientRect().height > 0);
    if (options.length > 0) break;
  }
  return options;
}

// Waits for a selector to exist AND be enabled — used for fields (like ID Number)
// that only get unlocked after a previous field (like ID Type) is chosen.
async function waitForElement(selector, timeoutMs = 3000) {
  const start = Date.now();
  let el = null;
  while (Date.now() - start < timeoutMs) {
    el = document.querySelector(selector);
    if (el && !el.disabled) return el;
    await delay(100);
  }
  return el; // may be null or still disabled — caller should check
}

// POPUP CLICKER: opens the dropdown, waits for it to actually render, then picks
// the option that EXACTLY matches (falling back to substring only if nothing
// matches exactly). This avoids "Male" wrongly matching inside "Female".
async function setPopupValue(element, value) {
  if (!element) return;

  element.scrollIntoView({ block: 'center', behavior: 'smooth' });
  await delay(100);

  element.focus();
  element.dispatchEvent(new Event('focus', { bubbles: true }));
  element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  element.click();

  if (element.nextElementSibling && element.nextElementSibling.tagName === 'IMG') {
    element.nextElementSibling.click();
  }

  let options = await waitForOptions();

  // Fallback: some fields are filterable autocompletes that show zero options
  // until you start typing. If the click alone produced nothing, try typing
  // the target value into the field to trigger the filtered list.
  if (options.length === 0) {
    const wasReadonly = element.hasAttribute('readonly');
    element.removeAttribute('readonly');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(element, value);
    element.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
    options = await waitForOptions();
    if (wasReadonly) element.setAttribute('readonly', '');
  }

  const normalize = (s) => s.toLowerCase().trim().replace(/\s+/g, '').replace(/aadhaar/g, 'aadhar');
  const targetText = normalize(value);

  // Pass 1: exact match only
  let match = null;
  for (let i = options.length - 1; i >= 0; i--) {
    if (normalize(options[i].textContent) === targetText) {
      match = options[i];
      break;
    }
  }

  // Pass 2: fall back to substring match only if nothing matched exactly.
  // Guard against near-empty text (e.g. a stray whitespace-only element),
  // since an empty string is technically a "substring" of everything.
  if (!match) {
    for (let i = options.length - 1; i >= 0; i--) {
      const currentText = normalize(options[i].textContent);
      if (currentText.length > 1 && (currentText.includes(targetText) || targetText.includes(currentText))) {
        match = options[i];
        break;
      }
    }
  }

  if (match) {
    match.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    match.click();
    match.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  } else {
    console.warn(`No dropdown option matched for value: "${value}". Trigger element:`, element);
  }

  element.dispatchEvent(new Event("blur", { bubbles: true }));
}

// Main autofill sequence
async function executeAutofill() {
  console.log("Starting advanced autofill sequence...");

  for (let i = 0; i < pilgrims.length; i++) {
    const person = pilgrims[i];

    const nameEl = document.querySelector(`input[name="fname"][id="${i}"]`);
    setNativeValue(nameEl, person.name);
    await delay(150);

    const ageEl = document.querySelector(`input[name="age"][id="${i}"]`);
    setNativeValue(ageEl, person.age);
    await delay(150);

    const genderEl = document.querySelector(`input[name="gender"][id="${i}"]`);
    await setPopupValue(genderEl, person.gender);
    await delay(600); // give the gender overlay time to fully close before opening the next one

    const idTypeEl = document.querySelector(`input[name="photoIdType"][id="${i}"]`);
    await setPopupValue(idTypeEl, person.idType);
    await delay(450);

    const idNumEl = await waitForElement(`input[name="idProofNumber"][id="${i}"]`);
    if (!idNumEl) {
      console.warn(`Row ${i}: ID number field never appeared/enabled — ID Type probably wasn't selected. Check the warning above.`);
    } else {
      await typeNativeValue(idNumEl, person.idNum);
    }
    await delay(200);
  }

  const emailEl = document.querySelector('input[type="email"], input[name="emailId"]');
  setNativeValue(emailEl, contactDetails.email);

  const cityEl = document.querySelector('input[name="city"]');
  setNativeValue(cityEl, contactDetails.city);

  const pincodeEl = document.querySelector('input[name="zipCode"], input[name="pincode"]');
  setNativeValue(pincodeEl, contactDetails.pincode);

  const stateEl = document.querySelector('input[name="state"]');
  setNativeValue(stateEl, contactDetails.state);
 
  const countryEl = document.querySelector('input[name="country"]');
  setNativeValue(countryEl, contactDetails.country);

  console.log("Autofill process completed.");
}

const triggerBtn = document.createElement("button");
triggerBtn.innerText = "⚡ Fill All Details";
triggerBtn.style.cssText = `
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 999999;
  padding: 12px 20px;
  background-color: #ff6600;
  color: #ffffff;
  font-size: 14px;
  font-weight: bold;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  box-shadow: 0 4px 10px rgba(0,0,0,0.3);
`;

triggerBtn.onclick = (e) => {
  e.preventDefault();
  executeAutofill();
};

document.body.appendChild(triggerBtn);
